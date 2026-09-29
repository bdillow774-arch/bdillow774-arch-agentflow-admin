create extension if not exists pgcrypto;

create table if not exists brokerage_plans (
  code text primary key,
  name text not null,
  seat_limit integer null,
  monthly_price_cents integer null,
  minimum_seat_price_cents integer not null,
  stripe_product_id text null,
  stripe_price_id text null unique,
  stripe_lookup_key text null unique,
  is_custom boolean not null default false,
  is_active boolean not null default true,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint brokerage_plans_minimum_seats_chk
    check (seat_limit is null or seat_limit >= 10),
  constraint brokerage_plans_price_chk
    check (monthly_price_cents is null or monthly_price_cents > 0)
);

insert into brokerage_plans (
  code,
  name,
  seat_limit,
  monthly_price_cents,
  minimum_seat_price_cents,
  is_custom
)
values
  ('seats_10', '10 agents', 10, 4999, 499, false),
  ('seats_25', '25 agents', 25, 11999, 480, false),
  ('seats_50', '50 agents', 50, 22499, 450, false),
  ('seats_100', '100 agents', 100, 42499, 425, false),
  ('seats_250', '250 agents', 250, 99999, 400, false),
  ('custom_251_plus', '251+ agents', null, null, 375, true)
on conflict (code) do update
set
  name = excluded.name,
  seat_limit = excluded.seat_limit,
  monthly_price_cents = excluded.monthly_price_cents,
  minimum_seat_price_cents = excluded.minimum_seat_price_cents,
  is_custom = excluded.is_custom,
  updated_at = timezone('utc', now());

alter table if exists brokerage_plans
  add column if not exists stripe_product_id text null;

alter table if exists brokerage_plans
  add column if not exists stripe_price_id text null;

alter table if exists brokerage_plans
  add column if not exists stripe_lookup_key text null;

create unique index if not exists brokerage_plans_stripe_price_id_uidx
  on brokerage_plans (stripe_price_id)
  where stripe_price_id is not null;

create unique index if not exists brokerage_plans_stripe_lookup_key_uidx
  on brokerage_plans (stripe_lookup_key)
  where stripe_lookup_key is not null;

create table if not exists brokerages (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  name text not null,
  legal_name text null,
  primary_admin_email text not null,
  primary_admin_name text null,
  phone text null,
  plan_code text not null references brokerage_plans(code),
  purchased_seats integer not null,
  monthly_price_cents integer not null,
  custom_price_override boolean not null default false,
  stripe_customer_id text null unique,
  stripe_subscription_id text null unique,
  stripe_price_id text null,
  stripe_checkout_session_id text null,
  stripe_subscription_status text null,
  subscription_state text not null default 'incomplete',
  current_period_start timestamptz null,
  current_period_end timestamptz null,
  cancel_at_period_end boolean not null default false,
  canceled_at timestamptz null,
  grace_period_ends_at timestamptz null,
  suspended_at timestamptz null,
  reactivated_at timestamptz null,
  metadata jsonb not null default '{}'::jsonb,
  constraint brokerages_minimum_seats_chk check (purchased_seats >= 10),
  constraint brokerages_monthly_price_chk check (monthly_price_cents > 0),
  constraint brokerages_state_chk check (
    subscription_state in (
      'incomplete',
      'active',
      'past_due',
      'grace_period',
      'suspended',
      'canceled',
      'expired'
    )
  )
);

create index if not exists brokerages_subscription_state_idx
  on brokerages (subscription_state);

create index if not exists brokerages_stripe_customer_id_idx
  on brokerages (stripe_customer_id);

create table if not exists brokerage_admins (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default timezone('utc', now()),
  brokerage_id uuid not null references brokerages(id) on delete cascade,
  user_id uuid null,
  email text not null,
  name text null,
  role text not null default 'owner',
  is_active boolean not null default true,
  invited_at timestamptz null,
  accepted_at timestamptz null,
  unique (brokerage_id, email),
  constraint brokerage_admins_role_chk check (role in ('owner', 'billing', 'manager'))
);

create index if not exists brokerage_admins_user_id_idx
  on brokerage_admins (user_id);

create table if not exists brokerage_join_codes (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default timezone('utc', now()),
  revoked_at timestamptz null,
  brokerage_id uuid not null references brokerages(id) on delete cascade,
  code_hash text not null unique,
  code_preview text not null,
  created_by_user_id uuid null,
  expires_at timestamptz null,
  metadata jsonb not null default '{}'::jsonb
);

create index if not exists brokerage_join_codes_brokerage_id_idx
  on brokerage_join_codes (brokerage_id, revoked_at);

