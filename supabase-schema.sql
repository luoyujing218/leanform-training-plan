-- Run this SQL in the Supabase SQL Editor.
-- Public visitors may only read records. The allowlisted owner account can write.
create table if not exists public.leanform_records (
  owner_id uuid not null references auth.users(id) on delete cascade,
  data_key text not null check (data_key in ('weights','loads_v2','done_v2','health')),
  value jsonb not null,
  updated_at timestamptz not null default now(),
  primary key (owner_id, data_key)
);
create table if not exists public.leanform_owners (
  owner_id uuid primary key references auth.users(id) on delete cascade
);

alter table public.leanform_records enable row level security;
alter table public.leanform_owners enable row level security;
revoke all on public.leanform_records from anon;
revoke all on public.leanform_owners from anon;
grant select on public.leanform_records to anon;
grant select, insert, update, delete on public.leanform_records to authenticated;
grant select on public.leanform_owners to authenticated;

drop policy if exists "Public can view shared records" on public.leanform_records;
create policy "Public can view shared records"
on public.leanform_records for select to anon, authenticated using (true);
drop policy if exists "Owner reads own authorization" on public.leanform_owners;
create policy "Owner reads own authorization" on public.leanform_owners
for select to authenticated using (owner_id = (select auth.uid()));

drop policy if exists "Owner can insert records" on public.leanform_records;
create policy "Owner can insert records"
on public.leanform_records for insert to authenticated
with check (owner_id = (select auth.uid()) and exists (select 1 from public.leanform_owners o where o.owner_id = (select auth.uid())));
drop policy if exists "Owner can update records" on public.leanform_records;
create policy "Owner can update records"
on public.leanform_records for update to authenticated
using (owner_id = (select auth.uid()) and exists (select 1 from public.leanform_owners o where o.owner_id = (select auth.uid())))
with check (owner_id = (select auth.uid()) and exists (select 1 from public.leanform_owners o where o.owner_id = (select auth.uid())));
drop policy if exists "Owner can delete records" on public.leanform_records;
create policy "Owner can delete records"
on public.leanform_records for delete to authenticated
using (owner_id = (select auth.uid()) and exists (select 1 from public.leanform_owners o where o.owner_id = (select auth.uid())));

-- Enable Postgres Changes so public visitors receive live read-only updates.
do $$ begin
  alter publication supabase_realtime add table public.leanform_records;
exception when duplicate_object then null;
end $$;