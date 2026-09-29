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
