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

| Check-in | Date | Required Progress | Status |
|----------|------|-------------------|--------|
| Check-in 1 | April 20, 2026 | Architecture PR submitted and approved. Bambu Lab API connected to at least 1 printer. Basic dashboard UI showing live printer status. Auth (UW email login) working. | Partial. Dashboard UI and queue structure complete. Supabase Realtime working. Bambu API not yet connected (Time Remaining shows Unknown). Auth not yet integrated (mock user only). Bug reports filed: #[1], #[2]. |
| Check-in 2 | May 4, 2026 | Queue system fully functional. Teams notifications firing correctly for all roles. No-show detection and strike recording working. | In progress. |
| Check-in 3 | May 18, 2026 | TA admin panel complete. Penalty management working. All Must-have issues closed. AI prediction in progress or complete. | Not started. |
| Final Delivery | June 1, 2026 | All features complete and tested. Acceptance criteria met for all Must-have issues. App deployed and demo-ready. | Not started. |

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
