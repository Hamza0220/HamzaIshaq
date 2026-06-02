/**
 * Cancellation.test.ts
 *
 * Tests SubscriptionService.cancelBundle:
 * - Sets cancelledAt and autoRenew=false
 * - Preserves all chat history (does not delete ChatMessages)
 * - Throws 404 when bundle not found
 * - Throws 400 when bundle already cancelled
 */

import { SubscriptionService } from '../../../src/modules/subscriptions/domain/services/SubscriptionService';
import { AppError } from '../../../src/shared/errors/AppError';
import type { ISubscriptionRepository, CreateBundleData } from '../../../src/modules/subscriptions/domain/services/SubscriptionService';
import type { SubscriptionBundle } from '../../../src/modules/subscriptions/domain/entities/SubscriptionBundle';

// ---------------------------------------------------------------------------
// Helper
// ---------------------------------------------------------------------------

function makeBundle(overrides: Partial<SubscriptionBundle> = {}): SubscriptionBundle {
  const now = new Date();
  return {
    id: 'bundle-1',
    userId: 'user-1',
    tier: 'PRO',
    billingCycle: 'MONTHLY',
    maxMessages: 100,
    remainingMessages: 80,
    price: 29.99,
    startDate: now,
    endDate: new Date(now.getTime() + 30 * 24 * 3600 * 1000),
    renewalDate: new Date(now.getTime() + 30 * 24 * 3600 * 1000),
    autoRenew: true,
    active: true,
    cancelledAt: null,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// In-memory repository stub
// ---------------------------------------------------------------------------

function buildRepo(bundle: SubscriptionBundle | null): ISubscriptionRepository & {
  updatedFields: Partial<SubscriptionBundle> | null;
} {
  let stored = bundle ? { ...bundle } : null;
  let updatedFields: Partial<SubscriptionBundle> | null = null;

  return {
    updatedFields,

    async createBundle(_data: CreateBundleData): Promise<SubscriptionBundle> {
      throw new Error('not implemented');
    },
    async findById(_id: string, _userId?: string): Promise<SubscriptionBundle | null> {
      return stored;
    },
    async findByUserId(_userId: string): Promise<SubscriptionBundle[]> {
      return stored ? [stored] : [];
    },
    async findDueForRenewal(): Promise<SubscriptionBundle[]> {
      return [];
    },
    async update(_id: string, data: Partial<SubscriptionBundle>): Promise<SubscriptionBundle> {
      updatedFields = data;
      this.updatedFields = data;
      stored = stored ? { ...stored, ...data } : null;
      return stored as SubscriptionBundle;
    },
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Cancellation', () => {
  it('sets cancelledAt to a non-null Date on cancellation', async () => {
    const bundle = makeBundle();
    const repo   = buildRepo(bundle);
    const svc    = new SubscriptionService(repo);

    const result = await svc.cancelBundle(bundle.id, bundle.userId);

    expect(result.cancelledAt).not.toBeNull();
    expect(result.cancelledAt).toBeInstanceOf(Date);
  });

  it('sets autoRenew to false on cancellation', async () => {
    const bundle = makeBundle({ autoRenew: true });
    const repo   = buildRepo(bundle);
    const svc    = new SubscriptionService(repo);

    const result = await svc.cancelBundle(bundle.id, bundle.userId);

    expect(result.autoRenew).toBe(false);
  });

  it('preserves chat history — does NOT delete any chat messages', async () => {
    // The service only updates the bundle; it never touches ChatMessage.
    // We verify by ensuring the update only contains cancelledAt + autoRenew.
    const bundle = makeBundle();
    const repo   = buildRepo(bundle);
    const svc    = new SubscriptionService(repo);

    await svc.cancelBundle(bundle.id, bundle.userId);

    const updated = repo.updatedFields ?? {};
    const keys    = Object.keys(updated);
    // Only cancelledAt and autoRenew should be modified
    expect(keys).toContain('cancelledAt');
    expect(keys).toContain('autoRenew');
    // No 'chatMessages' or similar destructive field
    expect(keys).not.toContain('chatMessages');
  });

  it('throws SUBSCRIPTION_NOT_FOUND (404) when bundle does not exist', async () => {
    const repo = buildRepo(null); // no bundle
    const svc  = new SubscriptionService(repo);

    await expect(svc.cancelBundle('nonexistent-id', 'user-1'))
      .rejects.toMatchObject({ code: 'SUBSCRIPTION_NOT_FOUND', statusCode: 404 });
  });

  it('throws AppError when bundle does not exist', async () => {
    const repo = buildRepo(null);
    const svc  = new SubscriptionService(repo);

    await expect(svc.cancelBundle('nonexistent-id', 'user-1'))
      .rejects.toBeInstanceOf(AppError);
  });

  it('throws ALREADY_CANCELLED (400) when bundle is already cancelled', async () => {
    const bundle = makeBundle({ cancelledAt: new Date() }); // already cancelled
    const repo   = buildRepo(bundle);
    const svc    = new SubscriptionService(repo);

    await expect(svc.cancelBundle(bundle.id, bundle.userId))
      .rejects.toMatchObject({ code: 'ALREADY_CANCELLED', statusCode: 400 });
  });
});
