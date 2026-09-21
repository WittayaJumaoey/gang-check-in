create table if not exists public.gang_state (
  id text primary key default 'shared',
  gangs jsonb not null default '[]'::jsonb,
  checks jsonb not null default '[]'::jsonb,
  payments jsonb not null default '[]'::jsonb,
  updated_at timestamptz not null default now()
);

insert into public.gang_state (id)
values ('shared')
on conflict (id) do nothing;

alter table public.gang_state enable row level security;

drop policy if exists "Anyone can read shared gang state" on public.gang_state;
drop policy if exists "Anyone can insert shared gang state" on public.gang_state;
drop policy if exists "Anyone can update shared gang state" on public.gang_state;

create policy "Anyone can read shared gang state"
  on public.gang_state for select
  to anon, authenticated
  using (id = 'shared');

create policy "Anyone can insert shared gang state"
  on public.gang_state for insert
  to anon, authenticated
  with check (id = 'shared');

create policy "Anyone can update shared gang state"
  on public.gang_state for update
  to anon, authenticated
  using (id = 'shared')
  with check (id = 'shared');
