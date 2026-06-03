import { ChatMessage } from '../entities/ChatMessage';
import { QuotaPolicy, SubscriptionBundle } from '../policies/QuotaPolicy';
import { mockOpenAIResponse } from '../../../../infrastructure/openai/mockOpenAI';
import { QuotaExhaustedError } from '../../../../shared/errors/QuotaExhaustedError';
import { AppError } from '../../../../shared/errors/AppError';

// Repository contracts — defined here so the domain layer stays independent
// of any concrete implementation (Prisma, in-memory, etc.)

export interface MonthlyUsageRecord {
  id: string;
  userId: string;
  month: number;
  year: number;
  count: number;
}

export interface IChatRepository {
  getMonthlyUsage(userId: string, month: number, year: number): Promise<MonthlyUsageRecord | null>;
  incrementMonthlyUsage(userId: string, month: number, year: number): Promise<void>;
  saveMessage(data: Omit<ChatMessage, 'id' | 'createdAt'>): Promise<ChatMessage>;
}

export interface ISubscriptionRepository {
  getActiveBundles(userId: string): Promise<SubscriptionBundle[]>;
  decrementRemainingMessages(bundleId: string): Promise<void>;
}

// ChatService orchestrates the full send-message flow:
//   1. Check free monthly quota
//   2. Fall back to subscription bundle if quota is exhausted
//   3. Throw QuotaExhaustedError if nothing is available
//   4. Call the mock AI
//   5. Persist the message and update counters
//   6. Return the saved record
//
// No Express or Prisma imports — pure domain logic.
export class ChatService {
  private readonly quotaPolicy = new QuotaPolicy();

  constructor(
    private readonly chatRepository: IChatRepository,
    private readonly subscriptionRepository: ISubscriptionRepository,
  ) {}

  async sendMessage(userId: string, question: string, requestingUserId?: string): Promise<ChatMessage> {
    // Domain-level ownership check — a user cannot send on behalf of someone else.
    if (requestingUserId !== undefined && requestingUserId !== userId) {
      throw new AppError(
        'Access denied: cannot send messages on behalf of another user',
        'FORBIDDEN',
        403,
      );
    }

    const now = new Date();
    const currentMonth = now.getMonth() + 1; // getMonth() is 0-indexed
    const currentYear = now.getFullYear();

    const usage = await this.chatRepository.getMonthlyUsage(userId, currentMonth, currentYear);

    // If the stored record is from a previous billing period, treat count as 0
    // so the free quota resets automatically at the start of a new month.
    const effectiveCount =
      usage && usage.month === currentMonth && usage.year === currentYear
        ? usage.count
        : 0;

    const usingFreeTier = this.quotaPolicy.canUseFreeTier(effectiveCount);

    let selectedBundle: SubscriptionBundle | null = null;

    if (!usingFreeTier) {
      const bundles = await this.subscriptionRepository.getActiveBundles(userId);
      selectedBundle = this.quotaPolicy.selectBundle(bundles);

      if (!selectedBundle) {
        throw new QuotaExhaustedError(
          'Free quota exhausted and no active subscription bundle available',
        );
      }
    }

    const aiResponse = await mockOpenAIResponse(question);

    const saved = await this.chatRepository.saveMessage({
      userId,
      question,
      answer: aiResponse.message,
      promptTokens: aiResponse.usage.prompt_tokens,
      completionTokens: aiResponse.usage.completion_tokens,
      totalTokens: aiResponse.usage.total_tokens,
    });

    if (usingFreeTier) {
      await this.chatRepository.incrementMonthlyUsage(userId, currentMonth, currentYear);
    } else if (selectedBundle && !this.quotaPolicy.isEnterpriseUnlimited(selectedBundle.tier)) {
      // Enterprise bundles are unlimited — only deduct from Basic/Pro
      await this.subscriptionRepository.decrementRemainingMessages(selectedBundle.id);
    }

    return saved;
  }
}
