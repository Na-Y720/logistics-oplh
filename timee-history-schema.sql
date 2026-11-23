create table public.logistics_timee_wms_history (
 owner_id uuid not null references auth.users(id) on delete cascade,
 work_date date not null,worker_code text not null check(worker_code in ('800001','800002','800003')),
 worker_name text,paid_minutes integer check(paid_minutes between 1 and 1440),
 sessions jsonb not null check(jsonb_typeof(sessions)='array'),
 picking_minutes integer not null check(picking_minutes>=0),action_count integer not null check(action_count>0),
 source_filename text not null,is_active boolean not null default true,
 imported_at timestamptz not null default now(),
 primary key(owner_id,work_date,worker_code)
);
alter table public.logistics_timee_wms_history enable row level security;
create policy timee_history_owner on public.logistics_timee_wms_history for all to authenticated using((select auth.uid())=owner_id) with check((select auth.uid())=owner_id);
grant select,insert,update on public.logistics_timee_wms_history to authenticated;
create function public.replace_timee_wms_history(p_start date,p_end date,p_rows jsonb) returns void
language plpgsql security invoker set search_path='' as $$
begin
 if auth.uid() is null or p_start>p_end or jsonb_typeof(p_rows)<>'array' then raise exception 'Invalid import'; end if;
 if exists(select 1 from jsonb_array_elements(p_rows) r where (r->>'work_date')::date not between p_start and p_end) then raise exception 'Date outside import period'; end if;
 update public.logistics_timee_wms_history set is_active=false where owner_id=auth.uid() and work_date between p_start and p_end;
 insert into public.logistics_timee_wms_history(owner_id,work_date,worker_code,sessions,picking_minutes,action_count,source_filename,is_active,imported_at)
 select auth.uid(),r.work_date,r.worker_code,r.sessions,r.picking_minutes,r.action_count,r.source_filename,true,now()
 from jsonb_to_recordset(p_rows) as r(work_date date,worker_code text,sessions jsonb,picking_minutes integer,action_count integer,source_filename text)
 on conflict(owner_id,work_date,worker_code) do update set sessions=excluded.sessions,picking_minutes=excluded.picking_minutes,action_count=excluded.action_count,source_filename=excluded.source_filename,is_active=true,imported_at=now();
end $$;
revoke all on function public.replace_timee_wms_history(date,date,jsonb) from public;
grant execute on function public.replace_timee_wms_history(date,date,jsonb) to authenticated;