create table if not exists brokerage_memberships (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  brokerage_id uuid not null references brokerages(id) on delete cascade,
  user_id uuid not null,
  email text null,
  status text not null default 'pending',
  requested_at timestamptz not null default timezone('utc', now()),
  approved_at timestamptz null,
  approved_by_user_id uuid null,
  rejected_at timestamptz null,
  rejected_by_user_id uuid null,
  removed_at timestamptz null,
  removed_by_user_id uuid null,
  seat_assigned_at timestamptz null,
  seat_revoked_at timestamptz null,
  join_code_id uuid null references brokerage_join_codes(id),
  notes text null,
  metadata jsonb not null default '{}'::jsonb,
  unique (brokerage_id, user_id),
  constraint brokerage_memberships_status_chk check (
    status in ('pending', 'active', 'rejected', 'removed')
  )
);

create index if not exists brokerage_memberships_brokerage_id_idx
  on brokerage_memberships (brokerage_id, status);

create index if not exists brokerage_memberships_user_id_idx
  on brokerage_memberships (user_id, status);

create table if not exists brokerage_events (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default timezone('utc', now()),
  brokerage_id uuid null references brokerages(id) on delete set null,
  membership_id uuid null references brokerage_memberships(id) on delete set null,
  actor_user_id uuid null,
  actor_email text null,
  event_type text not null,
  details jsonb not null default '{}'::jsonb
);

create index if not exists brokerage_events_brokerage_id_idx
  on brokerage_events (brokerage_id, created_at desc);

create table if not exists stripe_webhook_events (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default timezone('utc', now()),
  event_id text not null unique,
  event_type text not null,
  livemode boolean null,
  processed_at timestamptz null,
  raw_payload jsonb not null
);

create or replace function brokerage_assigned_seat_count(next_brokerage_id uuid)
returns integer
language sql
stable
as $$
  select count(*)::integer
  from brokerage_memberships
  where brokerage_id = next_brokerage_id
    and status = 'active'
    and seat_assigned_at is not null
    and seat_revoked_at is null
$$;

revoke all on function brokerage_assigned_seat_count(uuid) from public;
revoke all on function brokerage_assigned_seat_count(uuid) from anon;
revoke all on function brokerage_assigned_seat_count(uuid) from authenticated;
grant execute on function brokerage_assigned_seat_count(uuid) to service_role;

create or replace function approve_brokerage_membership(
  next_membership_id uuid,
  next_actor_user_id uuid default null
)
returns brokerage_memberships
language plpgsql
security definer
set search_path = public
as $$
declare
  target_membership brokerage_memberships%rowtype;
  target_brokerage brokerages%rowtype;
  assigned_count integer;
begin
  select *
  into target_membership
  from brokerage_memberships
  where id = next_membership_id
  for update;

  if not found then
    raise exception 'Membership not found';
  end if;

  select *
  into target_brokerage
  from brokerages
  where id = target_membership.brokerage_id
  for update;

  if not found then
    raise exception 'Brokerage not found';
  end if;

  if target_brokerage.subscription_state not in ('active', 'grace_period') then
    raise exception 'Brokerage subscription is not active';
  end if;

  if target_membership.status = 'active'
    and target_membership.seat_assigned_at is not null
    and target_membership.seat_revoked_at is null then
    return target_membership;
  end if;

  if target_membership.status <> 'pending' then
    raise exception 'Only pending memberships can be approved';
  end if;

  select brokerage_assigned_seat_count(target_brokerage.id)
  into assigned_count;

  if assigned_count >= target_brokerage.purchased_seats then
    raise exception 'No brokerage seats are available';
  end if;

  update brokerage_memberships
  set
    status = 'active',
    approved_at = timezone('utc', now()),
    approved_by_user_id = next_actor_user_id,
    rejected_at = null,
    rejected_by_user_id = null,
    removed_at = null,
    removed_by_user_id = null,
    seat_assigned_at = timezone('utc', now()),
    seat_revoked_at = null,
    updated_at = timezone('utc', now())
  where id = next_membership_id
  returning * into target_membership;

  insert into brokerage_events (
    brokerage_id,
    membership_id,
    actor_user_id,
    event_type,
    details
  )
  values (
    target_brokerage.id,
    target_membership.id,
    next_actor_user_id,
    'membership_approved',
    jsonb_build_object(
      'assigned_seats_before_approval', assigned_count,
      'purchased_seats', target_brokerage.purchased_seats
    )
  );

  return target_membership;
end;
$$;

revoke all on function approve_brokerage_membership(uuid, uuid) from public;
revoke all on function approve_brokerage_membership(uuid, uuid) from anon;
revoke all on function approve_brokerage_membership(uuid, uuid) from authenticated;
grant execute on function approve_brokerage_membership(uuid, uuid) to service_role;

alter table if exists brokerages enable row level security;
alter table if exists brokerage_admins enable row level security;
alter table if exists brokerage_join_codes enable row level security;
alter table if exists brokerage_memberships enable row level security;
alter table if exists brokerage_events enable row level security;
alter table if exists stripe_webhook_events enable row level security;
