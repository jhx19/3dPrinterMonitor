# ARCHITECTURE.md
## GIX Prototyping Lab — Printer Monitor & Queue System

**Project:** TECHIN 510 Final Project  
**Client:** Su Hyun Jung  
**Developer:** [Your Name]  
**Date:** 2026-04-06

---

## 1. System Overview

This application solves a single operational problem: **idle time between 3D print jobs** caused by users not knowing when to arrive at the lab. The system monitors all four Bambu printers in real-time, manages a per-printer queue, and dispatches timed notifications so the next user arrives just as the current job finishes.

<details>
<summary>C4 Context — system in the GIX Lab network</summary>

<br>

<svg width="100%" viewBox="0 0 680 350">
  <defs>
    <marker id="arr-ctx" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
      <path d="M2 1L8 5L2 9" fill="none" stroke="context-stroke" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
    </marker>
  </defs>
  <rect x="30" y="30" width="620" height="290" rx="16" fill="none" stroke="#888" stroke-width="1" stroke-dasharray="6 4"/>
  <text font-size="12" fill="#888" x="50" y="52" font-family="sans-serif">GIX Lab network</text>
  <rect x="240" y="62" width="200" height="56" rx="8" fill="#D3D1C7" stroke="#5F5E5A" stroke-width="0.5"/>
  <text font-size="14" font-weight="500" fill="#2C2C2A" x="340" y="85" text-anchor="middle" dominant-baseline="central" font-family="sans-serif">Bambu printers</text>
  <text font-size="12" fill="#5F5E5A" x="340" y="105" text-anchor="middle" dominant-baseline="central" font-family="sans-serif">4× X1C, local LAN</text>
  <rect x="55" y="170" width="150" height="56" rx="8" fill="#CECBF6" stroke="#534AB7" stroke-width="0.5"/>
  <text font-size="14" font-weight="500" fill="#26215C" x="130" y="193" text-anchor="middle" dominant-baseline="central" font-family="sans-serif">Students &amp; TAs</text>
  <text font-size="12" fill="#3C3489" x="130" y="213" text-anchor="middle" dominant-baseline="central" font-family="sans-serif">Lab users</text>
  <rect x="240" y="170" width="200" height="56" rx="8" fill="#5DCAA5" stroke="#0F6E56" stroke-width="0.5"/>
  <text font-size="14" font-weight="500" fill="#04342C" x="340" y="193" text-anchor="middle" dominant-baseline="central" font-family="sans-serif">Printer Monitor App</text>
  <text font-size="12" fill="#085041" x="340" y="213" text-anchor="middle" dominant-baseline="central" font-family="sans-serif">Python + Streamlit</text>
  <rect x="475" y="170" width="150" height="56" rx="8" fill="#D3D1C7" stroke="#5F5E5A" stroke-width="0.5"/>
  <text font-size="14" font-weight="500" fill="#2C2C2A" x="550" y="193" text-anchor="middle" dominant-baseline="central" font-family="sans-serif">Email system</text>
  <text font-size="12" fill="#5F5E5A" x="550" y="213" text-anchor="middle" dominant-baseline="central" font-family="sans-serif">UW SMTP</text>
  <line x1="340" y1="118" x2="340" y2="170" stroke="#444" stroke-width="1.5" marker-end="url(#arr-ctx)"/>
  <text font-size="12" fill="#5F5E5A" x="353" y="148" dominant-baseline="central" font-family="sans-serif">MQTT</text>
  <line x1="205" y1="198" x2="240" y2="198" stroke="#444" stroke-width="1.5" marker-end="url(#arr-ctx)"/>
  <text font-size="12" fill="#5F5E5A" x="222" y="188" text-anchor="middle" font-family="sans-serif">browser</text>
  <line x1="440" y1="198" x2="475" y2="198" stroke="#444" stroke-width="1.5" marker-end="url(#arr-ctx)"/>
  <text font-size="12" fill="#5F5E5A" x="457" y="188" text-anchor="middle" font-family="sans-serif">email</text>
</svg>

</details>

<details>
<summary>C4 Container — internal module relationships</summary>

<br>

