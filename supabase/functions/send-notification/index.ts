/**
 * Supabase Edge Function: send-notification
 *
 * Handles two types of incoming requests:
 *
 * A) Direct POST from the poller (explicit event, no webhook):
 *      { type: "queue_notified", record: { user_id, printer_id } }
 *    → "it's your turn" email — only sent in genuine "you waited" cases.
 *       Joining an already-idle empty queue does NOT trigger this.
 *
 * B) Supabase database webhooks:
 *    • no_show_records INSERT → "you've been removed" email
 *    • printers UPDATE (active_user_id cleared) → "print done / error" email
 *
 * Gmail credentials are stored as Supabase Edge Function secrets only.
 * They never appear in the codebase or on any makerspace computer.
 *
 * SECRETS REQUIRED (set in Supabase dashboard → Edge Functions → Secrets):
 *   GMAIL_USER
 *   GMAIL_APP_PASSWORD
 */

import { createClient } from "npm:@supabase/supabase-js@2";
import nodemailer from "npm:nodemailer@6";

const DASHBOARD_URL = "https://3-d-printer-monitor.vercel.app/dashboard";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

const mailer = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: Deno.env.get("GMAIL_USER"),
    pass: Deno.env.get("GMAIL_APP_PASSWORD"),
  },
});

async function getUserInfo(userId: string) {
  const { data } = await supabase
    .from("profiles")
    .select("email, full_name")
    .eq("id", userId)
    .single();
  return data ?? { email: null, full_name: null };
}

async function getPrinterName(printerId: string): Promise<string> {
  const { data } = await supabase
    .from("printers")
    .select("name")
    .eq("id", printerId)
    .single();
  return data?.name ?? printerId;
}

async function sendEmail(to: string | null, subject: string, text: string) {
  if (!to) return;
  const from = `"GIX 3D Printer Hub" <${Deno.env.get("GMAIL_USER")}>`;
  try {
    await mailer.sendMail({ from, to, subject, text });
    console.log(`[email] sent "${subject}" → ${to}`);
  } catch (err) {
    console.error(`[email] failed:`, err);
  }
}

// A) Poller calls this directly when someone's turn genuinely arrives.
async function handleQueueNotified(record: Record<string, unknown>) {
  const { user_id, printer_id } = record;
  const [user, printerName] = await Promise.all([
    getUserInfo(user_id as string),
    getPrinterName(printer_id as string),
  ]);
  const name = user.full_name ?? "there";
  await sendEmail(
    user.email,
    `${printerName} is available — head over now`,
    `Hi ${name},\n\n${printerName} is available — head over to the makerspace now.\n\nYou have 5 minutes to start your print.\nOnce the printer is running, open the GIX Printer Hub and confirm:\n${DASHBOARD_URL}\n\nIf no print starts within 5 minutes, your spot passes to the next person.\n\nGIX Makerspace`,
  );
}

// B1) no_show_records INSERT webhook → "you've been removed".
async function handleNoShow(record: Record<string, unknown>) {
  const { user_id, printer_id } = record;
  const [user, printerName] = await Promise.all([
    getUserInfo(user_id as string),
    getPrinterName(printer_id as string),
  ]);
  const name = user.full_name ?? "there";
  await sendEmail(
    user.email,
    `You've been removed from the ${printerName} waitlist`,
    `Hi ${name},\n\nYour 5-minute window for ${printerName} passed without a print starting, so your spot has been passed to the next person.\n\nYou're welcome to join the waitlist again any time:\n${DASHBOARD_URL}\n\nGIX Makerspace`,
  );
}

// B2) printers UPDATE webhook → active_user_id cleared → print done or error.
async function handlePrintEnded(
  oldRecord: Record<string, unknown>,
  newRecord: Record<string, unknown>,
) {
  const activeUserId = oldRecord.active_user_id as string | null;
  if (!activeUserId) return;

  const [user, printerName] = await Promise.all([
    getUserInfo(activeUserId),
    getPrinterName(newRecord.id as string),
  ]);
  const name = user.full_name ?? "there";

  if (newRecord.status === "idle") {
    await sendEmail(
      user.email,
      `Your print on ${printerName} is done!`,
      `Hi ${name},\n\nYour print job on ${printerName} has finished successfully.\nPlease collect your print from the makerspace.\n\nGIX Makerspace`,
    );
  } else if (newRecord.status === "error") {
    await sendEmail(
      user.email,
      `Print error on ${printerName}`,
      `Hi ${name},\n\nYour print job on ${printerName} stopped with an error.\nPlease check the printer in the makerspace.\n\nGIX Makerspace`,
    );
  }
}

// ── Main handler ───────────────────────────────────────────────────────────────

Deno.serve(async (req: Request) => {
  let payload: Record<string, unknown>;
  try {
    payload = await req.json();
  } catch {
    return new Response("Bad request", { status: 400 });
  }

  const { type, table, record, old_record } = payload as {
    type: string;
    table?: string;
    record: Record<string, unknown>;
    old_record?: Record<string, unknown>;
  };

  try {
    // A) Direct call from poller
    if (type === "queue_notified") {
      await handleQueueNotified(record);

    // B1) no_show_records INSERT webhook
    } else if (table === "no_show_records" && type === "INSERT") {
      await handleNoShow(record);

    // B2) printers UPDATE webhook — active_user_id cleared
    } else if (table === "printers" && type === "UPDATE") {
      if (old_record?.active_user_id && !record.active_user_id) {
        await handlePrintEnded(old_record, record);
      }
    }
  } catch (err) {
    console.error("[send-notification] error:", err);
    return new Response("Internal error", { status: 500 });
  }

  return new Response("ok", { status: 200 });
});
