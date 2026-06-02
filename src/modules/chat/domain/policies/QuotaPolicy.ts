/**
 * Minimal SubscriptionBundle shape required by quota logic.
 * Intentionally not imported from Prisma — pure domain type.
 */
export interface SubscriptionBundle {
  id: string;
  userId: string;
  tier: string;          // 'BASIC' | 'PRO' | 'ENTERPRISE'
  billingCycle: string;  // 'MONTHLY' | 'YEARLY'
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

/**
 * Encapsulates all quota-related business rules.
 * Pure TypeScript — no Express, Prisma, or framework imports.
 */
export class QuotaPolicy {
  private static readonly FREE_TIER_LIMIT = 3;
  private static readonly ENTERPRISE_TIER = 'ENTERPRISE';

  /**
   * Domain policy level authorization check.
   * Ensures a user can only consume quota on their own account.
   * Throws an error if the requesting user doesn't match the target user.
   */
  enforceOwnership(userId: string, requestingUserId: string): void {
    if (userId !== requestingUserId) {
      throw new Error(`Access denied: user ${requestingUserId} cannot use quota for user ${userId}`);
    }
  }

  /**
   * Returns true if the user is within the free monthly tier (count < 3).
   */
  canUseFreeTier(currentCount: number): boolean {
    return currentCount < QuotaPolicy.FREE_TIER_LIMIT;
  }

  /**
   * Selects the best active bundle to consume a message from.
   *
   * Rules:
   * - Sort bundles by remainingMessages DESC
   * - ENTERPRISE tier is always returned regardless of remainingMessages
   * - Otherwise return the first bundle with remainingMessages > 0
   * - Returns null if no eligible bundle exists
   */
  selectBundle(bundles: SubscriptionBundle[]): SubscriptionBundle | null {
    const sorted = [...bundles].sort(
      (a, b) => b.remainingMessages - a.remainingMessages,
    );

    for (const bundle of sorted) {
      if (this.isEnterpriseUnlimited(bundle.tier)) {
        return bundle;
      }
      if (bundle.remainingMessages > 0) {
        return bundle;
      }
    }

    return null;
  }

  /**
   * Returns true when the given tier is ENTERPRISE (unlimited quota).
   */
  isEnterpriseUnlimited(tier: string): boolean {
    return tier === QuotaPolicy.ENTERPRISE_TIER;
  }
}
