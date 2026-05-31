-- GIX 3D Printer Hub — Full Schema
-- Run this in the Supabase SQL Editor for a fresh project.

-- ── Extensions ────────────────────────────────────────────────────────────────
create extension if not exists "pgcrypto";

-- ── Enums ─────────────────────────────────────────────────────────────────────
do $$ begin
  create type printer_status as enum ('idle', 'printing', 'error');
exception when duplicate_object then null; end $$;

do $$ begin
  create type user_role as enum ('student', 'ta');
exception when duplicate_object then null; end $$;

-- ── Tables ────────────────────────────────────────────────────────────────────

create table if not exists public.printers (
  id             uuid primary key default gen_random_uuid(),
  name           text not null,
  status         text not null default 'idle',
  time_remaining integer,
  filament_level integer,                                          -- kept for back-compat; no longer written by the poller
  error_code     text,                                             -- raw Bambu error code when status = error (mapping to text is future work)
  active_user_id uuid references public.profiles(id) on delete set null, -- who is currently printing (claimed via "I've Started")
  updated_at     timestamptz
);

-- Existing databases: add the new columns if the table predates them.
alter table public.printers add column if not exists error_code     text;
alter table public.printers add column if not exists active_user_id uuid references public.profiles(id) on delete set null;

create table if not exists public.profiles (
  id          uuid primary key references auth.users(id) on delete cascade,
  full_name   text,
  email       text,
  student_id  text,
  role        text not null default 'student',
  strikes     integer not null default 0,
  is_banned   boolean not null default false,
  created_at  timestamptz default now()
);

create table if not exists public.queues (
  id          uuid primary key default gen_random_uuid(),
  printer_id  uuid not null references public.printers(id) on delete cascade,
  user_id     uuid not null references public.profiles(id) on delete cascade,
  tier        text not null default 'active',
  created_at  timestamptz default now(),
  notified_at timestamptz,
  started_at  timestamptz,
  unique (printer_id, user_id)
);

create table if not exists public.no_show_records (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references public.profiles(id) on delete cascade,
  printer_id    uuid not null references public.printers(id) on delete cascade,
  note          text,
  overridden_by uuid references public.profiles(id),
  overridden_at timestamptz,
  created_at    timestamptz default now()
);

-- ── Seed printers (fixed UUIDs so the poller config stays stable) ─────────────
insert into public.printers (id, name, status) values
  ('11111111-1111-1111-1111-111111111111', 'Bambu X1C #1', 'idle'),
  ('22222222-2222-2222-2222-222222222222', 'Bambu X1C #2', 'idle'),
  ('33333333-3333-3333-3333-333333333333', 'Bambu X1C #3', 'idle'),
  ('44444444-4444-4444-4444-444444444444', 'Bambu X1C #4', 'idle')
on conflict (id) do nothing;

-- ── Auto-create profile on signup ─────────────────────────────────────────────
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, email, full_name)
  values (
    new.id,
    new.email,
    new.raw_user_meta_data->>'full_name'
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- ── SECURITY DEFINER helper (avoids RLS recursion) ───────────────────────────
create or replace function public.is_ta()
returns boolean language sql security definer set search_path = public as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'ta'
  );
$$;

-- ── Queue size limit (max 3 per printer) ─────────────────────────────────────
create or replace function public.enforce_queue_limit()
returns trigger language plpgsql as $$
begin
  if (select count(*) from public.queues where printer_id = new.printer_id) >= 3 then
    raise exception 'Queue is full (max 3)';
  end if;
  return new;
end;
$$;

drop trigger if exists queue_limit on public.queues;
create trigger queue_limit
  before insert on public.queues
  for each row execute function public.enforce_queue_limit();

-- ── Claim a printer ("I've Started") ──────────────────────────────────────────
-- Clients cannot write public.printers directly (RLS limits writes to TAs), so
-- claiming goes through this SECURITY DEFINER function. The caller must be in the
-- printer's queue and the printer must not already have an active user. On success
-- the caller becomes active_user_id and is removed from the waitlist.
create or replace function public.claim_printer(p_printer_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'Not authenticated';
  end if;
  if not exists (
    select 1 from public.queues
    where printer_id = p_printer_id and user_id = v_uid
  ) then
    raise exception 'You are not in this queue';
  end if;

  update public.printers
    set active_user_id = v_uid
    where id = p_printer_id and active_user_id is null;
  if not found then
    raise exception 'Printer already claimed';
  end if;

  delete from public.queues
    where printer_id = p_printer_id and user_id = v_uid;
end;
$$;

grant execute on function public.claim_printer(uuid) to authenticated;

-- ── Row Level Security ────────────────────────────────────────────────────────
alter table public.printers        enable row level security;
alter table public.profiles        enable row level security;
alter table public.queues          enable row level security;
alter table public.no_show_records enable row level security;

-- printers: anyone can read; only TAs can write
drop policy if exists "printers_select_all"    on public.printers;
drop policy if exists "printers_modify_ta"     on public.printers;
create policy "printers_select_all"  on public.printers for select using (true);
create policy "printers_modify_ta"   on public.printers for all    using (public.is_ta());

-- profiles: users read/update their own; TAs read all
drop policy if exists "profiles_select_own"           on public.profiles;
drop policy if exists "profiles_select_authenticated" on public.profiles;
drop policy if exists "profiles_update_own"           on public.profiles;
drop policy if exists "profiles_all_ta"               on public.profiles;
create policy "profiles_select_authenticated" on public.profiles for select using (auth.role() = 'authenticated');
create policy "profiles_update_own"           on public.profiles for update using (auth.uid() = id);
create policy "profiles_all_ta"               on public.profiles for all    using (public.is_ta());

-- queues: authenticated users insert/read; users delete own; TAs full access
drop policy if exists "queues_select_all"    on public.queues;
drop policy if exists "queues_insert_own"    on public.queues;
drop policy if exists "queues_delete_own"    on public.queues;
drop policy if exists "queues_update_own"    on public.queues;
drop policy if exists "queues_all_ta"        on public.queues;
create policy "queues_select_all"  on public.queues for select using (true);
create policy "queues_insert_own"  on public.queues for insert with check (auth.uid() = user_id);
create policy "queues_delete_own"  on public.queues for delete using (auth.uid() = user_id);
create policy "queues_update_own"  on public.queues for update using (auth.uid() = user_id);
create policy "queues_all_ta"      on public.queues for all    using (public.is_ta());

-- no_show_records: TAs full access; users read their own
drop policy if exists "no_show_select_own" on public.no_show_records;
drop policy if exists "no_show_all_ta"     on public.no_show_records;
create policy "no_show_select_own" on public.no_show_records for select using (auth.uid() = user_id);
create policy "no_show_all_ta"     on public.no_show_records for all    using (public.is_ta());
