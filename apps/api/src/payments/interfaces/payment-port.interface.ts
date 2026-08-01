import { Money } from '../domain/money';

export interface ProviderRef {
  provider: string;
  externalId: string;
}

export type MerchantAccountRef = ProviderRef;
export type PaymentRef = ProviderRef;

export interface NormalizedPaymentEvent {
  providerEventId: string;
  type:
    | 'payment.authorized'
    | 'payment.captured'
    | 'payment.refunded'
    | 'payment.dispute.opened'
    | 'payment.dispute.won'
    | 'payment.dispute.lost'
    | 'payout.paid'
    | 'merchant_account.updated';
  merchantAccount: MerchantAccountRef;
  payment?: PaymentRef;
  amount?: Money;
  occurredAt: Date;
}

export interface PaymentPort {
  readonly providerName: string;

  createMerchantAccount(i: {
    tenantId: string;
    profile: Record<string, any>;
    idempotencyKey: string;
  }): Promise<MerchantAccountRef>;

  createOnboardingSession(
    account: MerchantAccountRef,
    returnUrl: string,
  ): Promise<{ url: string; expiresAt: Date }>;

  getOnboardingStatus(
    account: MerchantAccountRef,
  ): Promise<
    'pending' | 'needs_information' | 'active' | 'rejected' | 'disabled'
  >;

  authorize(i: {
    merchantAccount: MerchantAccountRef;
    amount: Money;
    platformFee: Money;
    paymentMethodToken: string;
    orderId: string;
    autoCapture: boolean;
    idempotencyKey: string;
  }): Promise<{
    paymentRef: PaymentRef;
    state: 'authorized' | 'captured' | 'failed';
    authExpiresAt?: Date;
  }>;

  capture(i: {
    payment: PaymentRef;
    amount?: Money;
    idempotencyKey: string;
  }): Promise<{
    state: 'partially_captured' | 'captured';
    capturedTotal: Money;
  }>;

  void(payment: PaymentRef, idempotencyKey: string): Promise<void>;

  refund(i: {
    payment: PaymentRef;
    amount?: Money;
    refundPlatformFee: boolean;
    reason?: string;
    idempotencyKey: string;
  }): Promise<{ refundRef: ProviderRef; refundedTotal: Money }>;

  parseEvent(
    raw: Buffer,
    headers: Record<string, string>,
  ): Promise<NormalizedPaymentEvent>;
}

export const PAYMENT_PORT_REGISTRY_TOKEN = 'PAYMENT_PORT_REGISTRY_TOKEN';
