import { BillingPolicy } from '../../../src/modules/subscriptions/domain/policies/BillingPolicy';
import type { SubscriptionBundle } from '../../../src/modules/subscriptions/domain/entities/SubscriptionBundle';

// ---------------------------------------------------------------------------
// Helper — build a minimal SubscriptionBundle
// ---------------------------------------------------------------------------
function makeBundle(overrides: Partial<SubscriptionBundle> = {}): SubscriptionBundle {
  const now = new Date();
  const past = new Date(now.getTime() - 1000); // 1 second ago

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
    renewalDate: past, // due for renewal by default
    autoRenew: true,
    active: true,
    cancelledAt: null,
    createdAt: new Date(now.getTime() - 30 * 24 * 3600 * 1000),
    updatedAt: now,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------
describe('BillingPolicy', () => {
  let policy: BillingPolicy;

  beforeEach(() => {
    policy = new BillingPolicy();
  });

  // ── calculateEndDate ───────────────────────────────────────────────────────
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

  // ── shouldRenew ────────────────────────────────────────────────────────────
  describe('shouldRenew', () => {
    it('returns true when all renewal conditions are met', () => {
      const bundle = makeBundle(); // renewalDate is in the past, all flags set
      expect(policy.shouldRenew(bundle)).toBe(true);
    });

    it('returns false when autoRenew is false', () => {
      const bundle = makeBundle({ autoRenew: false });
      expect(policy.shouldRenew(bundle)).toBe(false);
    });

    it('returns false when active is false', () => {
      const bundle = makeBundle({ active: false });
      expect(policy.shouldRenew(bundle)).toBe(false);
    });

    it('returns false when cancelledAt is set', () => {
      const bundle = makeBundle({ cancelledAt: new Date() });
      expect(policy.shouldRenew(bundle)).toBe(false);
    });

    it('returns false when renewalDate is in the future', () => {
      const future = new Date(Date.now() + 7 * 24 * 3600 * 1000); // 7 days ahead
      const bundle = makeBundle({ renewalDate: future });
      expect(policy.shouldRenew(bundle)).toBe(false);
    });

    it('returns true when renewalDate is exactly now (boundary)', () => {
      // Slightly in the past to avoid flaky race with new Date() inside shouldRenew
      const justPast = new Date(Date.now() - 10);
      const bundle   = makeBundle({ renewalDate: justPast });
      expect(policy.shouldRenew(bundle)).toBe(true);
    });
  });

  // ── calculateRenewalDate ───────────────────────────────────────────────────
  describe('calculateRenewalDate', () => {
    it('returns a date equal to endDate', () => {
      const end     = new Date('2026-01-01T00:00:00.000Z');
      const renewal = policy.calculateRenewalDate(end);
      expect(renewal.getTime()).toBe(end.getTime());
    });

    it('returns a new Date object (not the same reference)', () => {
      const end     = new Date('2026-01-01T00:00:00.000Z');
      const renewal = policy.calculateRenewalDate(end);
      expect(renewal).not.toBe(end);
    });
  });
});
