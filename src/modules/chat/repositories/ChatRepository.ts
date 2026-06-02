import { Pool } from 'pg';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';
import { ChatMessage } from '../domain/entities/ChatMessage';
import {
  IChatRepository,
  MonthlyUsageRecord,
} from '../domain/services/ChatService';

// ---------------------------------------------------------------------------
// DTO
// ---------------------------------------------------------------------------

export interface CreateChatMessageDto {
  userId: string;
  question: string;
  answer: string;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
}

// ---------------------------------------------------------------------------
// Prisma singleton via adapter (Prisma v7 pattern)
// ---------------------------------------------------------------------------

function createPrismaClient(): PrismaClient {
  const pool = new Pool({ connectionString: process.env['DATABASE_URL'] });
  const adapter = new PrismaPg(pool);
  return new PrismaClient({ adapter });
}

const prisma = createPrismaClient();

// ---------------------------------------------------------------------------
// Repository
// ---------------------------------------------------------------------------

/**
 * Concrete Prisma implementation of IChatRepository.
 * Also exposes additional read methods used by the controller.
 */
export class ChatRepository implements IChatRepository {
  // -------------------------------------------------------------------------
  // IChatRepository contract
  // -------------------------------------------------------------------------

  async saveMessage(data: CreateChatMessageDto): Promise<ChatMessage> {
    const record = await prisma.chatMessage.create({
      data: {
        userId: data.userId,
        question: data.question,
        answer: data.answer,
        promptTokens: data.promptTokens,
        completionTokens: data.completionTokens,
        totalTokens: data.totalTokens,
      },
    });

    return this.toDomain(record);
  }

  async getMonthlyUsage(
    userId: string,
    month: number,
    year: number,
  ): Promise<MonthlyUsageRecord | null> {
    const record = await prisma.monthlyUsage.findUnique({
      where: { userId_month_year: { userId, month, year } },
    });

    return record
      ? { id: record.id, userId: record.userId, month: record.month, year: record.year, count: record.count }
      : null;
  }

  async incrementMonthlyUsage(
    userId: string,
    month: number,
    year: number,
  ): Promise<void> {
    await prisma.monthlyUsage.upsert({
      where: { userId_month_year: { userId, month, year } },
      create: { userId, month, year, count: 1 },
      update: { count: { increment: 1 } },
    });
  }

  // -------------------------------------------------------------------------
  // Controller-level read methods
  // -------------------------------------------------------------------------

  async getByUserId(userId: string): Promise<ChatMessage[]> {
    const records = await prisma.chatMessage.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
    });

    return records.map((r) => this.toDomain(r));
  }

  async getById(id: string, userId: string): Promise<ChatMessage | null> {
    const record = await prisma.chatMessage.findFirst({
      where: { id, userId },
    });

    return record ? this.toDomain(record) : null;
  }

  // -------------------------------------------------------------------------
  // Atomic bundle quota deduction via $transaction
  // -------------------------------------------------------------------------

  /**
   * Atomically decrements remainingMessages on a bundle.
   *
   * Uses a serializable transaction to prevent concurrent over-deduction:
   *   1. Fetch the bundle and verify it still has quota
   *   2. Decrement remainingMessages by 1
   *
   * Note: row-level FOR UPDATE locking is not available through Prisma's
   * standard API; serializable isolation provides equivalent protection
   * against concurrent writes on the same row.
   */
  async deductBundleQuota(bundleId: string): Promise<void> {
    await prisma.$transaction(
      async (tx) => {
        // Step 1 — fetch with a lock (serializable isolation handles contention)
        const bundle = await tx.subscriptionBundle.findUnique({
          where: { id: bundleId },
        });

        if (!bundle) {
          throw new Error(`Bundle ${bundleId} not found`);
        }

        if (bundle.remainingMessages <= 0) {
          throw new Error(`Bundle ${bundleId} has no remaining messages`);
        }

        // Step 2 — decrement
        await tx.subscriptionBundle.update({
          where: { id: bundleId },
          data: { remainingMessages: { decrement: 1 } },
        });
      },
      { isolationLevel: 'Serializable' },
    );
  }

  // -------------------------------------------------------------------------
  // Mapper
  // -------------------------------------------------------------------------

  private toDomain(record: {
    id: string;
    userId: string;
    question: string;
    answer: string;
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
    createdAt: Date;
  }): ChatMessage {
    return {
      id: record.id,
      userId: record.userId,
      question: record.question,
      answer: record.answer,
      promptTokens: record.promptTokens,
      completionTokens: record.completionTokens,
      totalTokens: record.totalTokens,
      createdAt: record.createdAt,
    };
  }
}
