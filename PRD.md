# PRD: GIX Printer Hub Queue & Notification Update

## Overview

GIX Printer Hub helps students coordinate use of the GIX Prototyping Lab's Bambu Lab printers without physically waiting beside a machine. The product should act as a lightweight coordination and notification tool, not a hard access-control system.

This update revises the queue policy, removes unreliable filament display from the MVP, and adds more useful printer error details to the dashboard.

---

## Goals

- Help students know which printers are available, in use, or in error.
- Notify students in queue order when a printer becomes available.
- Reduce idle time between print jobs without making the system feel overly restrictive.
- Provide enough error detail for students or TAs to understand whether a printer needs attention.
- Keep enforcement lightweight, transparent, and reversible by a TA.

---

## Non-Goals

- The app will not physically prevent students from using a printer.
- The app will not start print jobs remotely.
- The app will not guarantee perfect detection of who physically started a print.
- The app will not display filament remaining in the MVP.
- The app will not use filament data for queue decisions or penalties.

---

## Key Product Changes

### 1. Remove Filament From MVP

Current concern: Bambu telemetry may not reliably expose remaining filament. It may expose usage or other partial filament data, but not a trustworthy "remaining amount" value.

Decision:

- Remove filament remaining display from the MVP dashboard.
- Do not use filament data for queue decisions.
- Do not trigger notifications based on filament data.
- If filament data becomes reliable later, it can be reintroduced as optional printer telemetry.

Expected UI behavior:

- Printer cards should not show a filament percentage.
- No low-filament warning should appear in the MVP.

---

### 2. Add Printer Error Details

Current concern: showing only `Error` is not enough. Bambu printers usually report some reason or error detail, and that information is useful.

Decision:

- When a printer reports an error, the dashboard should show both:
  - the general state: `Error`
  - the specific reason, when available

Examples:

- `Filament runout`
- `AMS issue`
- `Nozzle temperature error`
- `Print paused`
- `Build plate detection failed`
- `Printer needs attention` fallback if no specific reason is available

Expected UI behavior:

- Summary area may show a short `Error` tag.
- Printer card should show the detailed error reason.
- If error detail is unavailable, show `Printer needs attention`.

Suggested data model:

```sql
alter table public.printers
add column if not exists error_code text,
add column if not exists error_message text;
```

Poller should write `error_code` and/or `error_message` when Bambu telemetry provides it.

---

## Revised Queue Policy

The queue should work as a notification-assisted waitlist, not a hard reservation lock.

### Queue Behavior

1. A student joins a waitlist for a printer.
2. When the printer becomes available, the first student in line receives an email notification.
3. That student has a short priority window to claim the printer.
4. If no action is taken within the window, the next student in line receives a notification.
5. The notification window continues down the list until someone confirms they are starting or the queue is empty.

Recommended priority window:

- 5 minutes

Button language:

- Prefer `I'm starting now` or `Confirm start`
- Avoid language that implies the app can physically control the printer

---

## Queue Compliance & Warnings

The app cannot perfectly know who physically started a print unless students reliably confirm through the app. Therefore, the system should use a soft enforcement model.

### Warning Scenario

A warning may be recorded when:

- a student confirms start before their notification window begins, or
- a student appears to skip ahead of another student who still has an active priority window

The system should treat this as a possible queue skip, not an automatically proven violation.

### Restriction Policy

Recommended policy:

- 1 warning: warning email
- 2 warnings: stronger warning email
- 3 warnings: temporary queue restriction
- Restriction duration: 3 days

During restriction:

- user cannot join new printer queues
- existing active queue entries may be removed or left for TA review, depending on final policy

Suggested profile fields:

```sql
alter table public.profiles
add column if not exists warning_count integer not null default 0,
add column if not exists restricted_until timestamptz;
```

Suggested warning records:

```sql
create table if not exists public.queue_warnings (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  printer_id uuid references public.printers(id) on delete set null,
  queue_id uuid references public.queues(id) on delete set null,
  reason text not null,
  created_at timestamptz default now(),
  reviewed_by uuid references public.profiles(id),
  reviewed_at timestamptz,
  dismissed_at timestamptz
);
```

