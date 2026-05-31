# GIX Lab 3D Printer Efficiency Platform

**Live app: [printers-git-main-jason-jin-s-projects.vercel.app](https://printermonitor-qa4vpp5s6-jason-jin-s-projects.vercel.app/)**

A web application that maximizes 3D printing efficiency in the GIX Prototyping Lab by giving students real-time printer visibility, a fair queue system, and smart notifications - so printers stay in continuous use and no one has to camp out in the lab waiting for a machine.

---

## Problem

Students at the GIX Prototyping Lab have no way to check printer availability remotely. The only option is to physically walk to the lab, see if a machine is free, and wait in person if it's almost done. During peak hours, it's common to stand at a computer next to the printer for 10+ minutes just watching the countdown. This means printers sit idle between jobs because no one is queued up and ready, and students waste time making unnecessary trips or camping out in the lab.

---

## Solution

A real-time dashboard and queue system that:
- Shows live status and remaining print time for all 4 Bambu Lab X1 Carbon printers
- Lets students sign in, complete a student profile, and join a per-printer queue remotely
- Shows who is currently queued and who is waitlisted for each printer
- Lets the next student confirm when they have started their print
- Supports email notifications, queue promotion, no-show detection, and strike tracking through the LAN poller script
- Provides the Supabase data model for Student / TA roles, penalties, and admin access
- Provides a local preview mode so the UI can be reviewed without shared Supabase credentials

Note: the data model includes TA roles and no-show records, but the `/admin` route and TA admin interface are not currently implemented in the app UI.

---

## Tech Stack

| Layer | Choice |
|-------|--------|
| Frontend | Next.js, React, Tailwind CSS, deployed on Vercel |
| Backend / DB | Supabase Auth + Postgres + Realtime |
| Printer Integration | Bambu Lab Local API via MQTT; poller runs on makerspace LAN computer |
| Notifications | Email via Gmail using nodemailer + App Password |
| Testing | Vitest + Testing Library |

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
| Check-in 1 | April 20, 2026 | Architecture PR submitted and approved. Bambu Lab API connected to at least 1 printer. Basic dashboard UI showing live printer status. Auth (UW email login) working. | Partial. Dashboard UI and queue structure complete. Supabase Realtime support present. Auth UI and profile setup are now implemented. Bambu API integration exists as a poller script but still requires real printer credentials and LAN setup. Related issues: [#2](https://github.com/GIX-Luyao/final-project-codebase-junction-su/issues/2), [#3](https://github.com/GIX-Luyao/final-project-codebase-junction-su/issues/3), [#4](https://github.com/GIX-Luyao/final-project-codebase-junction-su/issues/4). Bug reports filed: [#13](https://github.com/GIX-Luyao/final-project-codebase-junction-su/issues/13), [#14](https://github.com/GIX-Luyao/final-project-codebase-junction-su/issues/14). |
| Check-in 2 | May 4, 2026 | Queue system fully functional. Teams notifications firing correctly for all roles. No-show detection and strike recording working. | In progress. Queue UI and core queue actions are implemented. Email notification and no-show logic exist in the poller script; Teams notifications are not implemented in the current app. Related issues: [#5](https://github.com/GIX-Luyao/final-project-codebase-junction-su/issues/5), [#6](https://github.com/GIX-Luyao/final-project-codebase-junction-su/issues/6), [#7](https://github.com/GIX-Luyao/final-project-codebase-junction-su/issues/7). |
| Check-in 3 | May 18, 2026 | TA admin panel complete. Penalty management working. All Must-have issues closed. | In progress. Supabase schema includes TA roles, strikes, bans, and no-show records, but the admin page UI is not implemented. Related issue: [#8](https://github.com/GIX-Luyao/final-project-codebase-junction-su/issues/8). |
| Final Delivery | June 1, 2026 | All features complete and tested. Acceptance criteria met for all Must-have issues. App deployed and demo-ready. | In progress. Dashboard, login, profile setup, preview UI, tests, and poller script are present. Real printer validation and admin UI remain open. Related issues: [#2](https://github.com/GIX-Luyao/final-project-codebase-junction-su/issues/2), [#8](https://github.com/GIX-Luyao/final-project-codebase-junction-su/issues/8), [#9](https://github.com/GIX-Luyao/final-project-codebase-junction-su/issues/9). |

---

## Features

### Implemented
- Responsive printer dashboard for all 4 Bambu Lab X1C printers ([#3](https://github.com/GIX-Luyao/final-project-codebase-junction-su/issues/3))
- Local preview data when Supabase environment variables are not configured
- Email + password authentication with Supabase ([#4](https://github.com/GIX-Luyao/final-project-codebase-junction-su/issues/4))
- Name and student ID profile setup
- Per-printer queue system with active slots and secondary waitlist ([#5](https://github.com/GIX-Luyao/final-project-codebase-junction-su/issues/5))
- "I've Started" confirmation button for the next student in line
- 10-minute confirmation window UI for the current user's turn
- Supabase schema for printers, profiles, queues, and no-show records
- Student / TA role fields, strikes, and ban fields in the data model
- Bambu Lab MQTT poller script for printer telemetry, queue promotion, no-show detection, strike updates, and email notifications ([#2](https://github.com/GIX-Luyao/final-project-codebase-junction-su/issues/2), [#7](https://github.com/GIX-Luyao/final-project-codebase-junction-su/issues/7))
- Component and utility tests for dashboard behavior

### Partially Implemented / Needs Real-World Validation
- Realtime printer status updates through Supabase
- Bambu Lab printer telemetry via the LAN poller ([#2](https://github.com/GIX-Luyao/final-project-codebase-junction-su/issues/2))
- Email notifications from the poller ([#6](https://github.com/GIX-Luyao/final-project-codebase-junction-su/issues/6))
- No-show detection and automatic strike recording ([#7](https://github.com/GIX-Luyao/final-project-codebase-junction-su/issues/7))
- Ban enforcement in the queue UI

### Not Yet Implemented
- TA admin page at `/admin` ([#8](https://github.com/GIX-Luyao/final-project-codebase-junction-su/issues/8))
- Admin queue management UI
- Manual penalty override UI
- Usage logs UI
- Microsoft Teams notifications

### Out of Scope
- Remote print job initiation
- AI-assisted completion time prediction
- Time-slot reservation system
- Mobile app

---

## Local Development

1. Run `npm install`
2. Copy `.env.example` to `.env.local`
3. Fill in your Supabase credentials:

```bash
NEXT_PUBLIC_SUPABASE_URL=...
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
```

4. Run `npm run dev`
5. Open `http://localhost:3000`

If Supabase credentials are missing, the dashboard will show local preview data and auth actions will be disabled. This is intentional so the UI can be reviewed without committing or sharing private keys.

Useful commands:

```bash
npm run dev
npm run test
npm run lint
npm run build
```

Known note: `npm run lint` may report CommonJS `require()` warnings in `bambu-poller/index.js` because the web app lint setup is TypeScript/ESM-oriented.

---

## Supabase Setup

Run `supabase/schema.sql` in the Supabase SQL editor for a fresh project.

The schema creates:
- `printers`
- `profiles`
- `queues`
- `no_show_records`
- signup profile trigger
- row-level security policies
- seed records for four printers

---

## Bambu Poller Setup (makerspace computer)

The poller should run on a makerspace computer connected to the same LAN as the printers.

1. `cd bambu-poller && npm install`
2. Configure Supabase, Gmail, and printer credentials
3. Run `node index.js`
4. Keep the terminal open while the poller is active

Required values:
- Supabase URL
- Supabase service role key
- Gmail sender account
- Gmail app password
- Printer IP addresses
- Printer serial numbers
- Printer LAN access codes
- Supabase printer UUIDs

`bambu-poller/.env.example` documents the required values, but `bambu-poller/index.js` currently reads configuration from constants inside the file. Keep real credentials out of git.
