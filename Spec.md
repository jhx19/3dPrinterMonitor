# GIX Lab 3D Printer Efficiency Platform

**Proposer:** Su Hyun Jung
**Developer:** Jason Jin
**Agreed Development Fee:** 40 GIX Bucks
**Stack:** Next.js + Supabase

---

## Problem Statement

Students at the GIX Prototyping Lab have no way to check printer availability remotely. The only option is to physically walk to the lab, see if a machine is free, and wait in person if it's almost done. During peak hours, it's common to stand at a computer next to the printer for 10+ minutes just watching the countdown. This means printers sit idle between jobs because no one is queued up and ready, and students waste time making unnecessary trips or camping out in the lab.

---

## Users

| Role | Description |
|------|-------------|
| Student | GIX community member who uses the 3D printers |
| TA (Admin) | Lab Technical Assistant who manages the lab and printers |

---

## User Stories

### Student

- As a student, I want to check the real-time status and remaining print time of all 4 printers from my laptop, so I don't have to walk to the lab just to see if a machine is free.
- As a student, I want to join a queue for a specific printer, so I can claim the next available slot without physically waiting in the lab.
- As a student, I want to receive a Teams notification when my print is almost done, so I can head over at the right time to pick it up.
- As a student, I want to receive a Teams notification when it's almost my turn in the queue, so I can arrive right as the printer finishes and start my job immediately.
- As a student, I want to receive an alert if my print encounters a spaghetti error, so I can go fix it before it wastes more time and material.
- As a student, I want to log in with my UW email, so my queue history and penalty record are tied to my identity.

### TA (Admin)

- As a TA, I want to see a dashboard of all 4 printers' live status, remaining time, and queue, so I can manage the lab without checking each machine individually.
- As a TA, I want to receive a Teams alert when filament is running low on any printer, so I can restock before it causes a failed print.
- As a TA, I want to receive a Teams alert when a spaghetti error is detected, so I can intervene if the student is unresponsive.
- As a TA, I want to see each student's no-show history and manage penalties, so I can maintain fair and efficient use of the lab.
- As a TA, I want to export usage logs per printer and per student, so I can report on lab utilization.

---

## Core Features

### 1. Real-Time Printer Dashboard
- Display live status for all 4 Bambu Lab X1 Carbon printers (printing, idle, error)
- Show remaining print time per printer
- Pull data via Bambu Lab local API (MQTT)

### 2. Authentication
- UW email login via Supabase Auth
- Role-based access: Student vs. TA

### 3. Queue System
- Students can join a per-printer queue
- Max 2-3 active slots per printer; overflow goes to secondary waitlist
- Queue position visible to all logged-in users

### 4. Smart Notifications via Microsoft Teams Webhook
- **Current print owner:** alert when job is ~15 min from completion
- **Next in queue:** alert when ~20 min from completion ("start heading over")
- **Current print owner:** alert on spaghetti error detection
- **TA:** alert on spaghetti error, filament low, printer idle too long

### 5. No-Show and Penalty System
- When notified, student has a set window to confirm arrival (exact threshold TBD with developer)
- Missing the window = auto-skip and strike recorded
- Repeat no-shows result in temporary queue ban (exact threshold TBD with developer)
- TA can view and override penalties via admin panel

### 6. AI-Assisted Completion Time Prediction
- Use historical print data to improve completion time estimates beyond Bambu's built-in timer
- More accurate predictions = better-timed notifications = smaller idle gap between jobs

### 7. TA Admin Panel
- Full lab overview (all printers, all queues)
- Per-student and per-printer usage logs
- Penalty management
- Exportable usage report

---

## Acceptance Criteria

| Feature | Criteria |
|---------|----------|
| Dashboard | All 4 printers show live status and remaining time, updated within 30 seconds |
| Auth | Students and TAs can log in with UW email; roles are correctly assigned |
| Queue | Students can join, leave, and view their position; max slots enforced per printer |
| Notifications | Teams messages are sent to the correct person at the correct trigger point |
| No-show | Auto-skip fires correctly after window expires; strike is recorded in DB |
| Penalty | Student with 3+ strikes cannot join queue; TA can override |
| Admin panel | TA can view all queues, logs, and manage penalties from a single view |
| AI prediction | Completion time estimate improves over baseline after 20+ historical data points |

---

## Out of Scope

- Remote print job initiation (send file to printer from app)
- Printer reservation / time slot booking
- Support for printers outside GIX Prototyping Lab
- Mobile app (web only)

---

## Tech Stack

| Layer | Choice |
|-------|--------|
| Frontend | Next.js |
| Backend / DB | Supabase (Auth + Postgres) |
| Printer Integration | Bambu Lab Local API (MQTT via `bambulabs_api`) |
| Notifications | Microsoft Teams Incoming Webhook |
| AI | TBD with developer (completion time prediction model) |
| Deployment | TBD with developer |
