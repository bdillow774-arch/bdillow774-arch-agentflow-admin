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

alter table if exists admin_audit_logs enable row level security;
