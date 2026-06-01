/**
 * Bambu Lab MQTT Poller
 *
 * Runs on the makerspace computer (same LAN as the printers).
 * Connects to each printer's local MQTT broker, reads live telemetry,
 * and writes status + queue lifecycle events to Supabase.
 *
 * Email logic (no Gmail credentials needed here):
 *   • Poller calls the Edge Function directly for "it's your turn" emails —
 *     only in genuine "you waited and now it's your turn" cases:
 *       - printer transitions printing → idle and someone was already waiting
 *       - previous head timed out and next person is promoted
 *   • Joining an already-idle empty queue does NOT send email (user can see
 *     the printer is available right there on the dashboard).
 *   • No-show/removal email: triggered by no_show_records INSERT webhook.
 *   • Print done/error email: triggered by printers UPDATE webhook.
 *
 * SETUP:
 *   1. Install Node.js  →  https://nodejs.org
 *   2. cd bambu-poller && npm install
 *   3. Copy .env.example to .env and fill in credentials.
 *   4. npm start
 */

require("dotenv").config();

const mqtt = require("mqtt");
const { createClient } = require("@supabase/supabase-js");

// ─── Configuration ─────────────────────────────────────────────────────────────

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;
const CLAIM_WINDOW_MS = 5 * 60 * 1000;

const PRINTER_CONFIG = [1, 2, 3, 4]
  .map((n) => ({
    supabaseId: process.env[`PRINTER_${n}_ID`],
    name: process.env[`PRINTER_${n}_NAME`] ?? `Bambu X1C #${n}`,
    ip: process.env[`PRINTER_${n}_IP`],
    serialNumber: process.env[`PRINTER_${n}_SN`],
    accessCode: process.env[`PRINTER_${n}_CODE`],
  }))
  .filter((p) => p.supabaseId && p.ip && p.serialNumber && p.accessCode);

// ─── Validate ──────────────────────────────────────────────────────────────────

for (const key of ["SUPABASE_URL", "SUPABASE_SERVICE_KEY"]) {
  if (!process.env[key]) {
    console.error(`Missing required env var ${key}.`);
    process.exit(1);
  }
}
if (PRINTER_CONFIG.length === 0) {
  console.error("No printers configured. Fill in PRINTER_1_* … in .env.");
  process.exit(1);
}

// ─── Clients ───────────────────────────────────────────────────────────────────

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

// ─── In-memory state ───────────────────────────────────────────────────────────

const lastStatus = {};
for (const p of PRINTER_CONFIG) lastStatus[p.supabaseId] = null;

// Debounce timers for printing→idle/error transitions.
// Bambu printers sometimes blip idle briefly mid-print; we wait before acting.
const printingEndTimers = {};

// ─── Helpers ───────────────────────────────────────────────────────────────────

function toStatus(gcodeState) {
  switch ((gcodeState ?? "").toUpperCase()) {
    case "RUNNING":
    case "PREPARE":
      return "printing";
    case "FAILED":
    case "PAUSE":
      return "error";
    default:
      return "idle";
  }
}

function errorCodeFromPayload(print) {
  if (typeof print.print_error === "number" && print.print_error !== 0) {
    return String(print.print_error);
  }
  const hms = Array.isArray(print.hms) ? print.hms : [];
  if (hms.length > 0 && hms[0] && (hms[0].code !== undefined || hms[0].attr !== undefined)) {
    return `HMS ${hms[0].attr ?? "?"}-${hms[0].code ?? "?"}`;
  }
  return null;
}

async function getQueue(printerId) {
  const { data, error } = await supabase
    .from("queues")
    .select("id, user_id, created_at, notified_at")
    .eq("printer_id", printerId)
    .order("created_at", { ascending: true });
  if (error) {
    console.error(`[queue] fetch error:`, error.message);
    return [];
  }
  return data ?? [];
}

async function getPrinterRow(printerId) {
  const { data } = await supabase
    .from("printers")
    .select("status, active_user_id")
    .eq("id", printerId)
    .single();
  return data ?? null;
}

