import { Pool } from 'pg';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient, Prisma } from '@prisma/client';
import {
  SubscriptionBundle,
  SubscriptionTier,
  BillingCycle,
} from '../domain/entities/SubscriptionBundle';
import {
  ISubscriptionRepository,
  CreateBundleData,
} from '../domain/services/SubscriptionService';

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
 * Concrete Prisma implementation of ISubscriptionRepository.
 * Also exposes additional methods required by the controller.
 */
export class SubscriptionRepository implements ISubscriptionRepository {
  // -------------------------------------------------------------------------
  // ISubscriptionRepository contract
  // -------------------------------------------------------------------------

  async createBundle(data: CreateBundleData): Promise<SubscriptionBundle> {
    const record = await prisma.subscriptionBundle.create({
      data: {
        userId: data.userId,
        tier: data.tier,
        billingCycle: data.billingCycle,
        maxMessages: data.maxMessages,
        remainingMessages: data.remainingMessages,
        price: new Prisma.Decimal(data.price),
        startDate: data.startDate,
        endDate: data.endDate,
        renewalDate: data.renewalDate,
        autoRenew: data.autoRenew,
        active: data.active,
      },
    });

    return this.toDomain(record);
  }

  async findById(id: string, userId?: string): Promise<SubscriptionBundle | null> {
    const record = await prisma.subscriptionBundle.findFirst({
      where: userId ? { id, userId } : { id },
    });

    return record ? this.toDomain(record) : null;
  }

  async findByUserId(userId: string): Promise<SubscriptionBundle[]> {
    const records = await prisma.subscriptionBundle.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
    });

    return records.map((r) => this.toDomain(r));
  }

  async findDueForRenewal(): Promise<SubscriptionBundle[]> {
    const now = new Date();
    const records = await prisma.subscriptionBundle.findMany({
      where: {
        autoRenew: true,
        active: true,
        cancelledAt: null,
        renewalDate: { lte: now },
      },
    });

    return records.map((r) => this.toDomain(r));
  }

  async update(
    id: string,
    data: Partial<SubscriptionBundle>,
  ): Promise<SubscriptionBundle> {
    // Convert price back to Decimal if present
    const updateData: Prisma.SubscriptionBundleUpdateInput = {
      ...(data.tier !== undefined && { tier: data.tier }),
      ...(data.billingCycle !== undefined && { billingCycle: data.billingCycle }),
      ...(data.maxMessages !== undefined && { maxMessages: data.maxMessages }),
      ...(data.remainingMessages !== undefined && {
        remainingMessages: data.remainingMessages,
      }),
      ...(data.price !== undefined && { price: new Prisma.Decimal(data.price) }),
      ...(data.startDate !== undefined && { startDate: data.startDate }),
      ...(data.endDate !== undefined && { endDate: data.endDate }),
      ...(data.renewalDate !== undefined && { renewalDate: data.renewalDate }),
      ...(data.autoRenew !== undefined && { autoRenew: data.autoRenew }),
      ...(data.active !== undefined && { active: data.active }),
      ...(data.cancelledAt !== undefined && { cancelledAt: data.cancelledAt }),
    };

    const record = await prisma.subscriptionBundle.update({
      where: { id },
      data: updateData,
    });

    return this.toDomain(record);
  }

  // -------------------------------------------------------------------------
  // Additional controller-level methods
  // -------------------------------------------------------------------------

  /** Return all active bundles for a user (used by quota checks). */
  async findActiveByUserId(userId: string): Promise<SubscriptionBundle[]> {
    const records = await prisma.subscriptionBundle.findMany({
      where: { userId, active: true, cancelledAt: null },
      orderBy: { remainingMessages: 'desc' },
    });

    return records.map((r) => this.toDomain(r));
  }

  /** Admin: return all bundles across all users. */
  async findAll(): Promise<SubscriptionBundle[]> {
    const records = await prisma.subscriptionBundle.findMany({
      orderBy: { createdAt: 'desc' },
    });

    return records.map((r) => this.toDomain(r));
  }

  /** Set cancelledAt = now and autoRenew = false. */
  async cancel(id: string): Promise<void> {
    await prisma.subscriptionBundle.update({
      where: { id },
      data: { cancelledAt: new Date(), autoRenew: false },
    });
  }

  /** Mark a bundle inactive (used after payment failure). */
  async markInactive(id: string): Promise<void> {
    await prisma.subscriptionBundle.update({
      where: { id },
      data: { active: false },
    });
  }

  /** Extend dates and reset quota after a successful renewal. */
  async renew(
    id: string,
    newEndDate: Date,
    newRenewalDate: Date,
    maxMessages: number,
  ): Promise<void> {
    await prisma.subscriptionBundle.update({
      where: { id },
      data: {
        endDate: newEndDate,
        renewalDate: newRenewalDate,
        remainingMessages: maxMessages,
        startDate: new Date(),
        active: true,
      },
    });
  }

  // -------------------------------------------------------------------------
  // Mapper: Prisma record → domain entity
  // -------------------------------------------------------------------------

  private toDomain(record: {
    id: string;
    userId: string;
    tier: string;
    billingCycle: string;
    maxMessages: number;
    remainingMessages: number;
    price: Prisma.Decimal;
    startDate: Date;
    endDate: Date;
    renewalDate: Date;
    autoRenew: boolean;
    active: boolean;
    cancelledAt: Date | null;
    createdAt: Date;
    updatedAt: Date;
  }): SubscriptionBundle {
    return {
      id: record.id,
      userId: record.userId,
      tier: record.tier as SubscriptionTier,
      billingCycle: record.billingCycle as BillingCycle,
      maxMessages: record.maxMessages,
      remainingMessages: record.remainingMessages,
      price: record.price.toNumber(),
      startDate: record.startDate,
      endDate: record.endDate,
      renewalDate: record.renewalDate,
      autoRenew: record.autoRenew,
      active: record.active,
      cancelledAt: record.cancelledAt,
      createdAt: record.createdAt,
      updatedAt: record.updatedAt,
    };
  }
}
