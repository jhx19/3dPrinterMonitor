/**
 * Supabase Edge Function: send-notification
 *
 * Receives database webhooks and sends email notifications.
 * Gmail credentials are stored as Supabase Edge Function secrets —
 * they never appear in the codebase or on any makerspace computer.
 *
 * Triggered by three webhooks (set up in Supabase dashboard):
 *   1. queues  UPDATE  → notified_at just set  → "it's your turn" email
 *   2. no_show_records INSERT                  → "you've been removed" email
 *   3. printers UPDATE → active_user_id cleared → "print done / error" email
 *
 * DEPLOY:
 *   supabase functions deploy send-notification
 *
 * SET SECRETS (once, in the Supabase dashboard or CLI):
 *   supabase secrets set GMAIL_USER=your@gmail.com
 *   supabase secrets set GMAIL_APP_PASSWORD="xxxx xxxx xxxx xxxx"
 */

import { createClient } from "npm:@supabase/supabase-js@2";
import nodemailer from "npm:nodemailer@6";

const DASHBOARD_URL = "https://gix-printer-hub.vercel.app/dashboard"; // update if URL changes

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

async function getUserInfo(userId: string): Promise<{ email: string | null; full_name: string | null }> {
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

// ── Handler: queue entry got notified_at set → "it's your turn" ───────────────
async function handleQueueNotified(record: Record<string, unknown>) {
  const { user_id, printer_id } = record;
  const [user, printerName] = await Promise.all([
    getUserInfo(user_id as string),
    getPrinterName(printer_id as string),
  ]);
  const name = user.full_name ?? "there";
  await sendEmail(
    user.email,
    `${printerName} is ready for you!`,
    `Hi ${name},\n\n${printerName} is now free and you are first in line.\n\nYou have 10 minutes to go to the makerspace and start your print.\nOnce the printer begins, open the GIX Printer Hub and click "I've Started":\n${DASHBOARD_URL}\n\nIf no print starts within 10 minutes, your spot passes to the next person.\n\nGIX Makerspace`,
  );
}

// ── Handler: no-show record inserted → "you've been removed" ──────────────────
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
    `Hi ${name},\n\nYour 10-minute window for ${printerName} passed without a print starting, so you've been removed from the waitlist.\n\nYou're welcome to join the queue again any time:\n${DASHBOARD_URL}\n\nGIX Makerspace`,
  );
}

// ── Handler: active_user_id cleared on printer → print done or error ──────────
async function handlePrintEnded(
  oldRecord: Record<string, unknown>,
  newRecord: Record<string, unknown>,
) {
  const activeUserId = oldRecord.active_user_id as string | null;
  if (!activeUserId) return; // wasn't claimed via "I've Started" — nothing to send

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
  // Supabase sends webhook secret in Authorization header — verify it.
  const webhookSecret = Deno.env.get("WEBHOOK_SECRET");
  if (webhookSecret) {
    const auth = req.headers.get("authorization") ?? "";
    if (auth !== `Bearer ${webhookSecret}`) {
      return new Response("Unauthorized", { status: 401 });
    }
  }

  let payload: Record<string, unknown>;
  try {
    payload = await req.json();
  } catch {
    return new Response("Bad request", { status: 400 });
  }

  const { type, table, record, old_record } = payload as {
    type: string;
    table: string;
    record: Record<string, unknown>;
    old_record: Record<string, unknown>;
  };

  try {
    if (table === "queues" && type === "UPDATE") {
      // notified_at just got set for the first time
      if (!old_record.notified_at && record.notified_at) {
        await handleQueueNotified(record);
      }
    } else if (table === "no_show_records" && type === "INSERT") {
      await handleNoShow(record);
    } else if (table === "printers" && type === "UPDATE") {
      // active_user_id was cleared (print ended)
      if (old_record.active_user_id && !record.active_user_id) {
        await handlePrintEnded(old_record, record);
      }
    }
  } catch (err) {
    console.error("[send-notification] handler error:", err);
    return new Response("Internal error", { status: 500 });
  }

  return new Response("ok", { status: 200 });
});
