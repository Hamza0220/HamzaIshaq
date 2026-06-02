import { ChatMessage } from '../entities/ChatMessage';
import { QuotaPolicy, SubscriptionBundle } from '../policies/QuotaPolicy';
import { mockOpenAIResponse } from '../../../../infrastructure/openai/mockOpenAI';
import { QuotaExhaustedError } from '../../../../shared/errors/QuotaExhaustedError';
import { AppError } from '../../../../shared/errors/AppError';

// ---------------------------------------------------------------------------
// Repository interfaces — pure domain contracts, no Prisma/Express imports
// ---------------------------------------------------------------------------

export interface MonthlyUsageRecord {
  id: string;
  userId: string;
  month: number;
  year: number;
  count: number;
}

export interface IChatRepository {
  /** Find the current monthly usage record for a user. Returns null if none exists. */
  getMonthlyUsage(userId: string, month: number, year: number): Promise<MonthlyUsageRecord | null>;
  /** Upsert the monthly usage count for the current period. */
  incrementMonthlyUsage(userId: string, month: number, year: number): Promise<void>;
  /** Persist a new chat message and return it with all fields populated. */
  saveMessage(data: Omit<ChatMessage, 'id' | 'createdAt'>): Promise<ChatMessage>;
}

export interface ISubscriptionRepository {
  /** Return all active, non-cancelled bundles for a user. */
  getActiveBundles(userId: string): Promise<SubscriptionBundle[]>;
  /** Decrement remainingMessages by 1 for the given bundle. */
  decrementRemainingMessages(bundleId: string): Promise<void>;
}

// ---------------------------------------------------------------------------
// ChatService
// ---------------------------------------------------------------------------

/**
 * Orchestrates the full message-sending flow:
 *   1. Check free monthly quota (3 messages/month)
 *   2. If exhausted, pick an active subscription bundle
 *   3. If no bundle available, throw QuotaExhaustedError
 *   4. Call the (mock) AI
 *   5. Persist the message
 *   6. Return the saved message
 *
 * Pure domain service — no Express or Prisma imports.
 */
export class ChatService {
  private readonly quotaPolicy = new QuotaPolicy();

  constructor(
    private readonly chatRepository: IChatRepository,
    private readonly subscriptionRepository: ISubscriptionRepository,
  ) {}

  async sendMessage(userId: string, question: string, requestingUserId?: string): Promise<ChatMessage> {
    // Domain policy level authorization — enforce ownership
    // A user may only send messages on their own behalf (not as another user)
    if (requestingUserId !== undefined && requestingUserId !== userId) {
      throw new AppError('Access denied: cannot send messages on behalf of another user', 'FORBIDDEN', 403);
    }

    const now = new Date();
    const currentMonth = now.getMonth() + 1; // 1-12
    const currentYear = now.getFullYear();

    // ------------------------------------------------------------------
    // Step 1: Check free tier quota
    // ------------------------------------------------------------------
    const usage = await this.chatRepository.getMonthlyUsage(
      userId,
      currentMonth,
      currentYear,
    );

    // If the stored record belongs to a past month/year treat the count as 0
    // (new billing period — free quota resets automatically)
    const effectiveCount =
      usage && usage.month === currentMonth && usage.year === currentYear
        ? usage.count
        : 0;

    const usingFreeTier = this.quotaPolicy.canUseFreeTier(effectiveCount);

    // ------------------------------------------------------------------
    // Step 2: If free quota exhausted, pick a bundle
    // ------------------------------------------------------------------
    let selectedBundle: SubscriptionBundle | null = null;

    if (!usingFreeTier) {
      const bundles = await this.subscriptionRepository.getActiveBundles(userId);
      selectedBundle = this.quotaPolicy.selectBundle(bundles);

      // Step 3: No eligible bundle — throw
      if (!selectedBundle) {
        throw new QuotaExhaustedError(
          'Free quota exhausted and no active subscription bundle available',
        );
      }
    }

    // ------------------------------------------------------------------
    // Step 4: Call the mock AI
    // ------------------------------------------------------------------
    const aiResponse = await mockOpenAIResponse(question);

    // ------------------------------------------------------------------
    // Step 5: Persist the message and update counters
    // ------------------------------------------------------------------
    const saved = await this.chatRepository.saveMessage({
      userId,
      question,
      answer: aiResponse.message,
      promptTokens: aiResponse.usage.prompt_tokens,
      completionTokens: aiResponse.usage.completion_tokens,
      totalTokens: aiResponse.usage.total_tokens,
    });

    if (usingFreeTier) {
      // Increment free-tier usage counter
      await this.chatRepository.incrementMonthlyUsage(userId, currentMonth, currentYear);
    } else if (selectedBundle && !this.quotaPolicy.isEnterpriseUnlimited(selectedBundle.tier)) {
      // Decrement paid bundle only for non-Enterprise (Enterprise is unlimited)
      await this.subscriptionRepository.decrementRemainingMessages(selectedBundle.id);
    }

    // ------------------------------------------------------------------
    // Step 6: Return the saved message
    // ------------------------------------------------------------------
    return saved;
  }
}