---

## TA Review / Override

Because queue compliance is partly inferred, TA override is important.

TA should be able to:

- view queue warnings
- dismiss a warning
- clear a user's warning count
- remove a temporary restriction
- manually restrict a user if needed
- view recent queue events for context

This can be part of a later `/admin` route.

---

## Suggested Queue Event Tracking

To make the system auditable, add a lightweight event log.

```sql
create table if not exists public.queue_events (
  id uuid primary key default gen_random_uuid(),
  printer_id uuid references public.printers(id) on delete set null,
  queue_id uuid references public.queues(id) on delete set null,
  user_id uuid references public.profiles(id) on delete set null,
  event_type text not null,
  metadata jsonb,
  created_at timestamptz default now()
);
```

Example event types:

- `joined_queue`
- `left_queue`
- `printer_available`
- `notification_sent`
- `notification_expired`
- `start_confirmed`
- `possible_skip_detected`
- `warning_sent`
- `restriction_started`
- `restriction_cleared`

---

## User Flows

### Printer Becomes Available

1. Poller detects printer changed from `printing` to `idle`.
2. App checks queue for that printer.
3. First queued student receives email.
4. Queue entry stores:
   - `notified_at`
   - `claim_expires_at`
5. Dashboard shows the student that it is their turn.
6. Student clicks `I'm starting now`.
7. Queue entry stores `started_at`.

### No Action After Priority Window

1. First student is notified.
2. 5 minutes pass without `started_at`.
3. First student's priority window expires.
4. Next queued student receives notification.
5. This continues until someone confirms or queue is empty.

### Possible Queue Skip

1. Student B confirms start while Student A still has an active priority window.
2. System records `possible_skip_detected`.
3. Student B receives a warning email.
4. Warning count increments.
5. If warning count reaches 3, `restricted_until` is set to 3 days in the future.

---

## Dashboard Requirements

### Printer Summary

Each printer summary should show:

- printer nickname/name
- simplified status:
  - `Available`
  - `{minutes} left`
  - `Error`
- no filament percentage in MVP

### Printer Card

Each printer card should show:

- printer name
- current status
- remaining time when printing
- detailed error reason when in error state
- active queue
- waitlist
- current user's queue state
- primary action:
  - `Join queue`
  - `Leave queue`
  - `I'm starting now`

### Error State

If `status = error`:

- show `Error`
- show `error_message` if present
- fallback to `Printer needs attention`

---

## Email Requirements

### Turn Notification

Send when a student gets the priority window.

Must include:

- printer name
- priority window length
- link to dashboard
- instruction to confirm when starting

### Window Expired

Optional email to the skipped student.

Must be worded gently:

- explain their priority window expired
- no penalty unless policy says repeated behavior counts

### Warning Email

Send when possible queue skip is detected.

Must include:

- printer name
- reason for warning
- current warning count
- restriction threshold
- how to contact TA if incorrect

### Restriction Email

Send when warning count reaches threshold.

Must include:

- restriction duration
- reason
- when queue access returns
- TA contact path

---

## Acceptance Criteria

- Filament percentage is not shown in the dashboard MVP.
- Printer error cards show a specific Bambu error reason when available.
- If no error reason is available, UI shows `Printer needs attention`.
- When a printer becomes available, first queued student receives notification.
- If the first student does not confirm within 5 minutes, the next student receives notification.
- Queue notification timestamps are stored.
- A possible queue skip can generate a warning record.
- Three warnings can create a 3-day queue restriction.
- Restricted users cannot join new queues.
- TA can later review and clear warnings/restrictions through admin UI.

---

## Open Questions

- Can Bambu telemetry reliably identify specific error codes and messages for all expected error states?
- Should missing a 5-minute window count as a warning, or only starting before your turn?
- Should the first student receive an "expired window" email?
- Should restrictions apply per user globally or only per printer?
- Should warning count reset after a time period, such as each quarter or semester?
- Who should receive TA review notifications?
