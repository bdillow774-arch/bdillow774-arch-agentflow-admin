import { verifyStripeSignature } from '@/lib/stripeWebhookRules.mjs';

const STRIPE_API_BASE = 'https://api.stripe.com/v1';

function getStripeSecretKey() {
  const key = process.env.STRIPE_SECRET_KEY?.trim();
  if (!key) {
    throw new Error('Missing STRIPE_SECRET_KEY env var.');
  }
  return key;
}

export function getStripeWebhookSecret() {
  const secret = process.env.STRIPE_WEBHOOK_SECRET?.trim();
  if (!secret) {
    throw new Error('Missing STRIPE_WEBHOOK_SECRET env var.');
  }
  return secret;
}

export { verifyStripeSignature };

async function stripeRequest<T>(
  path: string,
  params: URLSearchParams,
): Promise<T> {
  const response = await fetch(`${STRIPE_API_BASE}${path}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${getStripeSecretKey()}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: params,
  });

  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(
      payload?.error?.message || `Stripe request failed with ${response.status}.`,
    );
  }

  return payload as T;
}

export async function createStripeCheckoutSession({
  brokerageId,
  brokerageName,
  adminEmail,
  monthlyPriceCents,
  purchasedSeats,
  successUrl,
  cancelUrl,
}: {
  brokerageId: string;
  brokerageName: string;
  adminEmail: string;
  monthlyPriceCents: number;
  purchasedSeats: number;
  successUrl: string;
  cancelUrl: string;
}) {
  const params = new URLSearchParams();
  params.set('mode', 'subscription');
  params.set('success_url', successUrl);
  params.set('cancel_url', cancelUrl);
  params.set('customer_email', adminEmail);
  params.set('client_reference_id', brokerageId);
  params.set('metadata[brokerage_id]', brokerageId);
  params.set('subscription_data[metadata][brokerage_id]', brokerageId);
  params.set('line_items[0][quantity]', '1');
  params.set('line_items[0][price_data][currency]', 'usd');
  params.set('line_items[0][price_data][recurring][interval]', 'month');
  params.set('line_items[0][price_data][unit_amount]', String(monthlyPriceCents));
  params.set(
    'line_items[0][price_data][product_data][name]',
    `AgentFlow Brokerage - ${brokerageName}`,
  );
  params.set(
    'line_items[0][price_data][product_data][metadata][purchased_seats]',
    String(purchasedSeats),
  );

  return stripeRequest<{
    id: string;
    url: string | null;
    customer?: string;
    subscription?: string;
  }>('/checkout/sessions', params);
}

export async function createStripePortalSession({
  customerId,
  returnUrl,
}: {
  customerId: string;
  returnUrl: string;
}) {
  const params = new URLSearchParams();
  params.set('customer', customerId);
  params.set('return_url', returnUrl);

  return stripeRequest<{ id: string; url: string }>('/billing_portal/sessions', params);
}
