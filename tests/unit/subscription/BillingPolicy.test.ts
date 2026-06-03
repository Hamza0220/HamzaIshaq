import { BillingPolicy } from '../../../src/modules/subscriptions/domain/policies/BillingPolicy';
import type { SubscriptionBundle } from '../../../src/modules/subscriptions/domain/entities/SubscriptionBundle';

// Builds a bundle that's already due for renewal by default (renewalDate in the past).
function makeBundle(overrides: Partial<SubscriptionBundle> = {}): SubscriptionBundle {
  const now = new Date();
  const past = new Date(now.getTime() - 1000);

  return {
    id: 'bundle-1',
    userId: 'user-1',
    tier: 'PRO',
    billingCycle: 'MONTHLY',
    maxMessages: 100,
    remainingMessages: 50,
    price: 29.99,
    startDate: new Date(now.getTime() - 30 * 24 * 3600 * 1000),
    endDate: past,
    renewalDate: past,
    autoRenew: true,
    active: true,
    cancelledAt: null,
    createdAt: new Date(now.getTime() - 30 * 24 * 3600 * 1000),
    updatedAt: now,
    ...overrides,
  };
}

describe('BillingPolicy', () => {
  let policy: BillingPolicy;

  beforeEach(() => {
    policy = new BillingPolicy();
  });

  describe('calculateEndDate', () => {
    it('adds exactly 1 month for MONTHLY billing', () => {
      const start = new Date('2025-01-15T00:00:00.000Z');
      const end   = policy.calculateEndDate(start, 'MONTHLY');

      expect(end.getUTCFullYear()).toBe(2025);
      expect(end.getUTCMonth()).toBe(1); // February (0-indexed)
      expect(end.getUTCDate()).toBe(15);
    });

    it('adds exactly 1 year for YEARLY billing', () => {
      const start = new Date('2025-06-01T00:00:00.000Z');
      const end   = policy.calculateEndDate(start, 'YEARLY');

      expect(end.getUTCFullYear()).toBe(2026);
      expect(end.getUTCMonth()).toBe(5); // June (0-indexed)
      expect(end.getUTCDate()).toBe(1);
    });

    it('does not mutate the original startDate', () => {
      const start    = new Date('2025-03-10T00:00:00.000Z');
      const original = start.getTime();
      policy.calculateEndDate(start, 'MONTHLY');
      expect(start.getTime()).toBe(original);
    });
  });

  describe('shouldRenew', () => {
    it('returns true when all renewal conditions are met', () => {
      expect(policy.shouldRenew(makeBundle())).toBe(true);
    });

    it('returns false when autoRenew is false', () => {
      expect(policy.shouldRenew(makeBundle({ autoRenew: false }))).toBe(false);
    });

    it('returns false when active is false', () => {
      expect(policy.shouldRenew(makeBundle({ active: false }))).toBe(false);
    });

    it('returns false when cancelledAt is set', () => {
      expect(policy.shouldRenew(makeBundle({ cancelledAt: new Date() }))).toBe(false);
    });

    it('returns false when renewalDate is in the future', () => {
      const future = new Date(Date.now() + 7 * 24 * 3600 * 1000);
      expect(policy.shouldRenew(makeBundle({ renewalDate: future }))).toBe(false);
    });

    it('returns true when renewalDate is just in the past (boundary check)', () => {
      const justPast = new Date(Date.now() - 10);
      expect(policy.shouldRenew(makeBundle({ renewalDate: justPast }))).toBe(true);
    });
  });

  describe('calculateRenewalDate', () => {
    it('returns a date equal to endDate', () => {
      const end     = new Date('2026-01-01T00:00:00.000Z');
      const renewal = policy.calculateRenewalDate(end);
      expect(renewal.getTime()).toBe(end.getTime());
    });

    it('returns a new Date object, not the same reference', () => {
      const end     = new Date('2026-01-01T00:00:00.000Z');
      const renewal = policy.calculateRenewalDate(end);
      expect(renewal).not.toBe(end);
    });
  });
});
