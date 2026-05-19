/**
 * Bambu Lab MQTT Poller
 *
 * Runs on the makerspace computer that is on the same LAN as the printers.
 * Connects to each printer's local MQTT broker, reads live telemetry,
 * and pushes status updates + lifecycle events to Supabase.
 *
 * Lifecycle events handled here:
 *   • print finishes or errors  → email slot-1 user, remove from queue,
 *                                  promote new slot-1, email them
 *   • slot-1 notified >10 min ago and hasn't clicked "I've Started"
 *                               → record no-show, increment strikes,
 *                                  ban if ≥3, remove from queue, promote next
 *
 * SETUP (do this on the makerspace computer):
 *   1. Install Node.js  →  https://nodejs.org
 *   2. Copy this folder to the desktop (or anywhere)
 *   3. Open a terminal in this folder and run:
 *        npm install
 *   4. Fill in the configuration section below
 *   5. Run:  node index.js
 *      (keep the terminal window open; minimise it to the taskbar)
 *
 * HOW TO FIND PRINTER CREDENTIALS:
 *   On each Bambu touchscreen:  Settings → Network → LAN Mode
 *   You will see:  IP address, Serial Number (SN), Access Code
 *   Also copy the printer's UUID from supabase (seeded by schema.sql).
 *
 * GMAIL APP PASSWORD:
 *   1. Enable 2-Step Verification on the sending Gmail account
 *   2. Go to myaccount.google.com → Security → App passwords
 *   3. Generate an app password for "Mail"
 *   4. Paste it into GMAIL_APP_PASSWORD below (16 chars, no spaces)
 */

const mqtt = require("mqtt");
const nodemailer = require("nodemailer");
const { createClient } = require("@supabase/supabase-js");

// ─── Configuration ────────────────────────────────────────────────────────────

const SUPABASE_URL = "REPLACE_WITH_YOUR_SUPABASE_URL";
const SUPABASE_SERVICE_KEY = "REPLACE_WITH_YOUR_SERVICE_ROLE_KEY"; // NOT the anon key

const GMAIL_USER = "REPLACE_WITH_SENDER_GMAIL";          // e.g. "gix.printers@gmail.com"
const GMAIL_APP_PASSWORD = "REPLACE_WITH_APP_PASSWORD";  // 16-char app password

const NO_SHOW_WINDOW_MS = 10 * 60 * 1000; // 10 minutes
const STRIKES_BEFORE_BAN = 3;

// Fill in one entry per printer.
// supabaseId must match the UUID in your printers table (seeded by schema.sql).
const PRINTER_CONFIG = [
  {
    supabaseId: "11111111-1111-1111-1111-111111111111",
    name: "Bambu X1C #1",
    ip: "REPLACE_WITH_PRINTER_1_IP",
    serialNumber: "REPLACE_WITH_PRINTER_1_SN",
    accessCode: "REPLACE_WITH_PRINTER_1_CODE",
  },
  {
    supabaseId: "22222222-2222-2222-2222-222222222222",
    name: "Bambu X1C #2",
    ip: "REPLACE_WITH_PRINTER_2_IP",
    serialNumber: "REPLACE_WITH_PRINTER_2_SN",
    accessCode: "REPLACE_WITH_PRINTER_2_CODE",
  },
  {
    supabaseId: "33333333-3333-3333-3333-333333333333",
    name: "Bambu X1C #3",
    ip: "REPLACE_WITH_PRINTER_3_IP",
    serialNumber: "REPLACE_WITH_PRINTER_3_SN",
    accessCode: "REPLACE_WITH_PRINTER_3_CODE",
  },
  {
    supabaseId: "44444444-4444-4444-4444-444444444444",
    name: "Bambu X1C #4",
    ip: "REPLACE_WITH_PRINTER_4_IP",
    serialNumber: "REPLACE_WITH_PRINTER_4_SN",
    accessCode: "REPLACE_WITH_PRINTER_4_CODE",
  },
];

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

function filamentFromAms(ams) {
  try {
    const slots = ams?.ams?.[0]?.tray ?? [];
    if (slots.length === 0) return null;
    const values = slots.map((t) => t.n_remain).filter((v) => typeof v === "number");
    if (values.length === 0) return null;
    return Math.round(values.reduce((a, b) => a + b, 0) / values.length);
  } catch {
    return null;
  }
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
    .select("id, user_id, created_at, notified_at, started_at")
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

async function removeFromQueue(entryId, printerId) {
  await supabase.from("queues").delete().eq("id", entryId);
  const remaining = await getQueue(printerId);
  return remaining[0] ?? null;
}

async function notifySlot1(entry, printerName) {
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
    `Hi ${name},\n\n${printerName} is now free. You are next in line.\n\nPlease go to the GIX 3D Printer Hub and click "I've Started" within 10 minutes, or your slot will be given to the next person.\n\nGIX Makerspace`
  );
}

