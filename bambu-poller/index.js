/**
 * Bambu Lab MQTT Poller
 *
 * Runs on the makerspace computer that is on the same LAN as the printers.
 * Connects to each printer's local MQTT broker, reads live telemetry,
 * and pushes status updates + queue lifecycle events to Supabase.
 *
 * Queue model (soft coordination, not access control):
 *   • printer becomes available (idle) → head of the waitlist enters a 10-minute
 *                                        claim window (notified_at set + email)
 *   • printer stays idle for the full window (no print started)
 *                                      → head is removed from the waitlist
 *                                         (email), the next person enters a window
 *   • printer changes to printing      → the claim window ends; on the dashboard
 *                                         every person in the waitlist sees an
 *                                         "I've Started" button. Whoever clicks it
 *                                         becomes printers.active_user_id (handled
 *                                         by the claim_printer RPC on the web app).
 *   • print finishes or errors         → email the active user, clear
 *                                         active_user_id, restart the cycle
 *
 * A removed/expired user is recorded for TA reference (strikes + no_show_records)
 * but is NEVER auto-banned — the system is a notification-assisted waitlist.
 *
 * SETUP (on the makerspace computer):
 *   1. Install Node.js  →  https://nodejs.org
 *   2. Copy this folder to the desktop (or anywhere)
 *   3. Open a terminal in this folder and run:  npm install
 *   4. Copy .env.example to .env and fill in every value
 *   5. Run:  npm start   (keep the terminal open; minimise it to the taskbar)
 *
 * WHERE THE VALUES COME FROM:
 *   • Supabase service key:  Supabase dashboard → Project Settings → API
 *   • Gmail app password:    myaccount.google.com → Security → App passwords
 *   • Printer IP / SN / code: each Bambu touchscreen → Settings → Network → LAN Mode
 *   • Printer UUID (PRINTER_n_ID): the value seeded by supabase/schema.sql
 */

require("dotenv").config();

const mqtt = require("mqtt");
const nodemailer = require("nodemailer");
const { createClient } = require("@supabase/supabase-js");

// ─── Configuration (from .env) ─────────────────────────────────────────────────

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY; // NOT the anon key
const GMAIL_USER = process.env.GMAIL_USER;
const GMAIL_APP_PASSWORD = process.env.GMAIL_APP_PASSWORD;

const CLAIM_WINDOW_MS = 10 * 60 * 1000; // 10-minute window for the head of the queue

// Build the printer list from PRINTER_1_*..PRINTER_4_* in .env.
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

for (const key of ["SUPABASE_URL", "SUPABASE_SERVICE_KEY", "GMAIL_USER", "GMAIL_APP_PASSWORD"]) {
  if (!process.env[key]) {
    console.error(`Missing required env var ${key}. Copy .env.example to .env and fill it in.`);
    process.exit(1);
  }
}
if (PRINTER_CONFIG.length === 0) {
  console.error("No printers configured. Fill in PRINTER_1_* … in .env.");
  process.exit(1);
}

// ─── Supabase + email clients ─────────────────────────────────────────────────

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

const mailer = nodemailer.createTransport({
  service: "gmail",
  auth: { user: GMAIL_USER, pass: GMAIL_APP_PASSWORD },
});

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

// Capture the raw Bambu error code when the printer is in an error state.
// Mapping codes to friendly text is future work; for now we just store the raw
// value so the dashboard can fall back to "Printer needs attention".
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

