export type BrokeragePlan = {
  code: string;
  name: string;
  seatLimit: number | null;
  monthlyPriceCents: number | null;
  minimumSeatPriceCents: number;
  custom: boolean;
};

export const BROKERAGE_GRACE_PERIOD_DAYS: number;
export const BROKERAGE_PLANS: BrokeragePlan[];
export function getBrokeragePlan(code: string): BrokeragePlan | null;
export function normalizeBrokerageStatus(
  status: string | null | undefined,
  graceEndsAt?: string | null,
  now?: Date,
): string;
export function brokerageStatusGrantsAccess(
  status: string | null | undefined,
  graceEndsAt?: string | null,
  now?: Date,
): boolean;
export const PROTECTED_BROKERAGE_BILLING_FIELDS: string[];
export function protectedBillingFieldsInPatch(payload?: Record<string, unknown>): string[];
export function shouldExpireGracePeriod(brokerage: any, now?: Date): boolean;
export function stripeSubscriptionStatusToBrokerageState(
  status: string | null | undefined,
): string;
export function expiredGraceTargetStateForStripeStatus(
  status: string | null | undefined,
): string;
export function individualEntitlementIsValid(user: any, now?: Date): boolean;
export function brokerageEntitlementIsValid(
  membership: any,
  brokerage: any,
  now?: Date,
): boolean;
export function assignedSeatCount(memberships?: any[]): number;
export function canApproveMembership(args: {
  brokerage: any;
  memberships?: any[];
  membership: any;
  now?: Date;
}): {
  ok: boolean;
  reason:
    | 'membership_not_found'
    | 'brokerage_not_found'
    | 'already_active'
    | 'membership_not_pending'
    | 'brokerage_not_active'
    | 'no_seats_available'
    | 'seat_available';
};
export function joinCodeIsUsable(joinCode: any, now?: Date): boolean;
export function resolveEntitlement(args: {
  user: any;
  membership?: any;
  brokerage?: any;
  now?: Date;
}): {
  hasAccess: boolean;
  individual: boolean;
  brokerage: boolean;
  sources: {
    individual: boolean;
    brokerage: boolean;
  };
};
export function assertPlanSeatConfiguration(args: {
  planCode: string;
  purchasedSeats: number;
  monthlyPriceCents: number;
  customPriceOverride?: boolean;
}): {
  plan: BrokeragePlan;
  purchasedSeats: number;
  monthlyPriceCents: number;
};
