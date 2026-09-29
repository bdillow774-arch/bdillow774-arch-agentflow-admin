export const BROKERAGE_GRACE_PERIOD_DAYS = 7;

export const BROKERAGE_PLANS = [
  {
    code: 'seats_10',
    name: '10 agents',
    seatLimit: 10,
    monthlyPriceCents: 4999,
    minimumSeatPriceCents: 499,
    custom: false,
  },
  {
    code: 'seats_25',
    name: '25 agents',
    seatLimit: 25,
    monthlyPriceCents: 11999,
    minimumSeatPriceCents: 480,
    custom: false,
  },
  {
    code: 'seats_50',
    name: '50 agents',
    seatLimit: 50,
    monthlyPriceCents: 22499,
    minimumSeatPriceCents: 450,
    custom: false,
  },
  {
    code: 'seats_100',
    name: '100 agents',
    seatLimit: 100,
    monthlyPriceCents: 42499,
    minimumSeatPriceCents: 425,
    custom: false,
  },
  {
    code: 'seats_250',
    name: '250 agents',
    seatLimit: 250,
    monthlyPriceCents: 99999,
    minimumSeatPriceCents: 400,
    custom: false,
  },
  {
    code: 'custom_251_plus',
    name: '251+ agents',
    seatLimit: null,
    monthlyPriceCents: null,
    minimumSeatPriceCents: 375,
    custom: true,
  },
];

export function getBrokeragePlan(code) {
  return BROKERAGE_PLANS.find((plan) => plan.code === code) ?? null;
}

export function normalizeBrokerageStatus(status, graceEndsAt, now = new Date()) {
  const value = String(status || '').toLowerCase();

  if (value === 'active') return 'active';
  if (value === 'canceled' || value === 'expired') return 'expired';
  if (value === 'suspended') return 'suspended';

  if (value === 'past_due' || value === 'grace_period') {
    if (!graceEndsAt) return 'past_due';
    return new Date(graceEndsAt).getTime() >= now.getTime()
      ? 'grace_period'
      : 'suspended';
  }

  return value || 'incomplete';
}

export function brokerageStatusGrantsAccess(status, graceEndsAt, now = new Date()) {
  return ['active', 'grace_period'].includes(
    normalizeBrokerageStatus(status, graceEndsAt, now),
  );
}

export const PROTECTED_BROKERAGE_BILLING_FIELDS = [
  'subscription_state',
  'stripe_subscription_status',
  'stripe_subscription_id',
  'stripe_customer_id',
  'stripe_checkout_session_id',
  'stripe_price_id',
  'current_period_start',
  'current_period_end',
  'cancel_at_period_end',
  'canceled_at',
  'grace_period_ends_at',
  'suspended_at',
  'reactivated_at',
];

export function protectedBillingFieldsInPatch(payload = {}) {
  return PROTECTED_BROKERAGE_BILLING_FIELDS.filter(
    (field) => Object.prototype.hasOwnProperty.call(payload, field),
  );
}

export function shouldExpireGracePeriod(brokerage, now = new Date()) {
  if (String(brokerage?.subscription_state || '').toLowerCase() !== 'grace_period') {
    return false;
  }

  const graceEndsAt = brokerage?.grace_period_ends_at
    ? new Date(brokerage.grace_period_ends_at)
    : null;

  return Boolean(graceEndsAt) && graceEndsAt.getTime() <= now.getTime();
}

export function stripeSubscriptionStatusToBrokerageState(status) {
  switch (String(status || '').toLowerCase()) {
    case 'active':
    case 'trialing':
      return 'active';
    case 'past_due':
    case 'unpaid':
      return 'grace_period';
    case 'canceled':
      return 'expired';
    case 'incomplete_expired':
      return 'expired';
    default:
      return 'suspended';
  }
}

export function expiredGraceTargetStateForStripeStatus(status) {
  const reconciledState = stripeSubscriptionStatusToBrokerageState(status);
  return reconciledState === 'active' ? 'active' : reconciledState === 'expired' ? 'expired' : 'suspended';
}

