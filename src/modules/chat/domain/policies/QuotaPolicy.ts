// Minimal bundle shape needed by quota logic.
// Kept separate from the Prisma-generated type on purpose — the domain layer
// should not know about the ORM.
export interface SubscriptionBundle {
  id: string;
  userId: string;
  tier: string;
  billingCycle: string;
  maxMessages: number;
  remainingMessages: number;
  price: number | { toNumber(): number };
  startDate: Date;
  endDate: Date;
  renewalDate: Date;
  autoRenew: boolean;
  active: boolean;
  cancelledAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

// All quota-related business rules live here.
// No Express, no Prisma, no framework code.
export class QuotaPolicy {
  private static readonly FREE_TIER_LIMIT = 3;
  private static readonly ENTERPRISE_TIER = 'ENTERPRISE';

  // Throws if requestingUserId is trying to consume quota for a different user.
  enforceOwnership(userId: string, requestingUserId: string): void {
    if (userId !== requestingUserId) {
      throw new Error(
        `Access denied: user ${requestingUserId} cannot use quota for user ${userId}`,
      );
    }
  }

  // Returns true when the user still has free messages left this month.
  canUseFreeTier(currentCount: number): boolean {
    return currentCount < QuotaPolicy.FREE_TIER_LIMIT;
  }

  // Picks the best bundle to deduct from.
  // Enterprise is always preferred (unlimited). Otherwise, take the one
  // with the most remaining messages.
  selectBundle(bundles: SubscriptionBundle[]): SubscriptionBundle | null {
    const sorted = [...bundles].sort(
      (a, b) => b.remainingMessages - a.remainingMessages,
    );

    for (const bundle of sorted) {
      if (this.isEnterpriseUnlimited(bundle.tier)) return bundle;
      if (bundle.remainingMessages > 0) return bundle;
    }

    return null;
  }

  isEnterpriseUnlimited(tier: string): boolean {
    return tier === QuotaPolicy.ENTERPRISE_TIER;
  }
}
