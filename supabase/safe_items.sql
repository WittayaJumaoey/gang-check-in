-- รันไฟล์นี้ใน Supabase SQL Editor เพื่อให้ไอเทมตู้เซฟไม่หายหลังรีเฟรช
create table if not exists public.safe_items (
  scope text not null default 'shared',
  gang_id text not null,
  item_id text not null,
  name text not null,
  qty numeric not null default 0,
  image text,
  updated_at timestamptz not null default now(),
  primary key (scope, gang_id, item_id)
);

alter table public.safe_items enable row level security;

drop policy if exists "Anyone can read shared safe items" on public.safe_items;
drop policy if exists "Anyone can insert shared safe items" on public.safe_items;
drop policy if exists "Anyone can delete shared safe items" on public.safe_items;

create policy "Anyone can read shared safe items"
  on public.safe_items for select
  to anon, authenticated
  using (scope = 'shared');

create policy "Anyone can insert shared safe items"
  on public.safe_items for insert
  to anon, authenticated
  with check (scope = 'shared');

create policy "Anyone can delete shared safe items"
  on public.safe_items for delete
  to anon, authenticated
  using (scope = 'shared');
