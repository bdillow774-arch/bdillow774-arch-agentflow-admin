create table if not exists admin_audit_logs (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default timezone('utc', now()),
  action text not null,
  resource_type text not null,
  resource_id text null,
  actor_user_id uuid null,
  actor_email text null,
  target_user_id text null,
  target_email text null,
  ip_address text null,
  user_agent text null,
  details jsonb null default '{}'::jsonb
);

create index if not exists admin_audit_logs_created_at_idx
  on admin_audit_logs (created_at desc);

create index if not exists admin_audit_logs_actor_user_id_idx
  on admin_audit_logs (actor_user_id);

create table if not exists subscription_events (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default timezone('utc', now()),
  provider text not null default 'revenuecat',
  event_id text not null unique,
  event_type text not null,
  app_user_id text null,
  original_transaction_id text null,
  product_id text null,
  store text null,
  environment text null,
  period_type text null,
  expiration_at timestamptz null,
  raw_payload jsonb not null
);

create index if not exists subscription_events_app_user_id_idx
  on subscription_events (app_user_id);

create table if not exists privacy_consents (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default timezone('utc', now()),
  user_id text not null,
  email text null,
  consent_type text not null,
  policy_version text null,
  granted boolean not null default true,
  granted_at timestamptz not null default timezone('utc', now()),
  metadata jsonb null default '{}'::jsonb
);

create index if not exists privacy_consents_user_id_idx
  on privacy_consents (user_id, consent_type, granted_at desc);

create table if not exists data_subject_requests (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  request_type text not null,
  status text not null default 'pending',
  user_id text null,
  email text null,
  submitted_by_user_id text null,
  submitted_by_email text null,
  notes text null,
  export_payload jsonb null,
  completed_at timestamptz null
);

create index if not exists data_subject_requests_status_idx
  on data_subject_requests (status, created_at desc);

create table if not exists user_activity_events (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default timezone('utc', now()),
  user_id text not null,
  email text null,
  event_type text not null,
  occurred_at timestamptz not null default timezone('utc', now()),
  location text null,
  city text null,
  state text null,
  county text null,
  zip_code text null,
  device_type text null,
  os_name text null,
  os_version text null,
  metadata jsonb null default '{}'::jsonb
);

create index if not exists user_activity_events_user_id_idx
  on user_activity_events (user_id, occurred_at desc);

create table if not exists open_house_lead_archive (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default timezone('utc', now()),
  original_lead_id text not null,
  session_id text null,
  property_name text null,
  property_address text null,
  city text null,
  state text null,
  county text null,
  zip_code text null,
  email text null,
  working_with_agent text null,
  lead_payload jsonb not null,
  archived_at timestamptz not null default timezone('utc', now()),
  archive_reason text null default 'deleted'
);

create index if not exists open_house_lead_archive_original_lead_id_idx
  on open_house_lead_archive (original_lead_id);

create unique index if not exists open_house_lead_archive_original_lead_id_key
  on open_house_lead_archive (original_lead_id);

alter table if exists open_house_lead_archive
  add column if not exists county text null;

alter table if exists user_activity_events
  add column if not exists county text null;

alter table if exists open_house_sessions
  add column if not exists property_county text null;

alter table if exists open_house_leads
  add column if not exists county text null;

create table if not exists usage_cost_monthly (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  month_start date not null,
  service text not null,
  amount numeric(12,2) not null default 0,
  usage_count integer null default 0,
  notes text null,
  metadata jsonb null default '{}'::jsonb,
  unique (month_start, service)
);

create index if not exists usage_cost_monthly_month_start_idx
  on usage_cost_monthly (month_start desc, service);

create or replace function archive_open_house_lead_on_delete()
returns trigger
language plpgsql
as $$
begin
  insert into open_house_lead_archive (
    original_lead_id,
    session_id,
    property_name,
    property_address,
    city,
    state,
    county,
    zip_code,
    email,
    working_with_agent,
    lead_payload,
    archived_at,
    archive_reason
  )
  values (
    old.id::text,
    old.session_id::text,
    coalesce(old.property_name, old.property_address),
    old.property_address,
    coalesce(old.city, old.property_city),
    coalesce(old.state, old.property_state),
    coalesce(old.county, old.property_county),
    coalesce(old.zip_code, old.zip, old.property_zip),
    old.email,
    old.working_with_agent,
    to_jsonb(old),
    timezone('utc', now()),
    'deleted'
  );

  return old;
end;
$$;

do $$
begin
  if exists (
    select 1
    from information_schema.tables
    where table_schema = 'public' and table_name = 'open_house_leads'
  ) then
    execute 'drop trigger if exists trg_archive_open_house_lead_on_delete on public.open_house_leads';
    execute 'create trigger trg_archive_open_house_lead_on_delete
      before delete on public.open_house_leads
      for each row
      execute function archive_open_house_lead_on_delete()';
  end if;
end;
$$;

create or replace function capture_profile_activity_event()
returns trigger
language plpgsql
as $$
declare
  next_device_type text;
  next_event_type text;
  next_location text;
begin
  next_device_type := coalesce(new.device_type, new.devise_type);
  next_location := new.last_location;

  if tg_op = 'INSERT' then
    next_event_type := 'profile_created';
  elsif new.last_login_at is distinct from old.last_login_at then
    next_event_type := 'login_observed';
  elsif next_location is distinct from old.last_location then
    next_event_type := 'location_updated';
  elsif next_device_type is distinct from coalesce(old.device_type, old.devise_type)
    or new.os_name is distinct from old.os_name
    or new.os_version is distinct from old.os_version then
    next_event_type := 'device_updated';
  else
    return new;
  end if;

  insert into user_activity_events (
    user_id,
    email,
    event_type,
    occurred_at,
    location,
    city,
    state,
    county,
    zip_code,
    device_type,
    os_name,
    os_version,
    metadata
  )
  values (
    new.id::text,
    new.email,
    next_event_type,
    coalesce(new.last_login_at, timezone('utc', now())),
    next_location,
    null,
    null,
    null,
    null,
    next_device_type,
    new.os_name,
    new.os_version,
    jsonb_build_object(
      'source', 'profiles_trigger',
      'trigger_operation', tg_op
    )
  );

  return new;
end;
$$;

do $$
begin
  if exists (
    select 1
    from information_schema.tables
    where table_schema = 'public' and table_name = 'profiles'
  ) then
    execute 'drop trigger if exists trg_capture_profile_activity_event on public.profiles';
    execute 'create trigger trg_capture_profile_activity_event
      after insert or update on public.profiles
      for each row
      execute function capture_profile_activity_event()';
  end if;
end;
$$;
