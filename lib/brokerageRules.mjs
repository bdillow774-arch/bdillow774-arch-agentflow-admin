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