async function sendEmail(to, subject, text) {
  if (!to) return;
  try {
    await mailer.sendMail({ from: `"GIX 3D Printer Hub" <${GMAIL_USER}>`, to, subject, text });
    console.log(`[email] sent "${subject}" → ${to}`);
  } catch (err) {
    console.error(`[email] failed to send to ${to}:`, err.message);
  }
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

async function getUserInfo(userId) {
  const { data } = await supabase
    .from("profiles")
    .select("email, full_name")
    .eq("id", userId)
    .single();
  return data ?? {};
}

async function getPrinterRow(printerId) {
  const { data } = await supabase
    .from("printers")
    .select("status, active_user_id")
    .eq("id", printerId)
    .single();
  return data ?? null;
}

// Start the 10-minute claim window for the head of the queue.
async function notifyHead(entry, printerName) {
  if (!entry) return;
  await supabase
    .from("queues")
    .update({ notified_at: new Date().toISOString() })
    .eq("id", entry.id);
  const { email, full_name } = await getUserInfo(entry.user_id);
  const name = full_name ?? "there";
  await sendEmail(
    email,
    `${printerName} is ready for you!`,
    `Hi ${name},\n\n${printerName} is now free and you are next in line.\n\nYou have 10 minutes to go to the makerspace and start your print. Once the printer begins printing, open the GIX 3D Printer Hub and click "I've Started" so we know it's you.\n\nIf no print is started within 10 minutes, your spot passes to the next person.\n\nGIX Makerspace`
  );
}

// Head's claim window expired with no print started → drop them, promote the next.
async function expireHead(entry, printerName) {
  const { user_id } = entry;
  const { email, full_name } = await getUserInfo(user_id);
  const name = full_name ?? "there";

  await sendEmail(
    email,
    `You've been removed from the ${printerName} waitlist`,
    `Hi ${name},\n\nYour 10-minute window for ${printerName} passed without a print starting, so you've been removed from the waitlist. You're welcome to join the queue again any time.\n\nGIX Makerspace`
  );

  // Record for TA reference only — no automatic ban.
  await supabase.from("no_show_records").insert({
    user_id,
    printer_id: entry.printer_id,
    note: `Claim window (${CLAIM_WINDOW_MS / 60000} min) expired with no print started`,
  });
  const { data: profile } = await supabase
    .from("profiles")
    .select("strikes")
    .eq("id", user_id)
    .single();
  await supabase
    .from("profiles")
    .update({ strikes: (profile?.strikes ?? 0) + 1 })
    .eq("id", user_id);

  await supabase.from("queues").delete().eq("id", entry.id);

  const next = (await getQueue(entry.printer_id))[0] ?? null;
  await notifyHead(next, printerName);
}

// If the printer is idle and the head has no active window, start one.
async function reconcileClaimWindow(printer) {
  const queue = await getQueue(printer.supabaseId);
  const head = queue[0];
  if (!head || head.notified_at) return;
  await notifyHead(head, printer.name);
}

// ─── State-machine handler ────────────────────────────────────────────────────

async function handleTransition(printer, newStatus) {
  const prev = lastStatus[printer.supabaseId];
  lastStatus[printer.supabaseId] = newStatus;
  if (prev === null) return; // first reading after startup — no transition

  // Print ended (was printing, now idle or error): email the active user, clear them.
  if (prev === "printing" && (newStatus === "idle" || newStatus === "error")) {
    const row = await getPrinterRow(printer.supabaseId);
    const activeUserId = row?.active_user_id ?? null;
    if (activeUserId) {
      const { email, full_name } = await getUserInfo(activeUserId);
      const name = full_name ?? "there";
      if (newStatus === "idle") {
        await sendEmail(
          email,
          `Your print on ${printer.name} is done!`,
          `Hi ${name},\n\nYour print job on ${printer.name} has finished. Please collect your print from the makerspace.\n\nGIX Makerspace`
        );
      } else {
        await sendEmail(
          email,
          `Print error on ${printer.name}`,
          `Hi ${name},\n\nYour print job on ${printer.name} stopped with an error. Please check the printer in the makerspace.\n\nGIX Makerspace`
        );
      }
    }
    await supabase.from("printers").update({ active_user_id: null }).eq("id", printer.supabaseId);
  }

  // Became available: reset stale claim windows so the head gets a fresh 10 minutes.
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
    `[${printer.name}] ${status}  ${timeRemaining ?? "?"}m remaining${errorCode ? `  error=${errorCode}` : ""}`
  );

  await handleTransition(printer, status);
  if (status === "idle") await reconcileClaimWindow(printer);
}

// ─── Claim-window watchdog (runs every minute) ─────────────────────────────────

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
    const cfg = PRINTER_CONFIG.find((p) => p.supabaseId === entry.printer_id);
    const printerName = cfg?.name ?? entry.printer_id;

    // Only expire while the printer is still idle and unclaimed — if a print
    // started, the window simply ends and the dashboard takes over.
    const row = await getPrinterRow(entry.printer_id);
    if (!row || row.status !== "idle" || row.active_user_id) continue;

    console.log(`[watchdog] claim window expired: user ${entry.user_id} on ${printerName}`);
    await expireHead(entry, printerName);
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
