import { SubscriptionBundle, BillingCycle } from '../entities/SubscriptionBundle';

/**
 * Encapsulates all billing business rules.
 * Pure TypeScript — no Express, Prisma, or framework imports.
 */
export class BillingPolicy {
  /**
   * Simulates a payment attempt.
   * Returns true ~80% of the time (20% failure rate).
   */
  simulatePayment(): boolean {
    return Math.random() > 0.2;
  }

  /**
   * Calculates the subscription end date from a given start date.
   * MONTHLY → add 1 calendar month
   * YEARLY  → add 1 calendar year
   */
  calculateEndDate(startDate: Date, cycle: BillingCycle): Date {
    const end = new Date(startDate);

    if (cycle === 'MONTHLY') {
      end.setMonth(end.getMonth() + 1);
    } else {
      end.setFullYear(end.getFullYear() + 1);
    }

    return end;
  }

  /**
   * Returns true when all renewal conditions are met:
   *   - autoRenew is enabled
   *   - subscription is still active
   *   - renewalDate is now or in the past
   *   - subscription has NOT been cancelled
   */
  shouldRenew(bundle: SubscriptionBundle): boolean {
    return (
      bundle.autoRenew === true &&
      bundle.active === true &&
      bundle.renewalDate <= new Date() &&
      bundle.cancelledAt === null
    );
  }

  /**
   * The renewal date is the same as the subscription's end date —
   * renewal is triggered when the current period expires.
   */
  calculateRenewalDate(endDate: Date): Date {
    return new Date(endDate);
  }
}
