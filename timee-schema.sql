create table public.logistics_timee_work_time (
 id uuid primary key default gen_random_uuid(),
 owner_id uuid not null references auth.users(id) on delete cascade,
 work_date date not null,
 worker_code text not null check (worker_code ~ '^800[0-9]{3}$' or (work_date < date '2026-10-07' and worker_code ~ '^90000[1-5]$')),
 worker_name text not null check (length(trim(worker_name)) between 1 and 100),
 first_start time not null,
 first_end time not null,
 second_start time,
 second_end time,
 paid_minutes integer not null check (paid_minutes between 1 and 1440),
 picking_minutes integer generated always as ((extract(epoch from (first_end-first_start))/60 + coalesce(extract(epoch from (second_end-second_start))/60,0))::integer) stored,
 note text not null default '',
 updated_at timestamptz not null default now(),
 unique(owner_id,work_date,worker_code),
 check(first_end>first_start),
 check((second_start is null and second_end is null) or (second_start is not null and second_end is not null and second_end>second_start and second_start>=first_end)),
 check (paid_minutes >= (extract(epoch from (first_end-first_start))/60 + coalesce(extract(epoch from (second_end-second_start))/60,0)))
);
alter table public.logistics_timee_work_time enable row level security;
create policy timee_owner on public.logistics_timee_work_time for all to authenticated using ((select auth.uid())=owner_id) with check ((select auth.uid())=owner_id);
grant select,insert,update on public.logistics_timee_work_time to authenticated;
