import {
  SubscriptionBundle,
  SubscriptionTier,
  BillingCycle,
  getMaxMessages,
  getPrice,
} from '../entities/SubscriptionBundle';
import { BillingPolicy } from '../policies/BillingPolicy';
import { AppError } from '../../../../shared/errors/AppError';

// ---------------------------------------------------------------------------
// Repository interface — pure domain contract, no Prisma/Express imports
// ---------------------------------------------------------------------------

export interface ISubscriptionRepository {
  /** Persist a new bundle and return it fully populated. */
  createBundle(data: CreateBundleData): Promise<SubscriptionBundle>;

  /** Find a bundle by id, optionally scoped to a userId. */
  findById(id: string, userId?: string): Promise<SubscriptionBundle | null>;

  /** Return all bundles for a user. */
  findByUserId(userId: string): Promise<SubscriptionBundle[]>;

  /** Return all active bundles whose renewalDate <= now. */
  findDueForRenewal(): Promise<SubscriptionBundle[]>;

  /** Partially update a bundle. */
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

// ---------------------------------------------------------------------------
// SubscriptionService
// ---------------------------------------------------------------------------

/**
 * Orchestrates all subscription use-cases.
 * Pure domain service — no Express or Prisma imports.
 */
export class SubscriptionService {
  private readonly billingPolicy = new BillingPolicy();

  constructor(private readonly subscriptionRepository: ISubscriptionRepository) {}

  // -------------------------------------------------------------------------
  // createBundle
  // -------------------------------------------------------------------------

  /**
   * Creates a new subscription bundle with correct dates, price, and quota.
   */
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
      remainingMessages: maxMessages === -1 ? Number.MAX_SAFE_INTEGER : maxMessages,
      price,
      startDate,
      endDate,
      renewalDate,
      autoRenew,
      active: true,
    });
  }

  // -------------------------------------------------------------------------
  // cancelBundle
  // -------------------------------------------------------------------------

  /**
   * Cancels a bundle by recording cancelledAt and disabling auto-renew.
   * The bundle stays active until endDate — historical chat data is untouched.
   */
  async cancelBundle(bundleId: string, userId: string): Promise<SubscriptionBundle> {
    const bundle = await this.subscriptionRepository.findById(bundleId, userId);

    if (!bundle) {
      throw new AppError('Subscription bundle not found', 'SUBSCRIPTION_NOT_FOUND', 404);
    }

    // Domain policy level authorization — verify ownership
    if (bundle.userId !== userId) {
      throw new AppError('Access denied: this subscription does not belong to you', 'FORBIDDEN', 403);
    }

    if (bundle.cancelledAt !== null) {
      throw new AppError('Subscription is already cancelled', 'ALREADY_CANCELLED', 400);
    }

    return this.subscriptionRepository.update(bundleId, {
      cancelledAt: new Date(),
      autoRenew: false,
    });
  }

  // -------------------------------------------------------------------------
  // toggleAutoRenew
  // -------------------------------------------------------------------------

  /**
   * Enables or disables automatic renewal for a bundle.
   */
  async toggleAutoRenew(
    bundleId: string,
    userId: string,
    value: boolean,
  ): Promise<SubscriptionBundle> {
    const bundle = await this.subscriptionRepository.findById(bundleId, userId);

    if (!bundle) {
      throw new AppError('Subscription bundle not found', 'SUBSCRIPTION_NOT_FOUND', 404);
    }

    // Domain policy level authorization — verify ownership
    if (bundle.userId !== userId) {
      throw new AppError('Access denied: this subscription does not belong to you', 'FORBIDDEN', 403);
    }

    return this.subscriptionRepository.update(bundleId, { autoRenew: value });
  }

  // -------------------------------------------------------------------------
  // getUserBundles
  // -------------------------------------------------------------------------

  /**
   * Returns all subscription bundles (active and cancelled) for a user.
   */
  async getUserBundles(userId: string): Promise<SubscriptionBundle[]> {
    return this.subscriptionRepository.findByUserId(userId);
  }

  // -------------------------------------------------------------------------
  // processRenewals
  // -------------------------------------------------------------------------

  /**
   * Background job: loops over all bundles due for renewal and processes each.
   *
   * On payment success → reset remainingMessages, extend dates
   * On payment failure → mark active=false (preserves all data)
   */
  async processRenewals(): Promise<{ renewed: number; failed: number }> {
    const dueBundles = await this.subscriptionRepository.findDueForRenewal();

    let renewed = 0;
    let failed = 0;

    for (const bundle of dueBundles) {
      if (!this.billingPolicy.shouldRenew(bundle)) {
        continue;
      }

      const paymentSuccess = this.billingPolicy.simulatePayment();

      if (!paymentSuccess) {
        // Payment failed — deactivate but preserve all data
        await this.subscriptionRepository.update(bundle.id, { active: false });
        failed++;
        continue;
      }

      // Payment succeeded — extend period and reset quota
      const newStartDate = new Date();
      const newEndDate = this.billingPolicy.calculateEndDate(
        newStartDate,
        bundle.billingCycle,
      );
      const newRenewalDate = this.billingPolicy.calculateRenewalDate(newEndDate);
      const maxMessages = getMaxMessages(bundle.tier);

      await this.subscriptionRepository.update(bundle.id, {
        startDate: newStartDate,
        endDate: newEndDate,
        renewalDate: newRenewalDate,
        remainingMessages: maxMessages === -1 ? Number.MAX_SAFE_INTEGER : maxMessages,
        active: true,
      });

      renewed++;
    }

    return { renewed, failed };
  }
}
