import {
  getMaxMessages,
  getPrice,
} from '../../../src/modules/subscriptions/domain/entities/SubscriptionBundle';
import type {
  SubscriptionTier,
  BillingCycle,
} from '../../../src/modules/subscriptions/domain/entities/SubscriptionBundle';

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------
describe('SubscriptionBundle entity helpers', () => {

  // ── getMaxMessages ─────────────────────────────────────────────────────────
  describe('getMaxMessages', () => {
    it('returns 10 for BASIC', () => {
      expect(getMaxMessages('BASIC')).toBe(10);
    });

    it('returns 100 for PRO', () => {
      expect(getMaxMessages('PRO')).toBe(100);
    });

    it('returns -1 for ENTERPRISE (unlimited)', () => {
      expect(getMaxMessages('ENTERPRISE')).toBe(-1);
    });
  });

  // ── getPrice ───────────────────────────────────────────────────────────────
  describe('getPrice', () => {
    const cases: Array<[SubscriptionTier, BillingCycle, number]> = [
      ['BASIC',      'MONTHLY',   9.99],
      ['BASIC',      'YEARLY',   99.99],
      ['PRO',        'MONTHLY',  29.99],
      ['PRO',        'YEARLY',  299.99],
      ['ENTERPRISE', 'MONTHLY',  99.99],
      ['ENTERPRISE', 'YEARLY',  999.99],
    ];

    it.each(cases)(
      '%s/%s → $%s',
      (tier, cycle, expected) => {
        expect(getPrice(tier, cycle)).toBe(expected);
      },
    );
  });
});