// Call the Edge Function directly (no email credentials in this file).
// sendEmail=true  → sets notified_at AND triggers the "it's your turn" email.
// sendEmail=false → only sets notified_at (for countdown display); no email.
async function startClaimWindow(entry, sendEmail) {
  if (!entry) return;

  await supabase
    .from("queues")
    .update({ notified_at: new Date().toISOString() })
    .eq("id", entry.id);

  if (!sendEmail) return;

  // Derive Edge Function URL from the Supabase project URL.
  const edgeUrl = `${SUPABASE_URL}/functions/v1/send-notification`;
  try {
    const res = await fetch(edgeUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${SUPABASE_SERVICE_KEY}`,
      },
      body: JSON.stringify({
        type: "queue_notified",
        record: { user_id: entry.user_id, printer_id: entry.printer_id ?? entry.printerId },
      }),
    });
    if (!res.ok) {
      console.error(`[edge] send-notification returned ${res.status}`);
    }
  } catch (err) {
    console.error(`[edge] failed to call send-notification:`, err.message);
  }
}

// Removes the expired head. Inserting into no_show_records triggers the
// Edge Function webhook to send the "removed from waitlist" email.
async function expireHead(entry) {
  await supabase.from("no_show_records").insert({
    user_id: entry.user_id,
    printer_id: entry.printer_id,
    note: `Claim window (${CLAIM_WINDOW_MS / 60000} min) expired with no print started`,
  });

  const { data: profile } = await supabase
    .from("profiles")
    .select("strikes")
    .eq("id", entry.user_id)
    .single();
  await supabase
    .from("profiles")
    .update({ strikes: (profile?.strikes ?? 0) + 1 })
    .eq("id", entry.user_id);

  await supabase.from("queues").delete().eq("id", entry.id);

  // Promote the next person — they were waiting, so send email.
  const next = (await getQueue(entry.printer_id))[0] ?? null;
  await startClaimWindow(next, true);
}

// Called after a printing→idle transition: someone was already in the queue
// and waited through a print job, so they deserve the "it's your turn" email.
async function reconcileClaimWindow(printer) {
  const queue = await getQueue(printer.supabaseId);
  const head = queue[0];
  if (!head || head.notified_at) return;
  await startClaimWindow(head, true); // waited through a print → send email
}

// ─── State-machine handler ─────────────────────────────────────────────────────

async function handleTransition(printer, newStatus) {
  const prev = lastStatus[printer.supabaseId];
  lastStatus[printer.supabaseId] = newStatus;

  if (prev === null) {
    // First MQTT message after poller startup — clear stale active_user_id if needed.
    if (newStatus !== "printing") {
      await supabase
        .from("printers")
        .update({ active_user_id: null })
        .eq("id", printer.supabaseId);
    }
    return;
  }

  // If printer recovered back to printing, cancel any pending end-of-print logic.
  if (newStatus === "printing") {
    if (printingEndTimers[printer.supabaseId]) {
      console.log(`[${printer.name}] print resumed — cancelling end-of-print timer`);
      clearTimeout(printingEndTimers[printer.supabaseId]);
      delete printingEndTimers[printer.supabaseId];
    }
    return;
  }

  // Debounce printing→idle/error: wait 20 s before treating it as a real print end.
  // Bambu printers sometimes blip idle briefly mid-print (firmware quirk).
  if (prev === "printing") {
    clearTimeout(printingEndTimers[printer.supabaseId]);
    printingEndTimers[printer.supabaseId] = setTimeout(async () => {
      delete printingEndTimers[printer.supabaseId];
      const current = lastStatus[printer.supabaseId];
      if (current === "printing") return; // recovered within the window

      console.log(`[${printer.name}] print end confirmed (${current}) — clearing active_user_id`);
      await supabase
        .from("printers")
        .update({ active_user_id: null })
        .eq("id", printer.supabaseId);

      if (current === "idle") {
        await supabase
          .from("queues")
          .update({ notified_at: null })
          .eq("printer_id", printer.supabaseId);
        await reconcileClaimWindow(printer);
      }
    }, 20_000);
    return;
  }

  // Non-printing → idle (e.g. error cleared): reset notified_at so next head gets notified.
  if (newStatus === "idle" && prev !== "idle") {
    await supabase
      .from("queues")
      .update({ notified_at: null })
      .eq("printer_id", printer.supabaseId);
  }
}

// ─── Push telemetry to Supabase ────────────────────────────────────────────────

async function updatePrinter(printer, printPayload) {
  const status = toStatus(printPayload.gcode_state);
  const timeRemaining =
    typeof printPayload.mc_remaining_time === "number" ? printPayload.mc_remaining_time : null;
  const errorCode = status === "error" ? errorCodeFromPayload(printPayload) : null;

  const { error } = await supabase
    .from("printers")
    .update({ status, time_remaining: timeRemaining, error_code: errorCode, updated_at: new Date().toISOString() })
    .eq("id", printer.supabaseId);

  if (error) {
    console.error(`[${printer.name}] Supabase update error:`, error.message);
    return;
  }

  console.log(
    `[${printer.name}] ${status}  ${timeRemaining ?? "?"}m remaining${errorCode ? `  error=${errorCode}` : ""}`,
  );

  await handleTransition(printer, status);
}

// ─── Watchdog (every 60 s) ─────────────────────────────────────────────────────

async function claimWindowWatchdog() {
  // 1. Expire overdue windows.
  const cutoff = new Date(Date.now() - CLAIM_WINDOW_MS).toISOString();
  const { data: overdue, error } = await supabase
    .from("queues")
    .select("id, user_id, printer_id, notified_at")
    .not("notified_at", "is", null)
    .lt("notified_at", cutoff);

  if (error) {
    console.error("[watchdog] query error:", error.message);
  } else {
    for (const entry of overdue ?? []) {
      const row = await getPrinterRow(entry.printer_id);
      if (!row || row.status !== "idle" || row.active_user_id) continue;
      const cfg = PRINTER_CONFIG.find((p) => p.supabaseId === entry.printer_id);
      console.log(`[watchdog] claim window expired: user ${entry.user_id} on ${cfg?.name ?? entry.printer_id}`);
      await expireHead(entry);
    }
  }

  // 2. Clear stale active_user_id: any non-printing printer that still has one set
  //    means the poller missed the print-end transition (e.g. restarted mid-print).
  const { data: stale } = await supabase
    .from("printers")
    .select("id")
    .neq("status", "printing")
    .not("active_user_id", "is", null);

  for (const p of stale ?? []) {
    console.log(`[watchdog] clearing stale active_user_id on printer ${p.id}`);
    await supabase.from("printers").update({ active_user_id: null }).eq("id", p.id);
  }

  // 3. Reconcile missed windows: idle printers whose queue head has no notified_at.
  //    This happens when someone joins an already-idle printer (no MQTT transition).
  //    We set notified_at for the countdown display but do NOT send email —
  //    the user can already see the printer is available on the dashboard.
  const { data: idlePrinters } = await supabase
    .from("printers")
    .select("id")
    .eq("status", "idle");

  for (const printer of idlePrinters ?? []) {
    const queue = await getQueue(printer.id);
    const head = queue[0];
    if (head && !head.notified_at) {
      console.log(`[watchdog] setting countdown for user ${head.user_id} on idle printer ${printer.id} (no email)`);
      await startClaimWindow(head, false); // fresh join on idle → no email
    }
  }
}

setInterval(() => void claimWindowWatchdog(), 60_000);

// ─── MQTT ──────────────────────────────────────────────────────────────────────

function connectPrinter(printer) {
  const client = mqtt.connect(`mqtts://${printer.ip}`, {
    port: 8883,
    username: "bblp",
    password: printer.accessCode,
    rejectUnauthorized: false,
    reconnectPeriod: 5000,
    connectTimeout: 10_000,
  });

  client.on("connect", () => {
    console.log(`[${printer.name}] MQTT connected`);
    client.subscribe(`device/${printer.serialNumber}/report`, (err) => {
      if (err) console.error(`[${printer.name}] Subscribe error:`, err.message);
    });
  });

  client.on("message", (_topic, payload) => {
    let data;
    try { data = JSON.parse(payload.toString()); } catch { return; }
    if (data.print) void updatePrinter(printer, data.print);
  });

  client.on("reconnect", () => console.log(`[${printer.name}] reconnecting…`));
  client.on("error", (err) => console.error(`[${printer.name}] MQTT error:`, err.message));
  client.on("offline", () => console.warn(`[${printer.name}] offline`));
}

// ─── Main ──────────────────────────────────────────────────────────────────────

console.log("Bambu Poller starting — connecting to", PRINTER_CONFIG.length, "printers");
for (const printer of PRINTER_CONFIG) connectPrinter(printer);
