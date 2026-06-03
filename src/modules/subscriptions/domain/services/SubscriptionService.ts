import {
  SubscriptionBundle,
  SubscriptionTier,
  BillingCycle,
  getMaxMessages,
  getPrice,
} from '../entities/SubscriptionBundle';
import { BillingPolicy } from '../policies/BillingPolicy';
import { AppError } from '../../../../shared/errors/AppError';

// Repository contract — the service only depends on this interface,
// never on the concrete Prisma implementation.
export interface ISubscriptionRepository {
  createBundle(data: CreateBundleData): Promise<SubscriptionBundle>;
  findById(id: string, userId?: string): Promise<SubscriptionBundle | null>;
  findByUserId(userId: string): Promise<SubscriptionBundle[]>;
  findDueForRenewal(): Promise<SubscriptionBundle[]>;
  update(id: string, data: Partial<SubscriptionBundle>): Promise<SubscriptionBundle>;
}

export interface CreateBundleData {
  userId: string;
  tier: SubscriptionTier;
  billingCycle: BillingCycle;
  maxMessages: number;
  remainingMessages: number;
  price: number;
  startDate: Date;
  endDate: Date;
  renewalDate: Date;
  autoRenew: boolean;
  active: boolean;
}

// Orchestrates all subscription lifecycle use-cases.
// Pure domain — no Express or Prisma imports allowed here.
export class SubscriptionService {
  private readonly billingPolicy = new BillingPolicy();

  constructor(private readonly subscriptionRepository: ISubscriptionRepository) {}

  // Creates a bundle with the right dates, price, and message quota
  // derived from the chosen tier and billing cycle.
  async createBundle(
    userId: string,
    tier: SubscriptionTier,
    billingCycle: BillingCycle,
    autoRenew: boolean,
  ): Promise<SubscriptionBundle> {
    const startDate = new Date();
    const endDate = this.billingPolicy.calculateEndDate(startDate, billingCycle);
    const renewalDate = this.billingPolicy.calculateRenewalDate(endDate);
    const maxMessages = getMaxMessages(tier);
    const price = getPrice(tier, billingCycle);

    return this.subscriptionRepository.createBundle({
      userId,
      tier,
      billingCycle,
      maxMessages,
      // Enterprise is unlimited (-1); store MAX_SAFE_INTEGER so the DB
      // integer column doesn't need a NULL / special-case check.
      remainingMessages: maxMessages === -1 ? Number.MAX_SAFE_INTEGER : maxMessages,
      price,
      startDate,
      endDate,
      renewalDate,
      autoRenew,
      active: true,
    });
  }

  // Records cancelledAt and disables auto-renew. The bundle stays active
  // until its endDate so users get what they paid for; historical chat
  // data is never touched.
  async cancelBundle(bundleId: string, userId: string): Promise<SubscriptionBundle> {
    const bundle = await this.subscriptionRepository.findById(bundleId, userId);

    if (!bundle) {
      throw new AppError('Subscription bundle not found', 'SUBSCRIPTION_NOT_FOUND', 404);
    }

    // Ownership enforced at domain level — not just at the controller.
    if (bundle.userId !== userId) {
      throw new AppError(
        'Access denied: this subscription does not belong to you',
        'FORBIDDEN',
        403,
      );
    }

    if (bundle.cancelledAt !== null) {
      throw new AppError('Subscription is already cancelled', 'ALREADY_CANCELLED', 400);
    }

    return this.subscriptionRepository.update(bundleId, {
      cancelledAt: new Date(),
      autoRenew: false,
    });
  }

  // Flips autoRenew on or off. Ownership is verified before the update.
  async toggleAutoRenew(
    bundleId: string,
    userId: string,
    value: boolean,
  ): Promise<SubscriptionBundle> {
    const bundle = await this.subscriptionRepository.findById(bundleId, userId);

    if (!bundle) {
      throw new AppError('Subscription bundle not found', 'SUBSCRIPTION_NOT_FOUND', 404);
    }

    if (bundle.userId !== userId) {
      throw new AppError(
        'Access denied: this subscription does not belong to you',
        'FORBIDDEN',
        403,
      );
    }

    return this.subscriptionRepository.update(bundleId, { autoRenew: value });
  }

  // Returns all bundles (active and cancelled) for a user.
  async getUserBundles(userId: string): Promise<SubscriptionBundle[]> {
    return this.subscriptionRepository.findByUserId(userId);
  }

  // Renewal job — typically called by an admin endpoint or a cron trigger.
  // Processes every bundle whose renewalDate has passed:
  //   - payment success → extend dates, reset quota
  //   - payment failure → mark inactive (data preserved)
  async processRenewals(): Promise<{ renewed: number; failed: number }> {
    const dueBundles = await this.subscriptionRepository.findDueForRenewal();

    let renewed = 0;
    let failed = 0;

    for (const bundle of dueBundles) {
      if (!this.billingPolicy.shouldRenew(bundle)) continue;

      const paid = this.billingPolicy.simulatePayment();

      if (!paid) {
        await this.subscriptionRepository.update(bundle.id, { active: false });
        failed++;
        continue;
      }

      const newStart = new Date();
      const newEnd = this.billingPolicy.calculateEndDate(newStart, bundle.billingCycle);
      const newRenewal = this.billingPolicy.calculateRenewalDate(newEnd);
      const max = getMaxMessages(bundle.tier);

      await this.subscriptionRepository.update(bundle.id, {
        startDate: newStart,
        endDate: newEnd,
        renewalDate: newRenewal,
        remainingMessages: max === -1 ? Number.MAX_SAFE_INTEGER : max,
        active: true,
      });

      renewed++;
    }

    return { renewed, failed };
  }
}
