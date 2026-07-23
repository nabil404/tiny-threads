# D7 — Marketplace payments: split settlement via a payment port

A provider-agnostic **`PaymentPort`** covering: merchant onboarding + KYC; split-settlement money movement (`authorize` with `autoCapture` and a first-class `platformFee`, partial `capture`, `void`, `refund` with `refundPlatformFee`); and normalized inbound events. Webhook flow: `parseEvent` → dedupe on `providerEventId` → resolve tenant from `merchantAccount` → `withTenant` → apply the order event. Refunds/disputes can claw back the platform fee and are modeled in the [order machine (D6)](d6-order-state-machines.md), not as a status flip.

*Rejected:* funds through the platform account then payout (worse regulatory/reconciliation posture); coupling to one gateway's API (lock-in, per [D5](d5-ports-adapters.md)).

**Reference interface:**

```ts
interface Money { amount: number; currency: string }            // integer MINOR units
interface ProviderRef { provider: string; externalId: string }  // we persist this
type MerchantAccountRef = ProviderRef;
type PaymentRef = ProviderRef;

interface PaymentPort {
  createMerchantAccount(i: { tenantId: string; profile: BusinessProfile; idempotencyKey: string }): Promise<MerchantAccountRef>;
  createOnboardingSession(a: MerchantAccountRef, returnUrl: string): Promise<{ url: string; expiresAt: Date }>;
  getOnboardingStatus(a: MerchantAccountRef): Promise<'pending'|'needs_information'|'active'|'rejected'|'disabled'>;

  authorize(i: {
    merchantAccount: MerchantAccountRef; amount: Money; platformFee: Money;
    paymentMethodToken: string; orderId: string;
    autoCapture: boolean;                 // true on immediate_capture stores
    idempotencyKey: string;
  }): Promise<{ paymentRef: PaymentRef; state: 'authorized'|'captured'|'failed'; authExpiresAt?: Date }>;

  capture(i: { payment: PaymentRef; amount?: Money; idempotencyKey: string }): Promise<{ state: 'partially_captured'|'captured'; capturedTotal: Money }>; // omit amount = remaining
  void(payment: PaymentRef, idempotencyKey: string): Promise<void>;
  refund(i: { payment: PaymentRef; amount?: Money; refundPlatformFee: boolean; reason?: string; idempotencyKey: string }): Promise<{ refundRef: ProviderRef; refundedTotal: Money }>;

  parseEvent(raw: Buffer, headers: Record<string, string>): Promise<NormalizedPaymentEvent>;
}

interface NormalizedPaymentEvent {
  providerEventId: string;              // → unique(tenant_id, provider_event_id)
  type: 'payment.authorized'|'payment.captured'|'payment.refunded'
      | 'payment.dispute.opened'|'payment.dispute.won'|'payment.dispute.lost'
      | 'payout.paid'|'merchant_account.updated';
  merchantAccount: MerchantAccountRef;  // → resolve tenant, then withTenant(...)
  payment?: PaymentRef;
  occurredAt: Date;
}
```
