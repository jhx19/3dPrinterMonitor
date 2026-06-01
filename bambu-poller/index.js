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
const CLAIM_WINDOW_MS = 10 * 60 * 1000;

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
    // First MQTT message after poller startup. No transition to detect, but if
    // the printer is not printing and active_user_id is still set, the print
    // ended while the poller was offline — clear it now.
    if (newStatus !== "printing") {
      await supabase
        .from("printers")
        .update({ active_user_id: null })
        .eq("id", printer.supabaseId);
    }
    return;
  }

  if (prev === "printing" && (newStatus === "idle" || newStatus === "error")) {
    await supabase
      .from("printers")
      .update({ active_user_id: null })
      .eq("id", printer.supabaseId);
  }

  if (newStatus === "idle" && prev !== "idle") {
    await supabase
      .from("queues")
      .update({ notified_at: null })
      .eq("printer_id", printer.supabaseId);
  }
}

// ─── Push telemetry to Supabase ────────────────────────────────────────────────

async function updatePrinter(printer, printPayload) {
  const hasState = printPayload.gcode_state !== undefined && printPayload.gcode_state !== null;
  const hasTime = typeof printPayload.mc_remaining_time === "number";

  // Bambu pushes a full snapshot once on connect, then incremental reports that
  // carry only the fields that changed. A missing gcode_state means "this report
  // didn't include the run-state" — NOT "idle". Treating it as idle made the
  // status flap available↔printing and tripped the print-end cleanup that clears
  // active_user_id. So when gcode_state is absent we refresh time_remaining only
  // (if present) and never touch status / active_user_id / claim windows.
  if (!hasState) {
    if (hasTime) {
      const { error } = await supabase
        .from("printers")
        .update({ time_remaining: printPayload.mc_remaining_time, updated_at: new Date().toISOString() })
        .eq("id", printer.supabaseId);
      if (error) console.error(`[${printer.name}] Supabase update error:`, error.message);
    }
    return;
  }

  const status = toStatus(printPayload.gcode_state);
  // Only carry a remaining time while actually printing. Bambu reports
  // mc_remaining_time: 0 at finish; writing 0 made the UI show "0m left" / "Ready"
  // instead of "Available". Non-printing states have no meaningful countdown.
  const timeRemaining = status === "printing" && hasTime ? printPayload.mc_remaining_time : null;
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
    `[${printer.name}] ${status} (gcode=${printPayload.gcode_state})  ${timeRemaining ?? "?"}m remaining${errorCode ? `  error=${errorCode}` : ""}`,
  );

  await handleTransition(printer, status);
  if (status === "idle") await reconcileClaimWindow(printer);
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

  // 2b. Fallback for prints that finished while MQTT was down. pushall refreshes
  //     updated_at every 30s on a live connection, so 10+ min of silence means the
  //     link dropped. If the print was already at its tail (time_remaining null or
  //     ≤ 0) we treat it as finished and release the printer. We require the ≤0
  //     guard so a long job whose MQTT blips out mid-print is NOT force-idled.
  const printingCutoff = new Date(Date.now() - 10 * 60 * 1000).toISOString();
  const { data: silent } = await supabase
    .from("printers")
    .select("id, time_remaining")
    .eq("status", "printing")
    .lt("updated_at", printingCutoff);

  for (const p of silent ?? []) {
    if (p.time_remaining !== null && p.time_remaining > 0) continue;
    console.log(`[watchdog] printing+silent 10min on ${p.id} — releasing as finished`);
    await supabase
      .from("printers")
      .update({ status: "idle", time_remaining: null, active_user_id: null })
      .eq("id", p.id);
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

const clients = [];

// Bambu only emits a full report (the one that contains gcode_state) on connect
// and when you explicitly ask for it. Its spontaneous reports are incremental and
// usually omit gcode_state — so a finished print may never push a "FINISH" state,
// leaving the printer stuck at status=printing. Requesting a pushall on a timer
// guarantees we periodically get an authoritative gcode_state and detect the
// printing→idle transition reliably.
function requestPushAll(client) {
  if (!client.connected) return;
  client.publish(
    `device/${client.serialNumber}/request`,
    JSON.stringify({ pushing: { sequence_id: "0", command: "pushall" } }),
  );
}

function connectPrinter(printer) {
  const client = mqtt.connect(`mqtts://${printer.ip}`, {
    port: 8883,
    username: "bblp",
    password: printer.accessCode,
    rejectUnauthorized: false,
    reconnectPeriod: 5000,
    connectTimeout: 10_000,
  });
  client.serialNumber = printer.serialNumber;

  client.on("connect", () => {
    console.log(`[${printer.name}] MQTT connected`);
    client.subscribe(`device/${printer.serialNumber}/report`, (err) => {
      if (err) console.error(`[${printer.name}] Subscribe error:`, err.message);
    });
    requestPushAll(client); // grab a full snapshot immediately on (re)connect
  });

  client.on("message", (_topic, payload) => {
    let data;
    try { data = JSON.parse(payload.toString()); } catch { return; }
    if (data.print) void updatePrinter(printer, data.print);
  });

  client.on("reconnect", () => console.log(`[${printer.name}] reconnecting…`));
  client.on("error", (err) => console.error(`[${printer.name}] MQTT error:`, err.message));
  client.on("offline", () => console.warn(`[${printer.name}] offline`));

  clients.push(client);
}

// Refresh a full report from every connected printer on a timer.
setInterval(() => {
  for (const client of clients) requestPushAll(client);
}, 30_000);

// ─── Main ──────────────────────────────────────────────────────────────────────

console.log("Bambu Poller starting — connecting to", PRINTER_CONFIG.length, "printers");
for (const printer of PRINTER_CONFIG) connectPrinter(printer);