async function recordNoShow(entry, printerId, printerName) {
  const { user_id } = entry;

  await supabase.from("no_show_records").insert({
    user_id,
    printer_id: printerId,
    note: `Auto no-show: notified_at exceeded ${NO_SHOW_WINDOW_MS / 60000} min window`,
  });

  const { data: profile } = await supabase
    .from("profiles")
    .select("strikes, full_name, email")
    .eq("id", user_id)
    .single();

  const newStrikes = (profile?.strikes ?? 0) + 1;
  const isBanned = newStrikes >= STRIKES_BEFORE_BAN;
  await supabase
    .from("profiles")
    .update({ strikes: newStrikes, ...(isBanned ? { is_banned: true } : {}) })
    .eq("id", user_id);

  const name = profile?.full_name ?? "there";
  if (isBanned) {
    await sendEmail(
      profile?.email,
      "GIX Printer Hub: Queue access suspended",
      `Hi ${name},\n\nYour queue access has been suspended after ${newStrikes} no-shows.\nPlease contact a TA to have your access restored.\n\nGIX Makerspace`
    );
  } else {
    await sendEmail(
      profile?.email,
      "GIX Printer Hub: No-show recorded",
      `Hi ${name},\n\nYou did not confirm your print start within 10 minutes on ${printerName} and have been recorded as a no-show (${newStrikes}/${STRIKES_BEFORE_BAN}).\nAfter ${STRIKES_BEFORE_BAN} no-shows your queue access will be suspended.\n\nGIX Makerspace`
    );
  }

  console.log(`[no-show] ${user_id} on ${printerName} → strikes=${newStrikes}${isBanned ? " BANNED" : ""}`);

  const next = await removeFromQueue(entry.id, printerId);
  await notifySlot1(next, printerName);
}

// ─── State-machine handler ────────────────────────────────────────────────────

async function handleTransition(printer, newStatus) {
  const prev = lastStatus[printer.supabaseId];
  lastStatus[printer.supabaseId] = newStatus;

  if (prev !== "printing" || (newStatus !== "idle" && newStatus !== "error")) return;

  const queue = await getQueue(printer.supabaseId);
  const slot1 = queue[0];
  if (!slot1) return;

  const { email, full_name } = await getUserInfo(slot1.user_id);
  const name = full_name ?? "there";

  if (newStatus === "idle") {
    await sendEmail(
      email,
      `Your print on ${printer.name} is done!`,
      `Hi ${name},\n\nYour print job on ${printer.name} has finished successfully. Please collect your print from the makerspace.\n\nGIX Makerspace`
    );
  } else {
    await sendEmail(
      email,
      `Print error on ${printer.name}`,
      `Hi ${name},\n\nYour print job on ${printer.name} encountered an error and has stopped. Please check the printer in the makerspace.\n\nGIX Makerspace`
    );
  }

  const next = await removeFromQueue(slot1.id, printer.supabaseId);
  if (newStatus === "idle") {
    await notifySlot1(next, printer.name);
  }
}

// ─── Push telemetry to Supabase ───────────────────────────────────────────────

async function updatePrinter(printer, printPayload) {
  const status = toStatus(printPayload.gcode_state);
  const timeRemaining =
    typeof printPayload.mc_remaining_time === "number"
      ? printPayload.mc_remaining_time
      : null;
  const filamentLevel = filamentFromAms(printPayload.ams);

  const { error } = await supabase
    .from("printers")
    .update({
      status,
      time_remaining: timeRemaining,
      filament_level: filamentLevel,
      updated_at: new Date().toISOString(),
    })
    .eq("id", printer.supabaseId);

  if (error) {
    console.error(`[${printer.name}] Supabase update error:`, error.message);
    return;
  }

  console.log(
    `[${printer.name}] ${status}  ${timeRemaining ?? "?"}m remaining  filament=${filamentLevel ?? "?"}%`
  );

  await handleTransition(printer, status);
}

// ─── 10-minute no-show watchdog ───────────────────────────────────────────────

async function noShowWatchdog() {
  const cutoff = new Date(Date.now() - NO_SHOW_WINDOW_MS).toISOString();

  const { data: overdue, error } = await supabase
    .from("queues")
    .select("id, user_id, printer_id, notified_at")
    .not("notified_at", "is", null)
    .is("started_at", null)
    .lt("notified_at", cutoff);

  if (error) {
    console.error("[watchdog] query error:", error.message);
    return;
  }

  for (const entry of overdue ?? []) {
    const cfg = PRINTER_CONFIG.find((p) => p.supabaseId === entry.printer_id);
    const printerName = cfg?.name ?? entry.printer_id;
    console.log(`[watchdog] no-show detected: user ${entry.user_id} on ${printerName}`);
    await recordNoShow(entry, entry.printer_id, printerName);
  }
}

setInterval(() => void noShowWatchdog(), 60_000);

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
