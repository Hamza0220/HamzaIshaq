/**
 * ConcurrentQuota.test.ts
 *
 * Verifies that when 3 concurrent sendMessage calls arrive and only
 * 1 quota slot remains, exactly 1 succeeds and the other 2 throw
 * QuotaExhaustedError.
 *
 * Strategy:
 * - Free tier count = 3 (exhausted) so the service goes to bundle quota.
 * - One BASIC bundle with remainingMessages = 1.
 * - decrementRemainingMessages is implemented in-memory so concurrent
 *   decrement logic is exercised correctly.
 * - mockOpenAIResponse is mocked to resolve instantly.
 */

// ── Mock mockOpenAIResponse before importing ChatService ──────────────────
jest.mock('../../../src/infrastructure/openai/mockOpenAI', () => ({
  mockOpenAIResponse: jest.fn().mockResolvedValue({
    message: 'mock answer',
    usage: { prompt_tokens: 2, completion_tokens: 47, total_tokens: 49 },
  }),
}));

import { ChatService } from '../../../src/modules/chat/domain/services/ChatService';
import { QuotaExhaustedError } from '../../../src/shared/errors/QuotaExhaustedError';
import type {
  IChatRepository,
  MonthlyUsageRecord,
} from '../../../src/modules/chat/domain/services/ChatService';
import type { ISubscriptionRepository } from '../../../src/modules/chat/domain/services/ChatService';
import type { SubscriptionBundle } from '../../../src/modules/chat/domain/policies/QuotaPolicy';
import type { ChatMessage } from '../../../src/modules/chat/domain/entities/ChatMessage';

// Helper factories

function makeMessage(userId: string, question: string): ChatMessage {
  return {
    id: Math.random().toString(36).slice(2),
    userId,
    question,
    answer: 'mock answer',
    promptTokens: 2,
    completionTokens: 47,
    totalTokens: 49,
    createdAt: new Date(),
  };
}

function makeBundle(remaining: number): SubscriptionBundle {
  const now = new Date();
  return {
    id: 'bundle-1',
    userId: 'user-1',
    tier: 'BASIC',
    billingCycle: 'MONTHLY',
    maxMessages: 10,
    remainingMessages: remaining,
    price: 9.99,
    startDate: now,
    endDate: now,
    renewalDate: now,
    autoRenew: true,
    active: true,
    cancelledAt: null,
    createdAt: now,
    updatedAt: now,
  };
}

// In-memory repositories

function buildChatRepo(freeCount: number): IChatRepository {
  const now = new Date();

  return {
    async getMonthlyUsage(): Promise<MonthlyUsageRecord> {
      return {
        id: 'mu-1',
        userId: 'user-1',
        month: now.getMonth() + 1,
        year: now.getFullYear(),
        count: freeCount,
      };
    },
    async incrementMonthlyUsage(): Promise<void> {
      // no-op
    },
    async saveMessage(data): Promise<ChatMessage> {
      return makeMessage(data.userId, data.question);
    },
  };
}

function buildSubscriptionRepo(initialRemaining: number): ISubscriptionRepository {
  // Shared mutable state — simulates concurrent DB access
  let remaining = initialRemaining;
  const bundle  = makeBundle(initialRemaining);

  return {
    async getActiveBundles(): Promise<SubscriptionBundle[]> {
      // Return current remaining count so each call sees live state
      return [{ ...bundle, remainingMessages: remaining }];
    },
    async decrementRemainingMessages(): Promise<void> {
      if (remaining <= 0) {
        throw new QuotaExhaustedError('No remaining messages in bundle');
      }
      remaining -= 1;
    },
  };
}

// Test

describe('ConcurrentQuota', () => {
  it('allows exactly 1 success when 3 concurrent calls share 1 remaining quota', async () => {
    // Free tier already exhausted (count = 3)
    const chatRepo = buildChatRepo(3);
    // Only 1 message slot left in the bundle
    const subRepo  = buildSubscriptionRepo(1);

    const service = new ChatService(chatRepo, subRepo);

    // Fire 3 concurrent sendMessage calls
    const results = await Promise.allSettled([
      service.sendMessage('user-1', 'Q1'),
      service.sendMessage('user-1', 'Q2'),
      service.sendMessage('user-1', 'Q3'),
    ]);

    const fulfilled = results.filter((r) => r.status === 'fulfilled');
    const rejected  = results.filter((r) => r.status === 'rejected');

    // Exactly 1 should succeed
    expect(fulfilled).toHaveLength(1);
    // The other 2 must fail with QuotaExhaustedError
    expect(rejected).toHaveLength(2);

    for (const r of rejected) {
      expect(r.status).toBe('rejected');
      expect((r as PromiseRejectedResult).reason).toBeInstanceOf(QuotaExhaustedError);
    }
  });

  it('throws QuotaExhaustedError when free tier is exhausted and no bundles exist', async () => {
    const chatRepo = buildChatRepo(3); // free tier exhausted
    const subRepo: ISubscriptionRepository = {
      async getActiveBundles() { return []; },
      async decrementRemainingMessages() { /* no-op */ },
    };

    const service = new ChatService(chatRepo, subRepo);

    await expect(service.sendMessage('user-1', 'question'))
      .rejects.toBeInstanceOf(QuotaExhaustedError);
  });

  it('succeeds on all 3 calls when free tier has remaining quota', async () => {
    const chatRepo = buildChatRepo(0); // 0 uses — all 3 within free tier
    const subRepo: ISubscriptionRepository = {
      async getActiveBundles() { return []; },
      async decrementRemainingMessages() { /* no-op */ },
    };

    const service = new ChatService(chatRepo, subRepo);

    const results = await Promise.allSettled([
      service.sendMessage('user-1', 'Q1'),
      service.sendMessage('user-1', 'Q2'),
      service.sendMessage('user-1', 'Q3'),
    ]);

    // All 3 should succeed because free tier count starts at 0
    // (getMonthlyUsage always returns 0 in this mock)
    expect(results.every((r) => r.status === 'fulfilled')).toBe(true);
  });
});
