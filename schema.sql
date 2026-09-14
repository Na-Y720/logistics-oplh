-- 365日出荷予測アプリ用テーブル
-- 既存 logistics_* テーブルには触れません。

create table if not exists public.forecast365_daily (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  forecast_date date not null,
  weekday text not null check (weekday in ('月','火','水','木','金','土','日')),
  event_type text not null default '通常',
  prior_year_actual integer not null default 0 check (prior_year_actual >= 0),
  data_state text not null default 'forecast' check (data_state in ('actual','forecast')),
  system_forecast integer not null default 0 check (system_forecast >= 0),
  manual_adjustment integer not null default 0,
  final_forecast integer not null default 0 check (final_forecast >= 0),
  required_people integer not null default 0 check (required_people >= 0),
  forecast_sagawa integer not null default 0 check (forecast_sagawa >= 0),
  forecast_nekopos integer not null default 0 check (forecast_nekopos >= 0),
  forecast_yupack integer not null default 0 check (forecast_yupack >= 0),
  actual_total integer check (actual_total is null or actual_total >= 0),
  actual_sagawa integer check (actual_sagawa is null or actual_sagawa >= 0),
  actual_nekopos integer check (actual_nekopos is null or actual_nekopos >= 0),
  actual_yupack integer check (actual_yupack is null or actual_yupack >= 0),
  actual_staff numeric(6,2) check (actual_staff is null or actual_staff >= 0),
  temp_staff numeric(6,2) check (temp_staff is null or temp_staff >= 0),
  completed_at time,
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (owner_id, forecast_date)
);

create table if not exists public.forecast365_rules (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  rule_group text not null,
  rule_key text not null,
  rule_value numeric(14,6) not null,
  sample_count integer not null default 0,
  auto_calculated boolean not null default true,
  source_period_start date,
  source_period_end date,
  updated_at timestamptz not null default now(),
  unique (owner_id, rule_group, rule_key)
);

create table if not exists public.forecast365_history (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  forecast_date date not null,
  captured_on date not null default current_date,
  captured_at timestamptz not null default now(),
  system_forecast integer not null check (system_forecast >= 0),
  manual_adjustment integer not null default 0,
  final_forecast integer not null check (final_forecast >= 0),
  source text not null default 'system',
  details jsonb not null default '{}'::jsonb
);

create index if not exists forecast365_daily_owner_date_idx
  on public.forecast365_daily(owner_id, forecast_date);
create index if not exists forecast365_history_owner_date_idx
  on public.forecast365_history(owner_id, forecast_date, captured_at desc);

alter table public.forecast365_daily enable row level security;
alter table public.forecast365_rules enable row level security;
alter table public.forecast365_history enable row level security;

drop policy if exists forecast365_daily_owner_all on public.forecast365_daily;
create policy forecast365_daily_owner_all on public.forecast365_daily
for all to authenticated
using ((select auth.uid()) = owner_id)
with check ((select auth.uid()) = owner_id);

drop policy if exists forecast365_rules_owner_all on public.forecast365_rules;
create policy forecast365_rules_owner_all on public.forecast365_rules
for all to authenticated
using ((select auth.uid()) = owner_id)
with check ((select auth.uid()) = owner_id);

drop policy if exists forecast365_history_owner_all on public.forecast365_history;
create policy forecast365_history_owner_all on public.forecast365_history
for all to authenticated
using ((select auth.uid()) = owner_id)
with check ((select auth.uid()) = owner_id);

grant select, insert, update, delete on public.forecast365_daily to authenticated;
grant select, insert, update, delete on public.forecast365_rules to authenticated;
grant select, insert, update, delete on public.forecast365_history to authenticated;