export function individualEntitlementIsValid(user, now = new Date()) {
  const status = String(user?.subscription_status || '').toLowerCase();
  const accountType = String(user?.account_type || '').toLowerCase();
  const periodEnd = user?.subscription_current_period_end
    ? new Date(user.subscription_current_period_end)
    : null;

  if (status === 'active' || status === 'trial') return true;
  if (status === 'past_due' && accountType === 'paid') return true;
  if ((status === 'canceled' || status === 'inactive') && periodEnd) {
    return periodEnd.getTime() > now.getTime();
  }

  return false;
}

export function brokerageEntitlementIsValid(membership, brokerage, now = new Date()) {
  if (!membership || !brokerage) return false;
  if (String(membership.status || '').toLowerCase() !== 'active') return false;
  if (!membership.seat_assigned_at) return false;

  return brokerageStatusGrantsAccess(
    brokerage.subscription_state,
    brokerage.grace_period_ends_at,
    now,
  );
}

export function assignedSeatCount(memberships = []) {
  return memberships.filter(
    (membership) =>
      String(membership?.status || '').toLowerCase() === 'active' &&
      membership?.seat_assigned_at &&
      !membership?.seat_revoked_at,
  ).length;
}

export function canApproveMembership({
  brokerage,
  memberships = [],
  membership,
  now = new Date(),
}) {
  if (!membership) return { ok: false, reason: 'membership_not_found' };
  if (!brokerage) return { ok: false, reason: 'brokerage_not_found' };

  if (
    String(membership.status || '').toLowerCase() === 'active' &&
    membership.seat_assigned_at &&
    !membership.seat_revoked_at
  ) {
    return { ok: true, reason: 'already_active' };
  }

  if (String(membership.status || '').toLowerCase() !== 'pending') {
    return { ok: false, reason: 'membership_not_pending' };
  }

  if (
    !brokerageStatusGrantsAccess(
      brokerage.subscription_state,
      brokerage.grace_period_ends_at,
      now,
    )
  ) {
    return { ok: false, reason: 'brokerage_not_active' };
  }

  if (assignedSeatCount(memberships) >= Number(brokerage.purchased_seats || 0)) {
    return { ok: false, reason: 'no_seats_available' };
  }

  return { ok: true, reason: 'seat_available' };
}

export function joinCodeIsUsable(joinCode, now = new Date()) {
  if (!joinCode) return false;
  if (joinCode.revoked_at) return false;
  if (joinCode.expires_at && new Date(joinCode.expires_at).getTime() < now.getTime()) {
    return false;
  }
  return true;
}

export function resolveEntitlement({ user, membership, brokerage, now = new Date() }) {
  const individual = individualEntitlementIsValid(user, now);
  const brokerageAccess = brokerageEntitlementIsValid(membership, brokerage, now);

  return {
    hasAccess: individual || brokerageAccess,
    individual,
    brokerage: brokerageAccess,
    sources: {
      individual,
      brokerage: brokerageAccess,
    },
  };
}

export function assertPlanSeatConfiguration({
  planCode,
  purchasedSeats,
  monthlyPriceCents,
  customPriceOverride = false,
}) {
  const plan = getBrokeragePlan(planCode);
  if (!plan) throw new Error('Unknown brokerage plan.');

  const seats = Number(purchasedSeats);
  if (!Number.isInteger(seats) || seats < 10) {
    throw new Error('Brokerage plans require at least 10 purchased seats.');
  }

  if (!plan.custom && seats !== plan.seatLimit) {
    throw new Error('Purchased seats must match the selected standard plan.');
  }

  if (plan.custom && seats < 251) {
    throw new Error('Custom brokerage plans require at least 251 seats.');
  }

  const price = Number(monthlyPriceCents);
  if (!Number.isInteger(price) || price <= 0) {
    throw new Error('Monthly price is required.');
  }

  const floor = seats * plan.minimumSeatPriceCents;
  if (!customPriceOverride && price < floor) {
    throw new Error('Monthly price is below the plan minimum.');
  }

  return {
    plan,
    purchasedSeats: seats,
    monthlyPriceCents: price,
  };
}
