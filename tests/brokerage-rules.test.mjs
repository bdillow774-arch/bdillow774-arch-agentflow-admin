import assert from 'node:assert/strict';
import { test } from 'node:test';
import crypto from 'node:crypto';
import {
  assignedSeatCount,
  assertPlanSeatConfiguration,
  brokerageStatusGrantsAccess,
  canApproveMembership,
  joinCodeIsUsable,
  resolveEntitlement,
} from '../lib/brokerageRules.mjs';
import { verifyStripeSignature } from '../lib/stripeWebhookRules.mjs';

function stripeHeader({ payload, secret, timestamp }) {
  const signature = crypto
    .createHmac('sha256', secret)
    .update(`${timestamp}.${payload}`)
    .digest('hex');
  return `t=${timestamp},v1=${signature}`;
}

test('standard brokerage plans enforce purchased seat count and monthly price', () => {
  const config = assertPlanSeatConfiguration({
    planCode: 'seats_10',
    purchasedSeats: 10,
    monthlyPriceCents: 4999,
  });

  assert.equal(config.purchasedSeats, 10);
  assert.throws(() =>
    assertPlanSeatConfiguration({
      planCode: 'seats_10',
      purchasedSeats: 11,
      monthlyPriceCents: 4999,
    }),
  );
});

test('custom brokerage plans require 251 seats and enforce the internal floor', () => {
  assert.throws(() =>
    assertPlanSeatConfiguration({
      planCode: 'custom_251_plus',
      purchasedSeats: 250,
      monthlyPriceCents: 100000,
    }),
  );

  assert.throws(() =>
    assertPlanSeatConfiguration({
      planCode: 'custom_251_plus',
      purchasedSeats: 300,
      monthlyPriceCents: 100000,
    }),
  );

  const config = assertPlanSeatConfiguration({
    planCode: 'custom_251_plus',
    purchasedSeats: 300,
    monthlyPriceCents: 100000,
    customPriceOverride: true,
  });

  assert.equal(config.purchasedSeats, 300);
});

test('brokerage access remains valid during grace period and stops after grace expires', () => {
  const now = new Date('2026-09-29T12:00:00Z');

  assert.equal(
    brokerageStatusGrantsAccess('past_due', '2026-10-01T12:00:00Z', now),
    true,
  );
  assert.equal(
    brokerageStatusGrantsAccess('past_due', '2026-09-28T12:00:00Z', now),
    false,
  );
});

test('dual entitlement uses individual OR brokerage access', () => {
  const now = new Date('2026-09-29T12:00:00Z');
  const inactiveUser = {
    account_type: 'free',
    subscription_status: 'inactive',
  };
  const activeIndividual = {
    account_type: 'paid',
    subscription_status: 'active',
  };
  const membership = {
    status: 'active',
    seat_assigned_at: '2026-09-29T00:00:00Z',
  };
  const activeBrokerage = {
    subscription_state: 'active',
    grace_period_ends_at: null,
  };
  const suspendedBrokerage = {
    subscription_state: 'suspended',
    grace_period_ends_at: null,
  };

  assert.deepEqual(
    resolveEntitlement({
      user: inactiveUser,
      membership,
      brokerage: activeBrokerage,
      now,
    }).sources,
    { individual: false, brokerage: true },
  );

  assert.equal(
    resolveEntitlement({
      user: activeIndividual,
      membership,
      brokerage: suspendedBrokerage,
      now,
    }).hasAccess,
    true,
  );

  assert.equal(
    resolveEntitlement({
      user: inactiveUser,
      membership,
      brokerage: suspendedBrokerage,
      now,
    }).hasAccess,
    false,
  );
});

test('Stripe webhook signatures are accepted only when current and valid', () => {
  const payload = JSON.stringify({ id: 'evt_test', type: 'invoice.payment_succeeded' });
  const secret = 'whsec_test';
  const timestamp = 1000;

  assert.equal(
    verifyStripeSignature({
      rawBody: payload,
      signatureHeader: stripeHeader({ payload, secret, timestamp }),
      secret,
      nowSeconds: timestamp + 60,
    }),
    true,
  );

  assert.equal(
    verifyStripeSignature({
      rawBody: payload,
      signatureHeader: stripeHeader({ payload, secret: 'wrong', timestamp }),
      secret,
      nowSeconds: timestamp + 60,
    }),
    false,
  );

  assert.equal(
    verifyStripeSignature({
      rawBody: payload,
      signatureHeader: stripeHeader({ payload, secret, timestamp }),
      secret,
      nowSeconds: timestamp + 1000,
    }),
    false,
  );
});

test('assigned seat count ignores pending, removed, and revoked seats', () => {
  assert.equal(
    assignedSeatCount([
      { status: 'active', seat_assigned_at: '2026-01-01T00:00:00Z' },
      { status: 'pending', seat_assigned_at: null },
      {
        status: 'removed',
        seat_assigned_at: '2026-01-01T00:00:00Z',
        seat_revoked_at: '2026-01-02T00:00:00Z',
      },
    ]),
    1,
  );
});

test('approval is allowed when brokerage is active and seats are available', () => {
  assert.deepEqual(
    canApproveMembership({
      brokerage: { subscription_state: 'active', purchased_seats: 10 },
      memberships: [],
      membership: { status: 'pending' },
    }),
    { ok: true, reason: 'seat_available' },
  );
});

