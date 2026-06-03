import { QuotaPolicy } from '../../../src/modules/chat/domain/policies/QuotaPolicy';
import type { SubscriptionBundle } from '../../../src/modules/chat/domain/policies/QuotaPolicy';

// Builds a minimal SubscriptionBundle with sensible defaults for tests.
function makeBundle(overrides: Partial<SubscriptionBundle> = {}): SubscriptionBundle {
  return {
    id: 'bundle-1',
    userId: 'user-1',
    tier: 'BASIC',
    billingCycle: 'MONTHLY',
    maxMessages: 10,
    remainingMessages: 5,
    price: 9.99,
    startDate: new Date(),
    endDate: new Date(),
    renewalDate: new Date(),
    autoRenew: true,
    active: true,
    cancelledAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

describe('QuotaPolicy', () => {
  let policy: QuotaPolicy;

  beforeEach(() => {
    policy = new QuotaPolicy();
  });

  describe('canUseFreeTier', () => {
    it('returns true for count 0', () => {
      expect(policy.canUseFreeTier(0)).toBe(true);
    });

    it('returns true for count 1', () => {
      expect(policy.canUseFreeTier(1)).toBe(true);
    });

    it('returns true for count 2', () => {
      expect(policy.canUseFreeTier(2)).toBe(true);
    });

    it('returns false for count 3', () => {
      expect(policy.canUseFreeTier(3)).toBe(false);
    });

    it('returns false for count 10', () => {
      expect(policy.canUseFreeTier(10)).toBe(false);
    });
  });

  describe('selectBundle', () => {
    it('returns null for an empty array', () => {
      expect(policy.selectBundle([])).toBeNull();
    });

    it('returns null when all bundles have 0 remaining messages', () => {
      const bundles = [
        makeBundle({ id: 'a', remainingMessages: 0 }),
        makeBundle({ id: 'b', remainingMessages: 0 }),
      ];
      expect(policy.selectBundle(bundles)).toBeNull();
    });

    it('picks the bundle with the highest remainingMessages', () => {
      const low  = makeBundle({ id: 'low',  remainingMessages: 2 });
      const high = makeBundle({ id: 'high', remainingMessages: 9 });
      const mid  = makeBundle({ id: 'mid',  remainingMessages: 5 });

      const result = policy.selectBundle([low, high, mid]);
      expect(result?.id).toBe('high');
    });

    it('returns ENTERPRISE bundle even when remainingMessages is -1', () => {
      const enterprise = makeBundle({
        id: 'ent',
        tier: 'ENTERPRISE',
        remainingMessages: -1,
      });
      // No other bundles — ENTERPRISE is the only option
      const result = policy.selectBundle([enterprise]);
      expect(result?.id).toBe('ent');
    });

    it('returns ENTERPRISE bundle when it is the only active bundle', () => {
      const enterprise = makeBundle({
        id: 'ent',
        tier: 'ENTERPRISE',
        remainingMessages: 0, // zero remaining
      });
      const result = policy.selectBundle([enterprise]);
      expect(result?.id).toBe('ent');
    });
  });

  describe('isEnterpriseUnlimited', () => {
    it('returns true for ENTERPRISE', () => {
      expect(policy.isEnterpriseUnlimited('ENTERPRISE')).toBe(true);
    });

    it('returns false for BASIC', () => {
      expect(policy.isEnterpriseUnlimited('BASIC')).toBe(false);
    });

    it('returns false for PRO', () => {
      expect(policy.isEnterpriseUnlimited('PRO')).toBe(false);
    });

    it('returns false for empty string', () => {
      expect(policy.isEnterpriseUnlimited('')).toBe(false);
    });
  });
});
