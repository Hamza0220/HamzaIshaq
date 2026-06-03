// These types mirror the Prisma enums but live in the domain layer so no
// ORM import leaks into business logic.
export type SubscriptionTier = 'BASIC' | 'PRO' | 'ENTERPRISE';
export type BillingCycle = 'MONTHLY' | 'YEARLY';

export interface SubscriptionBundle {
  id: string;
  userId: string;
  tier: SubscriptionTier;
  billingCycle: BillingCycle;
  maxMessages: number;
  remainingMessages: number;
  // Stored as Decimal in the DB; the repository converts it to a plain number
  // before returning a domain object.
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

// Returns the message cap for a tier. -1 means unlimited (Enterprise).
export function getMaxMessages(tier: SubscriptionTier): number {
  switch (tier) {
    case 'BASIC':      return 10;
    case 'PRO':        return 100;
    case 'ENTERPRISE': return -1;
  }
}

// Price table in USD. Yearly plans are roughly 2 months free vs monthly.
export function getPrice(tier: SubscriptionTier, cycle: BillingCycle): number {
  const prices: Record<SubscriptionTier, Record<BillingCycle, number>> = {
    BASIC:      { MONTHLY: 9.99,  YEARLY: 99.99  },
    PRO:        { MONTHLY: 29.99, YEARLY: 299.99 },
    ENTERPRISE: { MONTHLY: 99.99, YEARLY: 999.99 },
  };

  return prices[tier][cycle];
}
