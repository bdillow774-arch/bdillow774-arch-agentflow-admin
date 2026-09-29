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
export function individualEntitlementIsValid(user: any, now?: Date): boolean;
export function brokerageEntitlementIsValid(
  membership: any,
  brokerage: any,
  now?: Date,
): boolean;
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
