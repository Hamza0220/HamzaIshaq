// ---------------------------------------------------------------------------
// Enums (mirrored from schema — no Prisma import allowed in domain layer)
// ---------------------------------------------------------------------------

export type SubscriptionTier = 'BASIC' | 'PRO' | 'ENTERPRISE';
export type BillingCycle = 'MONTHLY' | 'YEARLY';

// ---------------------------------------------------------------------------
// Entity interface
// ---------------------------------------------------------------------------

export interface SubscriptionBundle {
  id: string;
  userId: string;
  tier: SubscriptionTier;
  billingCycle: BillingCycle;
  maxMessages: number;
  remainingMessages: number;
  /** Stored as Decimal in DB; represented as number in domain */
  price: number;
  startDate: Date;
  endDate: Date;
  renewalDate: Date;
  autoRenew: boolean;
  active: boolean;
  cancelledAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

// ---------------------------------------------------------------------------
// Static helpers (kept as namespace functions — no class state needed)
// ---------------------------------------------------------------------------

/**
 * Returns the message quota for a given tier.
 * ENTERPRISE returns -1 which is treated as unlimited throughout the system.
 */
export function getMaxMessages(tier: SubscriptionTier): number {
  switch (tier) {
    case 'BASIC':
      return 10;
    case 'PRO':
      return 100;
    case 'ENTERPRISE':
      return -1; // unlimited
  }
}

/**
 * Returns the price in USD for the given tier + billing cycle.
 *
 * From README Subscription Tiers table:
 * | Tier       | Monthly | Yearly  |
 * |------------|---------|---------|
 * | BASIC      |  $9.99  | $99.99  |
 * | PRO        | $29.99  | $299.99 |
 * | ENTERPRISE | $99.99  | $999.99 |
 */
export function getPrice(tier: SubscriptionTier, cycle: BillingCycle): number {
  const prices: Record<SubscriptionTier, Record<BillingCycle, number>> = {
    BASIC:      { MONTHLY: 9.99,  YEARLY: 99.99  },
    PRO:        { MONTHLY: 29.99, YEARLY: 299.99 },
    ENTERPRISE: { MONTHLY: 99.99, YEARLY: 999.99 },
  };

  return prices[tier][cycle];
}
