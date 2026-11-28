-- Atomic TimeDesigner import; exact CSV dates, never a continuous date range.
create or replace function public.import_td_exact_days(p_month text,p_filename text,p_dates date[],p_rows jsonb,p_source_rows integer,p_metadata jsonb)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare u uuid:=auth.uid(); b uuid; ps date; pe date; n integer; stamp timestamptz:=now();
begin
 if u is null or p_month !~ '^[0-9]{4}-[0-9]{2}$' or coalesce(cardinality(p_dates),0)=0 or jsonb_typeof(p_rows) is distinct from 'array' or jsonb_array_length(p_rows)=0 then raise exception 'Invalid import'; end if;
 pe:=(p_month||'-20')::date; ps:=(pe-interval '1 month'+interval '1 day')::date;
 if exists(select 1 from unnest(p_dates) d where d is null or d not between ps and pe) or exists(select 1 from jsonb_array_elements(p_rows) r where (r->>'work_date') is null or not ((r->>'work_date')::date=any(p_dates))) then raise exception 'Date outside import period'; end if;
 perform pg_advisory_xact_lock(hashtextextended(u::text||p_month||'timedesigner',0));
 if exists(select 1 from public.logistics_cost_monthly where owner_id=u and month_ym=p_month and status='confirmed') then raise exception 'Month locked'; end if;
 insert into public.oplh_import_batches(owner_id,source,source_filename,period_start,period_end,source_rows,aggregate_rows) values(u,'timedesigner',p_filename,(select min(d) from unnest(p_dates)d),(select max(d) from unnest(p_dates)d),p_source_rows,jsonb_array_length(p_rows)) returning id into b;
 delete from public.oplh_timedesigner_daily where owner_id=u and work_date=any(p_dates);
 insert into public.oplh_timedesigner_daily(owner_id,work_date,staff_id,worker_key,employee_no,worker_name,source_department,activity_key,activity_label,event_count,work_minutes,batch_id)
 select u,r.work_date,r.staff_id,r.worker_key,r.employee_no,r.worker_name,r.source_department,r.activity_key,r.activity_label,r.event_count,r.work_minutes,b from jsonb_to_recordset(p_rows) r(work_date date,staff_id uuid,worker_key text,employee_no text,worker_name text,source_department text,activity_key text,activity_label text,event_count integer,work_minutes numeric);
 get diagnostics n=row_count;
 delete from public.logistics_cost_import_batches where owner_id=u and month_ym=p_month and source='timedesigner';
 insert into public.logistics_cost_import_batches(owner_id,month_ym,source,source_filename,source_rows,period_start,period_end,metadata,imported_at) values(u,p_month,'timedesigner',p_filename,p_source_rows,ps,pe,coalesce(p_metadata,'{}'::jsonb)||jsonb_build_object('target_dates',p_dates,'aggregate_rows',n,'last_batch_id',b,'replace_rule','exact dates'),stamp);
 return jsonb_build_object('status','success','rows',n,'dates',p_dates,'imported_at',stamp);
end $$;
revoke execute on function public.import_td_exact_days(text,text,date[],jsonb,integer,jsonb) from public,anon;
grant execute on function public.import_td_exact_days(text,text,date[],jsonb,integer,jsonb) to authenticated;
