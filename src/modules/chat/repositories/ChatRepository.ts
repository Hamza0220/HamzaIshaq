import { Pool } from 'pg';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';
import { ChatMessage } from '../domain/entities/ChatMessage';
import { IChatRepository, MonthlyUsageRecord } from '../domain/services/ChatService';

export interface CreateChatMessageDto {
  userId: string;
  question: string;
  answer: string;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
}

// Prisma client is shared across requests via a module-level singleton.
// Prisma v7 requires the pg adapter when using PostgreSQL.
function createPrismaClient(): PrismaClient {
  const pool = new Pool({ connectionString: process.env['DATABASE_URL'] });
  const adapter = new PrismaPg(pool);
  return new PrismaClient({ adapter });
}

const prisma = createPrismaClient();

// Concrete Prisma implementation of IChatRepository.
// Also exposes extra read methods that the controller needs (history, getById).
export class ChatRepository implements IChatRepository {

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

    if (!record) return null;

    return {
      id: record.id,
      userId: record.userId,
      month: record.month,
      year: record.year,
      count: record.count,
    };
  }

  async incrementMonthlyUsage(userId: string, month: number, year: number): Promise<void> {
    await prisma.monthlyUsage.upsert({
      where: { userId_month_year: { userId, month, year } },
      create: { userId, month, year, count: 1 },
      update: { count: { increment: 1 } },
    });
  }

  // Returns all messages for a user, newest first.
  async getByUserId(userId: string): Promise<ChatMessage[]> {
    const records = await prisma.chatMessage.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
    });

    return records.map((r) => this.toDomain(r));
  }

  // Scoped by userId to prevent users from reading each other's messages.
  async getById(id: string, userId: string): Promise<ChatMessage | null> {
    const record = await prisma.chatMessage.findFirst({
      where: { id, userId },
    });

    return record ? this.toDomain(record) : null;
  }

  // Atomically decrements remainingMessages on a bundle.
  // Uses serializable isolation to prevent concurrent over-deduction when
  // multiple requests arrive simultaneously for the same bundle.
  async deductBundleQuota(bundleId: string): Promise<void> {
    await prisma.$transaction(
      async (tx) => {
        const bundle = await tx.subscriptionBundle.findUnique({
          where: { id: bundleId },
        });

        if (!bundle) {
          throw new Error(`Bundle ${bundleId} not found`);
        }

        if (bundle.remainingMessages <= 0) {
          throw new Error(`Bundle ${bundleId} has no remaining messages`);
        }

        await tx.subscriptionBundle.update({
          where: { id: bundleId },
          data: { remainingMessages: { decrement: 1 } },
        });
      },
      { isolationLevel: 'Serializable' },
    );
  }

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
