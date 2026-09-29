# Brokerage Subscriptions Architecture

This admin/backend workspace adds B2B brokerage access without replacing the
existing individual RevenueCat entitlement model.

## Existing Individual Entitlement

Individual paid access is still controlled by RevenueCat events delivered to
`/api/revenuecat-webhook`. Those events are persisted in `subscription_events`
and reconcile the existing `users` entitlement fields:

- `account_type`
- `subscription_status`
- `subscription_provider`
- `subscription_current_period_end`

The brokerage system does not write brokerage state into those fields.

## Brokerage Entitlement

Brokerage access is modeled independently:

`has_access = valid_individual_entitlement OR valid_brokerage_entitlement`

Brokerage entitlement requires:

- active `brokerage_memberships.status = 'active'`
- a non-revoked seat assignment
- a brokerage subscription state that grants access, currently `active` or
  `grace_period`

The join code is not an entitlement. It only creates a pending membership
request.

## Seat Security

Approvals use the `approve_brokerage_membership` Postgres RPC created in
`database/brokerage-subscriptions.sql`. The function locks the target membership
and brokerage rows before counting assigned seats and assigning a seat. This is
the concurrency boundary that prevents simultaneous approvals from exceeding
`brokerages.purchased_seats`.

## Stripe Flow

Stripe Checkout and Billing Portal are initiated from admin-only routes:

- `POST /api/admin/brokerages/checkout`
- `POST /api/admin/brokerages/portal`

Subscription state is authoritative only after verified Stripe webhooks arrive
at `POST /api/stripe/webhook`.

Webhook delivery is signature-verified with `STRIPE_WEBHOOK_SECRET` and
idempotent through the `stripe_webhook_events.event_id` unique constraint.

## Grace Period

Payment failure moves the brokerage into `grace_period` and sets
`grace_period_ends_at` to seven days in the future. During the grace period,
existing active brokerage seats continue to grant access. If the subscription is
not recovered, a suspension job or admin action must move the brokerage to
`suspended`; suspended brokerages do not grant brokerage entitlement.

## Mobile Requirements

The mobile AgentFlow repo still needs client support for:

- entering a brokerage join code
- calling `POST /api/brokerage/join` with the user's Supabase bearer token
- showing pending/approved/rejected/removed brokerage status
- calling `GET /api/account/entitlement`
- resolving paywall visibility from the returned `hasAccess` value
- preserving RevenueCat purchases as an independent access source
- responding to brokerage suspension/removal without deleting the user account

If the mobile app cannot add these calls through existing server-controlled
configuration, an iOS build and App Store review will be required.

## Google Maps Audit Boundary

This admin dashboard does not contain the Google Maps route planning,
geocoding, ETA, traffic, or optimization implementation. It only has manual
accounting inputs for Google Maps costs. The actual Google Maps SKU/cost audit
must be performed in the mobile AgentFlow repo where the route-planning code
lives.