<svg width="100%" viewBox="0 0 680 450">
  <defs>
    <marker id="arr-con" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
      <path d="M2 1L8 5L2 9" fill="none" stroke="context-stroke" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
    </marker>
  </defs>
  <rect x="30" y="30" width="620" height="390" rx="16" fill="none" stroke="#888" stroke-width="1" stroke-dasharray="6 4"/>
  <text font-size="12" fill="#888" x="50" y="52" font-family="sans-serif">Printer Monitor App</text>
  <rect x="55" y="68" width="175" height="56" rx="8" fill="#5DCAA5" stroke="#0F6E56" stroke-width="0.5"/>
  <text font-size="14" font-weight="500" fill="#04342C" x="142" y="91" text-anchor="middle" dominant-baseline="central" font-family="sans-serif">Bambu poller</text>
  <text font-size="12" fill="#085041" x="142" y="111" text-anchor="middle" dominant-baseline="central" font-family="sans-serif">MQTT, 5 s interval</text>
  <rect x="450" y="68" width="175" height="56" rx="8" fill="#F0997B" stroke="#993C1D" stroke-width="0.5"/>
  <text font-size="14" font-weight="500" fill="#4A1B0C" x="537" y="91" text-anchor="middle" dominant-baseline="central" font-family="sans-serif">Notification engine</text>
  <text font-size="12" fill="#712B13" x="537" y="111" text-anchor="middle" dominant-baseline="central" font-family="sans-serif">Event routing &amp; email</text>
  <rect x="253" y="195" width="175" height="56" rx="8" fill="#85B7EB" stroke="#185FA5" stroke-width="0.5"/>
  <text font-size="14" font-weight="500" fill="#042C53" x="340" y="218" text-anchor="middle" dominant-baseline="central" font-family="sans-serif">SQLite database</text>
  <text font-size="12" fill="#0C447C" x="340" y="238" text-anchor="middle" dominant-baseline="central" font-family="sans-serif">State + audit log</text>
  <rect x="55" y="335" width="175" height="56" rx="8" fill="#CECBF6" stroke="#534AB7" stroke-width="0.5"/>
  <text font-size="14" font-weight="500" fill="#26215C" x="142" y="358" text-anchor="middle" dominant-baseline="central" font-family="sans-serif">Queue manager</text>
  <text font-size="12" fill="#3C3489" x="142" y="378" text-anchor="middle" dominant-baseline="central" font-family="sans-serif">Join, promote, no-show</text>
  <rect x="450" y="335" width="175" height="56" rx="8" fill="#D3D1C7" stroke="#5F5E5A" stroke-width="0.5"/>
  <text font-size="14" font-weight="500" fill="#2C2C2A" x="537" y="358" text-anchor="middle" dominant-baseline="central" font-family="sans-serif">Streamlit UI</text>
  <text font-size="12" fill="#5F5E5A" x="537" y="378" text-anchor="middle" dominant-baseline="central" font-family="sans-serif">Dashboard, queue, admin</text>
  <line x1="230" y1="96" x2="450" y2="96" stroke="#444" stroke-width="1.5" marker-end="url(#arr-con)"/>
  <text font-size="12" fill="#5F5E5A" x="340" y="86" text-anchor="middle" font-family="sans-serif">events</text>
  <line x1="205" y1="124" x2="275" y2="195" stroke="#444" stroke-width="1.5" marker-end="url(#arr-con)"/>
  <line x1="490" y1="124" x2="428" y2="195" stroke="#444" stroke-width="1.5" marker-end="url(#arr-con)"/>
  <line x1="310" y1="251" x2="175" y2="335" stroke="#444" stroke-width="1.5" marker-start="url(#arr-con)" marker-end="url(#arr-con)"/>
  <line x1="400" y1="251" x2="500" y2="335" stroke="#444" stroke-width="1.5" marker-start="url(#arr-con)" marker-end="url(#arr-con)"/>
  <line x1="230" y1="363" x2="450" y2="363" stroke="#444" stroke-width="1.5" marker-start="url(#arr-con)" marker-end="url(#arr-con)"/>
</svg>

</details>

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