import assert from 'node:assert/strict';
import { test } from 'node:test';
import crypto from 'node:crypto';
import {
  assertPlanSeatConfiguration,
  brokerageStatusGrantsAccess,
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
