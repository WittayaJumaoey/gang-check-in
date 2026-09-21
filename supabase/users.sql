-- User access data for the future Supabase Auth migration.
-- This does not replace Supabase Auth by itself.
-- The current frontend login still uses lib/gang/index.js.

create extension if not exists pgcrypto;

create table if not exists public.allowed_users (
  username text primary key,
  password_hash text not null,
  display_name text not null,
  enabled boolean not null default true,
  created_at timestamptz not null default now()
);

alter table public.allowed_users enable row level security;

drop policy if exists "Users can read enabled access records" on public.allowed_users;
create policy "Users can read enabled access records"
  on public.allowed_users for select
  to anon, authenticated
  using (enabled = true);

insert into public.allowed_users (username, password_hash, display_name)
values ('Admin', crypt('3648482', gen_salt('bf')), 'Administrator')
on conflict (username) do update
set password_hash = excluded.password_hash,
    display_name = excluded.display_name,
    enabled = true;

-- Check the user without exposing the password:
-- select username, display_name, enabled from public.allowed_users;
