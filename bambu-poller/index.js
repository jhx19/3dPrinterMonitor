/**
 * Bambu Lab MQTT Poller
 *
 * Runs on the makerspace computer (same LAN as the printers).
 * Connects to each printer's local MQTT broker, reads live telemetry,
 * and writes status + queue lifecycle events to Supabase.
 *
 * Email notifications are handled entirely by the Supabase Edge Function
 * "send-notification", triggered by database webhooks. This file contains
 * no email credentials and needs no access to Gmail.
 *
 * Queue model (soft coordination):
 *   • printer becomes idle → head of queue gets notified_at set
 *     → Edge Function sends "it's your turn" email
 *   • 10 min passes with no print started → head removed, no_show_records
 *     inserted → Edge Function sends "removed from waitlist" email
 *   • print ends/errors → active_user_id cleared → Edge Function sends
 *     "done / error" email
 *
 * SETUP:
 *   1. Install Node.js  →  https://nodejs.org
 *   2. Copy this folder to the desktop (or anywhere)
 *   3. cd bambu-poller && npm install
 *   4. Copy .env.example to .env and fill in SUPABASE_URL + SUPABASE_SERVICE_KEY
 *      and printer credentials. No Gmail credentials needed here.
 *   5. npm start
 */

require("dotenv").config();

const mqtt = require("mqtt");
const { createClient } = require("@supabase/supabase-js");

// ─── Configuration (from .env) ────────────────────────────────────────────────

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;

const CLAIM_WINDOW_MS = 10 * 60 * 1000; // 10-minute window

const PRINTER_CONFIG = [1, 2, 3, 4]
  .map((n) => ({
    supabaseId: process.env[`PRINTER_${n}_ID`],
    name: process.env[`PRINTER_${n}_NAME`] ?? `Bambu X1C #${n}`,
    ip: process.env[`PRINTER_${n}_IP`],
    serialNumber: process.env[`PRINTER_${n}_SN`],
    accessCode: process.env[`PRINTER_${n}_CODE`],
  }))
  .filter((p) => p.supabaseId && p.ip && p.serialNumber && p.accessCode);

// ─── Validate configuration ────────────────────────────────────────────────────

for (const key of ["SUPABASE_URL", "SUPABASE_SERVICE_KEY"]) {
  if (!process.env[key]) {
    console.error(`Missing required env var ${key}. Copy .env.example to .env and fill it in.`);
    process.exit(1);
  }
}
if (PRINTER_CONFIG.length === 0) {
  console.error("No printers configured. Fill in PRINTER_1_* … in .env.");
  process.exit(1);
}

// ─── Supabase client ───────────────────────────────────────────────────────────

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

// ─── In-memory state ──────────────────────────────────────────────────────────

const lastStatus = {};
for (const p of PRINTER_CONFIG) lastStatus[p.supabaseId] = null;

// ─── Helpers ──────────────────────────────────────────────────────────────────

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

// Sets notified_at on the queue head, which triggers the Edge Function webhook
// to send the "it's your turn" email automatically.
async function startClaimWindow(entry) {
  if (!entry) return;
  await supabase
    .from("queues")
    .update({ notified_at: new Date().toISOString() })
    .eq("id", entry.id);
}

// Removes an expired head. Inserting into no_show_records triggers the Edge
// Function to send the "removed from waitlist" email automatically.
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

  // Start window for the next person in queue.
  const next = (await getQueue(entry.printer_id))[0] ?? null;
  await startClaimWindow(next);
}

// If the printer is idle and the head has no active window, start one.
async function reconcileClaimWindow(printer) {
  const queue = await getQueue(printer.supabaseId);
  const head = queue[0];
  if (!head || head.notified_at) return;
  await startClaimWindow(head);
}

// ─── State-machine handler ────────────────────────────────────────────────────

async function handleTransition(printer, newStatus) {
  const prev = lastStatus[printer.supabaseId];
  lastStatus[printer.supabaseId] = newStatus;
  if (prev === null) return; // first reading after startup

  // Print ended: clear active_user_id. The UPDATE triggers the Edge Function
  // which sends the "print done / error" email to whoever had claimed it.
  if (prev === "printing" && (newStatus === "idle" || newStatus === "error")) {
    await supabase
      .from("printers")
      .update({ active_user_id: null })
      .eq("id", printer.supabaseId);
  }

  // Printer became available: reset stale claim windows so the head gets a
  // fresh 10-minute window from now.
  if (newStatus === "idle" && prev !== "idle") {
    await supabase
      .from("queues")
      .update({ notified_at: null })
      .eq("printer_id", printer.supabaseId);
  }
}

// ─── Push telemetry to Supabase ───────────────────────────────────────────────

async function updatePrinter(printer, printPayload) {
  const status = toStatus(printPayload.gcode_state);
  const timeRemaining =
    typeof printPayload.mc_remaining_time === "number" ? printPayload.mc_remaining_time : null;
  const errorCode = status === "error" ? errorCodeFromPayload(printPayload) : null;

  const { error } = await supabase
    .from("printers")
    .update({
      status,
      time_remaining: timeRemaining,
      error_code: errorCode,
      updated_at: new Date().toISOString(),
    })
    .eq("id", printer.supabaseId);

  if (error) {
    console.error(`[${printer.name}] Supabase update error:`, error.message);
    return;
  }

  console.log(
    `[${printer.name}] ${status}  ${timeRemaining ?? "?"}m remaining${errorCode ? `  error=${errorCode}` : ""}`,
  );

  await handleTransition(printer, status);
  if (status === "idle") await reconcileClaimWindow(printer);
}

// ─── Claim-window watchdog (every minute) ─────────────────────────────────────

async function claimWindowWatchdog() {
  const cutoff = new Date(Date.now() - CLAIM_WINDOW_MS).toISOString();

  const { data: overdue, error } = await supabase
    .from("queues")
    .select("id, user_id, printer_id, notified_at")
    .not("notified_at", "is", null)
    .lt("notified_at", cutoff);

  if (error) {
    console.error("[watchdog] query error:", error.message);
    return;
  }

  for (const entry of overdue ?? []) {
    const row = await getPrinterRow(entry.printer_id);
    if (!row || row.status !== "idle" || row.active_user_id) continue;

    const cfg = PRINTER_CONFIG.find((p) => p.supabaseId === entry.printer_id);
    console.log(`[watchdog] claim window expired: user ${entry.user_id} on ${cfg?.name ?? entry.printer_id}`);
    await expireHead(entry);
  }
}

setInterval(() => void claimWindowWatchdog(), 60_000);

// ─── MQTT: connect one printer ────────────────────────────────────────────────

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
    try {
      data = JSON.parse(payload.toString());
    } catch {
      return;
    }
    if (data.print) {
      void updatePrinter(printer, data.print);
    }
  });

  client.on("reconnect", () => console.log(`[${printer.name}] reconnecting…`));
  client.on("error", (err) => console.error(`[${printer.name}] MQTT error:`, err.message));
  client.on("offline", () => console.warn(`[${printer.name}] offline`));
}

// ─── Main ─────────────────────────────────────────────────────────────────────

console.log("Bambu Poller starting — connecting to", PRINTER_CONFIG.length, "printers");
for (const printer of PRINTER_CONFIG) {
  connectPrinter(printer);
}
