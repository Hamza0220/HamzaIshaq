import { SubscriptionBundle, BillingCycle } from '../entities/SubscriptionBundle';

// All billing business rules in one place.
// No Express, no Prisma — pure domain logic.
export class BillingPolicy {
  // Simulates a payment gateway call. Succeeds ~80% of the time.
  // In a real system this would call Stripe/Paddle/etc.
  simulatePayment(): boolean {
    return Math.random() > 0.2;
  }

  // Adds 1 calendar month (MONTHLY) or 1 calendar year (YEARLY) to startDate.
  // Returns a new Date without mutating the input.
  calculateEndDate(startDate: Date, cycle: BillingCycle): Date {
    const end = new Date(startDate);

    if (cycle === 'MONTHLY') {
      end.setMonth(end.getMonth() + 1);
    } else {
      end.setFullYear(end.getFullYear() + 1);
    }

    return end;
  }

  // A bundle should renew when:
  //   - autoRenew is on
  //   - it's still marked active
  //   - renewalDate has passed
  //   - it hasn't been explicitly cancelled
  shouldRenew(bundle: SubscriptionBundle): boolean {
    return (
      bundle.autoRenew === true &&
      bundle.active === true &&
      bundle.renewalDate <= new Date() &&
      bundle.cancelledAt === null
    );
  }

  // Renewal fires when the current period ends, so renewalDate === endDate.
  calculateRenewalDate(endDate: Date): Date {
    return new Date(endDate);
  }
}
