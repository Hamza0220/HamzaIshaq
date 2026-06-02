import { QuotaPolicy } from '../../../src/modules/chat/domain/policies/QuotaPolicy';
import type { SubscriptionBundle } from '../../../src/modules/chat/domain/policies/QuotaPolicy';

function makeBundle(overrides: Partial<SubscriptionBundle> = {}): SubscriptionBundle {
  return {
    id: 'b1',
    userId: 'u1',
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

describe('BundleSelection', () => {
  const policy = new QuotaPolicy();

  it('picks the bundle with the highest remainingMessages', () => {
    const bundles = [
      makeBundle({ id: 'low',  remainingMessages: 1  }),
      makeBundle({ id: 'high', remainingMessages: 99 }),
      makeBundle({ id: 'mid',  remainingMessages: 10 }),
    ];
    expect(policy.selectBundle(bundles)?.id).toBe('high');
  });

  it('skips bundles with 0 remaining and picks the next eligible one', () => {
    const bundles = [
      makeBundle({ id: 'empty', remainingMessages: 0 }),
      makeBundle({ id: 'full',  remainingMessages: 5 }),
    ];
    expect(policy.selectBundle(bundles)?.id).toBe('full');
  });

  it('returns null when every bundle has 0 remaining messages', () => {
    const bundles = [
      makeBundle({ id: 'a', remainingMessages: 0 }),
      makeBundle({ id: 'b', remainingMessages: 0 }),
    ];
    expect(policy.selectBundle(bundles)).toBeNull();
  });

  it('returns null for an empty input array', () => {
    expect(policy.selectBundle([])).toBeNull();
  });

  it('returns ENTERPRISE regardless of remaining count (including -1)', () => {
    const enterprise = makeBundle({ id: 'ent', tier: 'ENTERPRISE', remainingMessages: -1 });
    expect(policy.selectBundle([enterprise])?.id).toBe('ent');
  });

  it('returns ENTERPRISE even when remaining is 0', () => {
    const enterprise = makeBundle({ id: 'ent', tier: 'ENTERPRISE', remainingMessages: 0 });
    expect(policy.selectBundle([enterprise])?.id).toBe('ent');
  });

  it('does not mutate the original array order', () => {
    const bundles = [
      makeBundle({ id: 'a', remainingMessages: 3 }),
      makeBundle({ id: 'b', remainingMessages: 9 }),
      makeBundle({ id: 'c', remainingMessages: 1 }),
    ];
    const originalFirstId = bundles[0]?.id;
    policy.selectBundle(bundles);
    expect(bundles[0]?.id).toBe(originalFirstId);
  });
});