test('approval is idempotently allowed for an already active assigned member', () => {
  assert.deepEqual(
    canApproveMembership({
      brokerage: { subscription_state: 'active', purchased_seats: 10 },
      memberships: [],
      membership: {
        status: 'active',
        seat_assigned_at: '2026-01-01T00:00:00Z',
      },
    }),
    { ok: true, reason: 'already_active' },
  );
});

test('approval rejects non-pending memberships', () => {
  assert.deepEqual(
    canApproveMembership({
      brokerage: { subscription_state: 'active', purchased_seats: 10 },
      memberships: [],
      membership: { status: 'removed' },
    }),
    { ok: false, reason: 'membership_not_pending' },
  );
});

test('approval rejects suspended brokerages', () => {
  assert.deepEqual(
    canApproveMembership({
      brokerage: { subscription_state: 'suspended', purchased_seats: 10 },
      memberships: [],
      membership: { status: 'pending' },
    }),
    { ok: false, reason: 'brokerage_not_active' },
  );
});

test('approval allows grace period before it expires', () => {
  assert.deepEqual(
    canApproveMembership({
      brokerage: {
        subscription_state: 'grace_period',
        grace_period_ends_at: '2026-10-01T00:00:00Z',
        purchased_seats: 10,
      },
      memberships: [],
      membership: { status: 'pending' },
      now: new Date('2026-09-30T00:00:00Z'),
    }),
    { ok: true, reason: 'seat_available' },
  );
});

test('approval rejects expired grace period', () => {
  assert.deepEqual(
    canApproveMembership({
      brokerage: {
        subscription_state: 'grace_period',
        grace_period_ends_at: '2026-09-29T00:00:00Z',
        purchased_seats: 10,
      },
      memberships: [],
      membership: { status: 'pending' },
      now: new Date('2026-09-30T00:00:00Z'),
    }),
    { ok: false, reason: 'brokerage_not_active' },
  );
});

test('approval rejects the eleventh member of a ten-seat brokerage', () => {
  const memberships = Array.from({ length: 10 }, () => ({
    status: 'active',
    seat_assigned_at: '2026-01-01T00:00:00Z',
  }));

  assert.deepEqual(
    canApproveMembership({
      brokerage: { subscription_state: 'active', purchased_seats: 10 },
      memberships,
      membership: { status: 'pending' },
    }),
    { ok: false, reason: 'no_seats_available' },
  );
});

test('removal frees a seat for reassignment', () => {
  const memberships = [
    ...Array.from({ length: 9 }, () => ({
      status: 'active',
      seat_assigned_at: '2026-01-01T00:00:00Z',
    })),
    {
      status: 'removed',
      seat_assigned_at: '2026-01-01T00:00:00Z',
      seat_revoked_at: '2026-01-02T00:00:00Z',
    },
  ];

  assert.equal(assignedSeatCount(memberships), 9);
  assert.deepEqual(
    canApproveMembership({
      brokerage: { subscription_state: 'active', purchased_seats: 10 },
      memberships,
      membership: { status: 'pending' },
    }),
    { ok: true, reason: 'seat_available' },
  );
});

test('join codes reject missing, revoked, and expired codes', () => {
  const now = new Date('2026-09-29T00:00:00Z');
  assert.equal(joinCodeIsUsable(null, now), false);
  assert.equal(joinCodeIsUsable({ revoked_at: '2026-09-28T00:00:00Z' }, now), false);
  assert.equal(joinCodeIsUsable({ expires_at: '2026-09-28T00:00:00Z' }, now), false);
  assert.equal(joinCodeIsUsable({ expires_at: '2026-09-30T00:00:00Z' }, now), true);
});

test('pending brokerage membership does not grant brokerage entitlement', () => {
  assert.equal(
    resolveEntitlement({
      user: { account_type: 'free', subscription_status: 'inactive' },
      membership: { status: 'pending' },
      brokerage: { subscription_state: 'active' },
    }).sources.brokerage,
    false,
  );
});

test('removed brokerage membership does not remove active individual entitlement', () => {
  const entitlement = resolveEntitlement({
    user: { account_type: 'paid', subscription_status: 'active' },
    membership: {
      status: 'removed',
      seat_assigned_at: '2026-01-01T00:00:00Z',
      seat_revoked_at: '2026-01-02T00:00:00Z',
    },
    brokerage: { subscription_state: 'active' },
  });

  assert.equal(entitlement.sources.brokerage, false);
  assert.equal(entitlement.sources.individual, true);
  assert.equal(entitlement.hasAccess, true);
});

test('expired individual subscription can still be covered by brokerage', () => {
  const entitlement = resolveEntitlement({
    user: {
      account_type: 'paid',
      subscription_status: 'inactive',
      subscription_current_period_end: '2026-01-01T00:00:00Z',
    },
    membership: { status: 'active', seat_assigned_at: '2026-09-29T00:00:00Z' },
    brokerage: { subscription_state: 'active' },
    now: new Date('2026-09-29T12:00:00Z'),
  });

  assert.deepEqual(entitlement.sources, { individual: false, brokerage: true });
  assert.equal(entitlement.hasAccess, true);
});

test('canceled individual subscription grants access until current period end', () => {
  assert.equal(
    resolveEntitlement({
      user: {
        account_type: 'paid',
        subscription_status: 'canceled',
        subscription_current_period_end: '2026-10-01T00:00:00Z',
      },
      now: new Date('2026-09-29T00:00:00Z'),
    }).sources.individual,
    true,
  );
});
