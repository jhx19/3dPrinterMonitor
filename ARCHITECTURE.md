# ARCHITECTURE.md
## GIX Prototyping Lab — Printer Monitor & Queue System

**Project:** TECHIN 510 Final Project  
**Client:** Su Hyun Jung  
**Developer:** Jason Jin  
**Date:** 2026-04-06

---

## 1. System Overview

This application solves a single operational problem: **idle time between 3D print jobs** caused by users not knowing when to arrive at the lab. The system monitors all four Bambu printers in real-time, manages a per-printer queue, and dispatches timed notifications so the next user arrives just as the current job finishes.

---

## 2. Tech Stack & Deployment

| Layer | Choice | Justification |
|-------|--------|---------------|
| **UI** | Streamlit | Client-specified. Python-native, no separate frontend build step. Suitable for a lab-internal tool. |
| **Printer API** | Bambu MQTT (local) | Bambu printers expose real-time telemetry over MQTT on the local network. Lower latency and no dependency on Bambu Cloud uptime. |
| **Database** | SQLite | Single-server deployment on lab machine. No network DB required; data volume is small (4 printers, ~20 users). |
| **Background Tasks** | Python `threading` + `APScheduler` | Poller and notification engine run as daemon threads alongside Streamlit. No separate worker process needed at this scale. |
| **Notifications** | SMTP Email | Zero external API cost. Uses UW email. Discord webhook can be added as a secondary channel with minimal change. |

**Deployment:** The app runs on a lab workstation or Raspberry Pi (always-on, LAN-connected), accessible at `http://[lab-machine-ip]:8501` on the lab network. No cloud dependency required.

---

## 3. Data Model

Five tables capture the full system state:

- **`printers`** — static info and live status for each of the 4 printers (name, IP, current status, filament level, active job reference)
- **`users`** — students and TAs with their contact info, role, and no-show record
- **`print_jobs`** — one row per job, tracking start time, Bambu's ETA, actual end time, and any error type
- **`queue`** — per-printer waitlist with position, tier (active vs. overflow), and notification timestamps
- **`notifications`** — audit log of every alert sent (recipient, type, channel, timestamp)

---

## 4. Module Design

### Bambu Poller
Subscribes to each printer's MQTT topic and normalizes raw telemetry into the database every 5 seconds. Detects key state transitions — job started, near completion, completed, error — and emits events to the notification engine.

### Notification Engine
Consumes poller events and applies routing logic: the current print owner receives a completion warning, queue position #1 receives a timed "head over" callup offset by an estimated walk time, and TAs are alerted on errors, low filament, or extended idle time. Every notification is logged to the `notifications` table.

### Queue Manager
Handles join, leave, and position promotion. Enforces a maximum of 2–3 active slots per printer with overflow to a secondary waitlist. After a job completes, queue #1 has a configurable arrival window to confirm presence; missing the window triggers a no-show. After a threshold number of no-shows, the user is temporarily suspended from queuing. TAs can override any suspension via the Admin page.

### Streamlit UI
Three pages: a **Dashboard** showing all 4 printers with live status, progress, and error banners (auto-refreshes every 10 seconds); a **Queue** page where users join a printer's waitlist and see their position and estimated wait; and a password-protected **Admin** page for TAs to view notification history, manage queue overrides, and adjust system settings.

---

## 5. Agentic Engineering Plan

All implementation uses **Claude Code** and **Cursor** as the primary development tools. The developer's role is to write clear prompts, review AI output critically, and iterate.

**Phase 1 — Core Infrastructure (Week 1–2)**  
Set up the MQTT poller, SQLite schema, and basic Streamlit dashboard with live printer status.

**Phase 2 — Queue & Notifications (Week 3–4)**  
Implement queue management logic, timed notification dispatch, and the Admin page. End-to-end integration tests generated via Claude Code against mock MQTT data.

**Phase 3 — Polish & Optional AI (Week 5–6)**  
UI refinement, security review, and optionally: an ETA prediction model trained on historical `print_jobs` data to improve notification timing beyond Bambu's built-in estimate. This feature is not on the critical path — core value is delivered by Phases 1–2.