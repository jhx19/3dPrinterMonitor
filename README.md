# GIX Lab 3D Printer Efficiency Platform

**Live app: [printers-git-main-jason-jin-s-projects.vercel.app](https://printers-git-main-jason-jin-s-projects.vercel.app)**

A web application that maximizes 3D printing efficiency in the GIX Prototyping Lab by giving students real-time printer visibility, a fair queue system, and smart notifications — so printers stay in continuous use and no one has to camp out in the lab waiting for a machine.

---

## Problem

Students at the GIX Prototyping Lab have no way to check printer availability remotely. The only option is to physically walk to the lab, see if a machine is free, and wait in person if it's almost done. During peak hours, it's common to stand at a computer next to the printer for 10+ minutes just watching the countdown. This means printers sit idle between jobs because no one is queued up and ready, and students waste time making unnecessary trips or camping out in the lab.

---

## Solution

A real-time dashboard and queue system that:
- Shows live status and remaining print time for all 4 Bambu Lab X1 Carbon printers
- Lets students join a per-printer queue remotely
- Sends email notifications to the right person at the right time — so the next job starts the moment the previous one finishes
- Alerts the current print owner when errors occur
- Tracks no-shows and enforces a penalty system to keep the queue fair
- Gives the lab TA a full admin panel with usage logs and penalty management

---

## Tech Stack

| Layer | Choice |
|-------|--------|
| Frontend | Next.js (deployed on Vercel) |
| Backend / DB | Supabase (Auth + Postgres + Realtime) |
| Printer Integration | Bambu Lab Local API (MQTT), poller runs on makerspace LAN computer |
| Notifications | Email via Gmail (nodemailer + App Password) |

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
| Check-in 1 | April 20, 2026 | Architecture PR submitted and approved. Bambu Lab API connected to at least 1 printer. Basic dashboard UI showing live printer status. Auth (UW email login) working. | Partial. Dashboard UI and queue structure complete. Supabase Realtime working. Bambu API not yet connected (Time Remaining shows Unknown). Auth not yet integrated (mock user only). Bug reports filed: [#13](https://github.com/GIX-Luyao/final-project-codebase-junction-su/issues/13), [#14](https://github.com/GIX-Luyao/final-project-codebase-junction-su/issues/14). |
| Check-in 2 | May 4, 2026 | Queue system fully functional. Teams notifications firing correctly for all roles. No-show detection and strike recording working. | In progress. |
| Check-in 3 | May 18, 2026 | TA admin panel complete. Penalty management working. All Must-have issues closed. | In progress. |
| Final Delivery | June 1, 2026 | All features complete and tested. Acceptance criteria met for all Must-have issues. App deployed and demo-ready. | In progress. |

---

## Features

### Implemented
- Real-time printer dashboard (all 4 Bambu Lab X1C printers)
- Email + password authentication with Student / TA roles; name & student ID registration
- Per-printer queue system with active slots and secondary waitlist
- Live countdown timer for "your turn" window (10 min to confirm)
- "I've Started" confirmation button to mark print start
- No-show detection, strike tracking, and automatic ban after 3 strikes
- Email notifications via Gmail (print done, your turn, no-show warning)
- TA admin panel with queue management and penalty controls
- Bambu Lab MQTT poller (runs on makerspace LAN computer)

### Out of Scope
- Remote print job initiation
- Microsoft Teams notifications
- AI-assisted completion time prediction
- Time-slot reservation system
- Mobile app

---

## Local Development

1. Copy `.env.local.example` → `.env.local` and fill in your Supabase credentials
2. Run `npm install && npm run dev`
3. Open `http://localhost:3000`

## Bambu Poller Setup (makerspace computer)

1. `cd bambu-poller && npm install`
2. Fill in printer IPs, serial numbers, access codes, and Supabase service key in `bambu-poller/index.js`
3. `node index.js` (keep terminal open)
