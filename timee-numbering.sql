-- Serialize allocation per owner and work date, including simultaneous saves.
create or replace function public.assign_timee_worker_code()
returns trigger language plpgsql security invoker set search_path = '' as $$
declare next_number integer;
begin
 if TG_OP='INSERT' or NEW.work_date is distinct from OLD.work_date then
  perform pg_advisory_xact_lock(hashtext(NEW.owner_id::text), (NEW.work_date-date '2000-01-01')::integer);
  select coalesce(max(substring(t.worker_code from 4)::integer),0)+1 into next_number
  from public.logistics_timee_work_time t
  where t.owner_id=NEW.owner_id and t.work_date=NEW.work_date and t.worker_code ~ '^800[0-9]{3}$';
  if next_number>999 then raise exception 'この日のWMS番号は上限に達しました'; end if;
  NEW.worker_code := '800'||lpad(next_number::text,3,'0');
 end if;
 return NEW;
end $$;
create trigger timee_assign_worker_code before insert or update of work_date
on public.logistics_timee_work_time for each row execute function public.assign_timee_worker_code();
