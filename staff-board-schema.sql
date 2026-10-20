-- Additive setup. Never modifies logistics_staff or existing application data.
-- Run once, in one transaction, before releasing /staff-board.
create table public.logistics_board_assignments (
  owner_id uuid not null references auth.users(id),
  work_date date not null,
  staff_id uuid not null references public.logistics_staff(id) on delete restrict,
  am text,
  pm text,
  full_day boolean not null default false,
  revision integer not null default 1 check (revision > 0),
  updated_at timestamptz not null default now(),
  primary key (owner_id, work_date, staff_id),
  constraint board_am_place check (am is null or am in ('A','B','C','G','H','I','D','E','F','未配置','休憩 11:30','休憩 12:00','休憩 12:30','応援','補充','予備','欠勤')),
  constraint board_pm_place check (pm is null or pm in ('A','B','C','G','H','I','D','E','F','未配置','休憩 11:30','休憩 12:00','休憩 12:30','応援','補充','予備','欠勤')),
  constraint board_full_day check (not full_day or (am is not null and pm is not null and am = pm))
);
create index logistics_board_staff_idx on public.logistics_board_assignments (staff_id);
alter table public.logistics_board_assignments enable row level security;
revoke all on public.logistics_board_assignments from anon, authenticated;
grant select, insert, update on public.logistics_board_assignments to authenticated;
create policy board_read on public.logistics_board_assignments for select to authenticated
  using (owner_id = (select auth.uid()));
create policy board_insert on public.logistics_board_assignments for insert to authenticated
  with check (owner_id = (select auth.uid()) and exists (
    select 1 from public.logistics_staff s where s.id = staff_id and s.owner_id = (select auth.uid())
      and s.name not like '\_\_%'
      and (case when s.retirement_date is not null then work_date <= s.retirement_date else s.is_active end)
  ));
create policy board_update on public.logistics_board_assignments for update to authenticated
  using (owner_id = (select auth.uid()))
  with check (owner_id = (select auth.uid()) and exists (
    select 1 from public.logistics_staff s where s.id = staff_id and s.owner_id = (select auth.uid())
      and s.name not like '\_\_%'
      and (case when s.retirement_date is not null then work_date <= s.retirement_date else s.is_active end)
  ));
create function public.logistics_board_revision_guard() returns trigger
language plpgsql security invoker set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    if new.revision <> 1 then raise exception 'Invalid initial revision'; end if;
  else
    if new.owner_id <> old.owner_id or new.staff_id <> old.staff_id or new.work_date <> old.work_date then
      raise exception 'Assignment identity is immutable';
    end if;
    if new.revision <> old.revision + 1 then raise exception 'Stale revision'; end if;
  end if;
  new.updated_at := now();
  return new;
end;
$$;
revoke all on function public.logistics_board_revision_guard() from public, anon, authenticated;
create trigger logistics_board_revision before insert or update on public.logistics_board_assignments
  for each row execute function public.logistics_board_revision_guard();

