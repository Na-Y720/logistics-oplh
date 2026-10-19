-- Inventory verification: independent of existing daily productivity aggregates.
begin;
create table public.inventory_wms_sources (
 id uuid primary key default gen_random_uuid(), owner_id uuid not null references auth.users(id),
 month_ym text not null check(month_ym ~ '^\d{4}-\d{2}$'), period_start date not null, period_end date not null,
 source_filename text not null, headers jsonb not null, records jsonb not null, mapping jsonb,
 source_rows integer not null, period_rows integer not null, unparsed_rows integer not null default 0,
 imported_at timestamptz not null default now(), unique(owner_id,month_ym), check(period_end>=period_start),
 check(jsonb_typeof(headers)='array' and jsonb_typeof(records)='array')
);
create table public.inventory_sessions (
 id uuid primary key default gen_random_uuid(), owner_id uuid not null references auth.users(id),
 name text not null check(length(trim(name))>0), season_year integer not null, season smallint not null check(season in (1,2)),
 start_at timestamptz not null, end_at timestamptz, source_filename text not null, snapshot jsonb not null,
 location_keys text[] not null check(cardinality(location_keys)>0), created_at timestamptz not null default now(),
 check(end_at is null or end_at>start_at), check(jsonb_typeof(snapshot->'items')='array'),
 check(extract(year from start_at at time zone 'Asia/Tokyo')=season_year),
 check((season=1 and extract(month from start_at at time zone 'Asia/Tokyo') in (1,2)) or (season=2 and extract(month from start_at at time zone 'Asia/Tokyo') in (7,8)))
);
create index inventory_sessions_owner_start on public.inventory_sessions(owner_id,start_at);
alter table public.inventory_wms_sources enable row level security;
alter table public.inventory_sessions enable row level security;
revoke all on public.inventory_wms_sources,public.inventory_sessions from anon,authenticated;
grant select,insert,update on public.inventory_wms_sources,public.inventory_sessions to authenticated;
create policy inventory_wms_own on public.inventory_wms_sources for all to authenticated using ((select auth.uid())=owner_id) with check ((select auth.uid())=owner_id);
create policy inventory_sessions_own on public.inventory_sessions for all to authenticated using ((select auth.uid())=owner_id) with check ((select auth.uid())=owner_id);
create function public.inventory_session_guard() returns trigger language plpgsql security invoker set search_path=public,pg_temp as $$
begin
 perform pg_advisory_xact_lock(hashtextextended(new.owner_id::text,0));
 if tg_op='UPDATE' and (new.owner_id,new.start_at,new.snapshot,new.location_keys,new.season,new.season_year,new.source_filename) is distinct from (old.owner_id,old.start_at,old.snapshot,old.location_keys,old.season,old.season_year,old.source_filename) then
  raise exception '開始日時と開始前CSVは登録後に変更できません';
 end if;
 if exists(select 1 from public.inventory_sessions s where s.owner_id=new.owner_id and s.id<>new.id and s.location_keys && new.location_keys and tstzrange(s.start_at,s.end_at,'[)') && tstzrange(new.start_at,new.end_at,'[)')) then
  raise exception '同じロケの棚卸し時間が重複しています。先の棚卸しの終了日時を登録してください';
 end if;
 return new;
end $$;
revoke all on function public.inventory_session_guard() from public,anon,authenticated;
create trigger inventory_session_guard before insert or update on public.inventory_sessions for each row execute function public.inventory_session_guard();
commit;
