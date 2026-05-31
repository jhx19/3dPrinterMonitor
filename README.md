# GIX Lab 3D Printer Hub

**Live app: [printermonitor-qa4vpp5s6-jason-jin-s-projects.vercel.app](https://printermonitor-qa4vpp5s6-jason-jin-s-projects.vercel.app)**

A real-time dashboard and soft coordination queue for the GIX Prototyping Lab's four Bambu Lab X1 Carbon printers. Students can check printer availability remotely, join a waitlist, and receive email notifications when it's their turn — without physically camping in the lab.

---

## Problem

Students at the GIX Prototyping Lab have no way to check printer availability remotely. The only option is to walk to the lab, see if a machine is free, and wait in person. During peak hours it's common to stand next to a printer for 10+ minutes just watching a countdown. Printers sit idle between jobs because no one is queued up and ready, and students waste time making unnecessary trips.

---

## Solution

A live dashboard and notification-assisted waitlist that:

- Shows the real-time status (available, in use, error) and remaining print time for all 4 printers
- Lets students sign in and join a per-printer queue from anywhere
- Notifies the next student by email when a printer becomes free
- Gives the head of the queue a 10-minute window to go start their print
- Lets any queue member confirm they started once the printer is printing
- Handles no-shows, promotes the next person, and records missed turns for TA reference

The system is a **soft coordination tool, not an access-control gate**. Printers are shared school property and students can always walk up and start a print. The app helps coordinate and reduce wasted idle time.

---

## Tech Stack

| Layer | Choice |
|-------|--------|
| Frontend | Next.js 16, React, Tailwind CSS, deployed on Vercel |
| Backend / DB | Supabase (Postgres + Auth + Realtime + Edge Functions) |
| Printer integration | Bambu Lab MQTT local API; poller runs on a makerspace LAN computer |
| Email notifications | Supabase Edge Function (`send-notification`) calling Gmail via nodemailer — credentials stored in Supabase secrets only |
| Testing | Vitest + Testing Library (41 tests) |

---

## Team

| Role | Name |
|------|------|
| Proposer (Client) | Su Hyun Jung |
| Developer | Jason Jin |
| Agreed Development Fee | 40 GIX Bucks |

---

## Timeline

| Check-in | Date | Required Progress | Status |
|----------|------|-------------------|--------|
| Check-in 1 | April 20, 2026 | Architecture PR submitted. Bambu API connected. Basic dashboard UI. Auth working. | Partial. Dashboard, queue structure, Realtime, auth, and profile setup all implemented. Bambu poller requires real LAN access. Issues: [#2](../../issues/2), [#3](../../issues/3), [#4](../../issues/4), [#13](../../issues/13), [#14](../../issues/14). |
| Check-in 2 | May 4, 2026 | Queue fully functional. Notifications firing. No-show detection and strike recording working. | Complete. Queue with 3-person cap, 10-min countdown, claim flow, and email notifications via Supabase Edge Function all implemented. Issues: [#5](../../issues/5), [#6](../../issues/6), [#7](../../issues/7). |
| Check-in 3 | May 18, 2026 | TA admin panel complete. Penalty management working. All Must-have issues closed. | Partial. Schema includes TA roles, strikes, and no-show records. Admin page UI not implemented. Issue: [#8](../../issues/8). |
| Final Delivery | June 1, 2026 | All features complete and tested. App deployed and demo-ready. | In progress. Dashboard, auth, queue, poller, and notifications are fully functional. TA admin UI remains open. Issues: [#2](../../issues/2), [#8](../../issues/8), [#9](../../issues/9). |

---

## Queue Policy

The queue is a notification-assisted waitlist, not a reservation lock.

1. A student joins the waitlist for a printer (max 3 per printer).
2. When the printer becomes available, the head of the queue receives an email and a 10-minute countdown starts.
3. The countdown is visible to everyone on the dashboard next to the head's name.
4. If the printer status changes to **printing** within 10 minutes, the countdown ends. Every person in the queue sees an **"I've Started"** button — because the app cannot know who physically started the print.
5. Whoever clicks "I've Started" is recorded as the current user and removed from the queue. Their name appears next to the remaining time on the card.
6. If no print starts within 10 minutes, the head is removed from the queue (email notification sent), and the next person enters their 10-minute window.
7. When the print ends (or errors), the active user receives an email. `active_user_id` is cleared and the cycle restarts for the next person in queue.

**No automatic bans.** Missed turns increment a strike counter for TA reference, but never lock a student out of the system.

---

## Features

### Implemented

- Real-time dashboard for all 4 Bambu Lab X1C printers (MOREL, TURKEY TAIL, FLY AGARIC, SHIITAKE)
- Live printer status: Available, In use (with remaining time), Error (with fallback "Printer needs attention" message)
- Stale data warning when telemetry is older than 2 minutes
- Per-printer waitlist capped at 3 students, enforced by frontend and DB trigger
- 10-minute claim countdown displayed to all queue members
- "I've Started" button visible to all queue members when printer is printing and unclaimed
- Active user display next to remaining time once someone claims the print
- Email notifications via Supabase Edge Function:
  - "It's your turn" — when printer becomes available after waiting in queue
  - "Removed from waitlist" — when 10-minute window expires
  - "Print done" — when print finishes
  - "Print error" — when printer errors out
- No email when joining an already-idle printer with an empty queue (user can see availability directly)
- Supabase Realtime subscriptions for live dashboard updates
- Email + password auth with Supabase; UW email recommended
- Profile setup (name, student ID)
- Bambu Lab MQTT poller: telemetry polling, status/error code capture, queue lifecycle management, watchdog for missed transitions
- Poller holds no email credentials — only Supabase service key and printer LAN credentials
- Student / TA role fields, strikes, no-show records in the data model
- Local preview mode when Supabase env vars are absent
- 41 automated tests (Vitest + Testing Library)

### Not Yet Implemented

- TA admin page at `/admin` ([#8](../../issues/8))
- Manual queue override and penalty management UI
- Mapping Bambu error codes to human-readable messages (currently shows "Printer needs attention" for all errors)
- Microsoft Teams notifications

### Out of Scope

- Remote print job initiation
- Filament remaining display (Bambu telemetry does not reliably expose this)
- AI-assisted completion time prediction
- Time-slot reservation system
- Mobile app

---

## Local Development

```bash
npm install
cp .env.example .env.local
# fill in NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY
npm run dev
```

Open `http://localhost:3000`.

If Supabase credentials are missing, the dashboard shows local preview data and auth is disabled. This lets you review the UI without shared credentials.

```bash
npm run dev      # dev server
npm test         # run all 41 tests
npm run lint     # lint (note: may warn on bambu-poller CommonJS require)
npm run build    # production build
```

---

## Supabase Setup

Run `supabase/schema.sql` in the Supabase SQL editor (idempotent, safe to re-run).

Creates:
- `printers` — with `status`, `time_remaining`, `error_code`, `active_user_id`
- `profiles` — with `role`, `strikes`, `is_banned`
- `queues` — with `notified_at`, `started_at`; max-3 trigger enforced
- `no_show_records`
- `claim_printer(uuid)` — SECURITY DEFINER RPC for "I've Started"
- Signup trigger, RLS policies, seed records for four printers

### Supabase Edge Function

The `send-notification` Edge Function handles all email sending. Deploy it once:

```bash
supabase login
supabase link --project-ref <your-project-ref>
supabase functions deploy send-notification
supabase secrets set GMAIL_USER=your@gmail.com
supabase secrets set GMAIL_APP_PASSWORD="xxxx xxxx xxxx xxxx"
```

Then create three Database Webhooks in the Supabase dashboard (Database → Webhooks), all pointing to the Edge Function URL (`https://<ref>.supabase.co/functions/v1/send-notification`) with `Authorization: Bearer <anon key>`:

| Webhook name | Table | Event |
|---|---|---|
| `no-show-notified` | `no_show_records` | INSERT |
| `print-ended` | `printers` | UPDATE |

---

## Bambu Poller (makerspace computer)

The poller runs on the makerspace computer connected to the same LAN as the printers. It holds **no email credentials**.

```bash
cd bambu-poller
npm install
cp .env.example .env
# fill in .env (Supabase URL + service key + printer credentials)
npm start
```

To keep it running persistently with auto-restart on boot:

```bash
npm install -g pm2 pm2-windows-startup
pm2 start index.js --name bambu-poller
pm2-startup install
pm2 save
```

Useful PM2 commands:

```bash
pm2 status
pm2 logs bambu-poller
pm2 restart bambu-poller
```

### What the poller does

- Connects to each printer's local MQTT broker over TLS
- Reads `gcode_state`, `mc_remaining_time`, and error codes from telemetry
- Writes `status`, `time_remaining`, `error_code`, `updated_at` to Supabase
- On `printing → idle/error`: clears `active_user_id` (triggers email webhook)
- On becoming idle: resets `notified_at` for all queue entries, then starts the claim window for the head of queue (calls Edge Function directly)
- Watchdog every 60 seconds:
  - Expires overdue claim windows (10+ min with no print started)
  - Clears stale `active_user_id` on non-printing printers (handles poller restarts)
  - Starts missed claim windows for idle printers whose queue head has no `notified_at`

### Required `.env` values

```
SUPABASE_URL
SUPABASE_SERVICE_KEY

PRINTER_1_ID / _NAME / _IP / _SN / _CODE
PRINTER_2_ID / _NAME / _IP / _SN / _CODE
PRINTER_3_ID / _NAME / _IP / _SN / _CODE
PRINTER_4_ID / _NAME / _IP / _SN / _CODE
```

Printer credentials are found on each Bambu touchscreen under **Settings → Network → LAN Mode**.
