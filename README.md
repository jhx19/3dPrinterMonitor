# GIX Lab 3D Printer Efficiency Platform

A web application that maximizes 3D printing efficiency in the GIX Prototyping Lab by giving students real-time printer visibility, a fair queue system, and smart notifications — so printers stay in continuous use and no one has to camp out in the lab waiting for a machine.

---

## Problem

Students at the GIX Prototyping Lab have no way to check printer availability remotely. The only option is to physically walk to the lab, see if a machine is free, and wait in person if it's almost done. During peak hours, it's common to stand at a computer next to the printer for 10+ minutes just watching the countdown. This means printers sit idle between jobs because no one is queued up and ready, and students waste time making unnecessary trips or camping out in the lab.

---

## Solution

A real-time dashboard and queue system that:
- Shows live status and remaining print time for all 4 Bambu Lab X1 Carbon printers
- Lets students join a per-printer queue remotely
- Sends Microsoft Teams notifications to the right person at the right time — so the next job starts the moment the previous one finishes
- Alerts the current print owner and TA when errors or filament issues occur
- Tracks no-shows and enforces a penalty system to keep the queue fair
- Gives the lab TA a full admin panel with usage logs and penalty management

---

## Tech Stack

| Layer | Choice |
|-------|--------|
| Frontend | Next.js |
| Backend / DB | Supabase (Auth + Postgres) |
| Printer Integration | Bambu Lab Local API (MQTT) |
| Notifications | Microsoft Teams Incoming Webhook |
| AI | Completion time prediction (historical data) |

---

## Team

| Role | Name |
|------|------|
| Proposer (Client) | Su Hyun Jung |
| Developer | Jason Jin |
| Agreed Development Fee | 40 GIX Bucks |

---

## Timeline

| Check-in | Date | Required Progress |
|----------|------|-------------------|
| Check-in 1 | April 20, 2026 | Architecture PR submitted and approved. Bambu Lab API connected to at least 1 printer. Basic dashboard UI showing live printer status. Auth (UW email login) working. |
| Check-in 2 | May 4, 2026 | Queue system fully functional. Teams notifications firing correctly for all roles. No-show detection and strike recording working. |
| Check-in 3 | May 18, 2026 | TA admin panel complete. Penalty management working. All Must-have issues closed. AI prediction in progress or complete. |
| Final Delivery | June 1, 2026 | All features complete and tested. Acceptance criteria met for all Must-have issues. App deployed and demo-ready. |

---

## Features

### Must-Have
- Real-time printer dashboard (all 4 printers)
- UW email authentication with Student / TA roles
- Per-printer queue system with secondary waitlist
- Role-based Teams notifications (current user, next in queue, TA)
- No-show detection and penalty system
- TA admin panel with usage logs and penalty management

### Nice-to-Have
- AI-assisted completion time prediction

### Out of Scope
- Remote print job initiation
- Time-slot reservation system
- Mobile app


---

## Engineering Log & Implementation Notes

### 1. Database Constraints & Queue Integrity
To enforce the requirement that a student cannot join the same printer queue more than once simultaneously, we implemented a `UNIQUE` constraint in the PostgreSQL schema:
- **Constraint**: `UNIQUE(printer_id, user_id, status)`
- **Logic**: This prevents duplicate rows where a user is already in a 'waiting' state for a specific machine. It offloads the validation logic to the database layer, ensuring data integrity even if frontend checks are bypassed.

### 2. Realtime Scalability: Supabase Realtime vs. Polling
The system utilizes **Supabase Realtime** (via Postgres CDC) instead of traditional HTTP polling.
- **UX**: Provides sub-second UI updates when printer telemetry or queue positions change, which is critical for the "arrival window" logic.
- **Efficiency**: Reduces unnecessary server load and bandwidth by pushing updates only when data actually changes, rather than requesting data on a fixed interval (e.g., every 5-10 seconds).

### 3. Mock Data Strategy for Rapid Prototyping
To decouple the development of the **Real-time Dashboard** (Issue 2) and **Queue System** (Issue 4) from **Authentication** (Issue 3), we utilized a `MOCK_USER_ID`:
- **Current User**: `00000000-0000-0000-0000-000000000000`
- **Purpose**: This allowed for end-to-end testing of the queue join/leave logic and Realtime UI feedback loops before the UW Email login system was fully integrated.

---

## Current Stage Testing (Manual Verification)

To verify the current implementation of Issues 2 and 4, follow these steps:

### 1. Local Setup
1. Ensure `.env.local` contains valid `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY`.
2. Run `npm install` and `npm run dev`.
3. Open `http://localhost:3000/dashboard`.

### 2. Dashboard Real-time Test
1. Open your **Supabase Table Editor** for the `printers` table.
2. Manually change the `status` of a printer (e.g., from `idle` to `printing`).
3. **Expected**: The dashboard UI should reflect the change (badge color and icon) instantly without a page refresh.

### 3. Queue Logic Test
1. Click the **"Join Queue"** button on any printer card.
2. **Expected**: The button should change to "Already in Queue" and be disabled. A new entry should appear in the `queues` table in Supabase.
3. Manually add more entries to the `queues` table for the same `printer_id` in Supabase to test the split between **Active Slots** and **Secondary Waitlist**.