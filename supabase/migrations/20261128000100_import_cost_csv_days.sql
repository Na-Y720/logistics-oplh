-- Replace all outputs of a dated CSV in a single invoker transaction.
create or replace function public.import_cost_csv_days(p_month text, p_source text, p_file text,
 p_dates date[], p_rows jsonb, p_count integer, p_meta jsonb, p_inventory jsonb, p_timee jsonb)
returns void language plpgsql security invoker set search_path = public, pg_temp as $$
declare
 actor uuid := auth.uid();
 month_start date := (to_date(p_month || '-01','YYYY-MM-DD') - interval '1 month' + interval '20 days')::date;
 month_end date := to_date(p_month || '-20','YYYY-MM-DD');
 batch uuid;
 prior inventory_wms_sources%rowtype;
 retained jsonb;
 day date;
begin
 if actor is null or p_source is null or p_source not in ('wms','timedesigner')
    or p_month is null or p_month <> to_char(month_end,'YYYY-MM') or coalesce(cardinality(p_dates),0)=0
    or exists(select from unnest(p_dates) d where d is null or d not between month_start and month_end)
    or coalesce(jsonb_array_length(p_rows),0)=0 or coalesce(p_count,0)<1
 then raise exception '対象月度または取込データが不正です'; end if;
 perform pg_advisory_xact_lock(hashtextextended(actor::text || p_month,0));
 if exists(select from logistics_cost_monthly where owner_id=actor and month_ym=p_month and status='confirmed' for update)
 then raise exception '確定済み月には取り込めません'; end if;
 if p_source='wms' and (jsonb_typeof(p_inventory->'headers') is distinct from 'array'
    or jsonb_typeof(p_inventory->'records') is distinct from 'array' or jsonb_typeof(p_timee) is distinct from 'array')
 then raise exception 'WMS関連明細が不正です'; end if;
 if exists(select from jsonb_array_elements(p_rows || coalesce(p_inventory->'records','[]') || coalesce(p_timee,'[]')) r
    where (r->>'work_date') is null or not ((r->>'work_date')::date = any(p_dates)))
 then raise exception '対象日以外の明細があります'; end if;
 insert into oplh_import_batches(owner_id,source,source_filename,period_start,period_end,source_rows,aggregate_rows)
 values(actor,p_source,p_file,month_start,month_end,p_count,jsonb_array_length(p_rows)) returning id into batch;
 if p_source='timedesigner' then
   delete from oplh_timedesigner_daily where owner_id=actor and work_date=any(p_dates);
   insert into oplh_timedesigner_daily(owner_id,batch_id,work_date,staff_id,worker_key,employee_no,worker_name,source_department,activity_key,activity_label,event_count,work_minutes)
   select actor,batch,r.work_date,r.staff_id,r.worker_key,r.employee_no,r.worker_name,r.source_department,r.activity_key,r.activity_label,r.event_count,r.work_minutes
   from jsonb_populate_recordset(null::oplh_timedesigner_daily,p_rows) r;
 else
   delete from oplh_wms_daily where owner_id=actor and work_date=any(p_dates) and not starts_with(worker_key,'BI_SUPPLEMENT:');
   insert into oplh_wms_daily(owner_id,batch_id,work_date,staff_id,worker_key,worker_code,worker_name,activity_key,activity_label,action_count,quantity)
   select actor,batch,r.work_date,r.staff_id,r.worker_key,r.worker_code,r.worker_name,r.activity_key,r.activity_label,r.action_count,r.quantity
   from jsonb_populate_recordset(null::oplh_wms_daily,p_rows) r;
   delete from oplh_wms_daily s where s.owner_id=actor and s.work_date=any(p_dates) and starts_with(s.worker_key,'BI_SUPPLEMENT:')
   and exists(select from oplh_wms_daily d where d.owner_id=actor and d.work_date between month_start and month_end
     and not starts_with(d.worker_key,'BI_SUPPLEMENT:') and d.worker_code is not distinct from s.worker_code and d.activity_key=s.activity_key);
   foreach day in array p_dates loop
     perform replace_timee_wms_history(day,day,coalesce((select jsonb_agg(r) from jsonb_array_elements(p_timee) r where (r->>'work_date')::date=day),'[]'));
   end loop;
   select * into prior from inventory_wms_sources where owner_id=actor and month_ym=p_month for update;
   select coalesce(jsonb_agg(r order by n),'[]') into retained from jsonb_array_elements(prior.records) with ordinality a(r,n)
   where (r->>'work_date') is null or not ((r->>'work_date')::date=any(p_dates));
   if retained <> '[]' and prior.headers is distinct from p_inventory->'headers' then
     raise exception '既存明細とCSVの列構成が異なります。同じ列構成で再出力してください'; end if;
   insert into inventory_wms_sources(owner_id,month_ym,period_start,period_end,source_filename,headers,records,mapping,source_rows,period_rows,unparsed_rows,imported_at)
   values(actor,p_month,month_start,month_end,p_file,p_inventory->'headers',retained || (p_inventory->'records'),
     case when prior.headers=p_inventory->'headers' then prior.mapping end,(p_inventory->>'sourceRows')::integer,(p_meta->>'period_rows')::integer,0,now())
   on conflict(owner_id,month_ym) do update set source_filename=excluded.source_filename,headers=excluded.headers,records=excluded.records,
     mapping=excluded.mapping,source_rows=excluded.source_rows,period_rows=excluded.period_rows,unparsed_rows=excluded.unparsed_rows,imported_at=now();
 end if;
 delete from oplh_import_batches b where b.owner_id=actor and b.source=p_source and b.period_start=month_start and b.period_end=month_end and b.id<>batch
   and not exists(select from oplh_wms_daily w where w.batch_id=b.id)
   and not exists(select from oplh_timedesigner_daily t where t.batch_id=b.id);
 delete from logistics_cost_import_batches where owner_id=actor and month_ym=p_month and source=p_source;
 insert into logistics_cost_import_batches(owner_id,month_ym,source,source_filename,source_rows,period_start,period_end,metadata)
 values(actor,p_month,p_source,p_file,p_count,month_start,month_end,p_meta || jsonb_build_object('target_dates',p_dates,'aggregate_rows',jsonb_array_length(p_rows)));
end $$;
revoke all on function public.import_cost_csv_days(text,text,text,date[],jsonb,integer,jsonb,jsonb,jsonb) from public, anon;
grant execute on function public.import_cost_csv_days(text,text,text,date[],jsonb,integer,jsonb,jsonb,jsonb) to authenticated;
