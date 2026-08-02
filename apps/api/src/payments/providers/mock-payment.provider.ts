import { Injectable } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { Money } from '../domain/money';
import {
  MerchantAccountRef,
  NormalizedPaymentEvent,
  PaymentPort,
  PaymentRef,
  ProviderRef,
} from '../interfaces/payment-port.interface';
import {
  PaymentProvider,
  PaymentRequest,
  PaymentResult,
  RefundRequest,
  RefundResult,
} from '../interfaces/payment-provider.interface';

@Injectable()
export class MockPaymentProvider implements PaymentPort, PaymentProvider {
  readonly providerName = 'mock';

  createMerchantAccount(i: {
    tenantId: string;
    profile: Record<string, any>;
    idempotencyKey: string;
  }): Promise<MerchantAccountRef> {
    void i.idempotencyKey;
    const externalId =
      (i.profile && (i.profile.externalId as string)) ||
      `acct_mock_${i.tenantId}`;
    return Promise.resolve({ provider: this.providerName, externalId });
  }

  createOnboardingSession(
    account: MerchantAccountRef,
    returnUrl: string,
  ): Promise<{ url: string; expiresAt: Date }> {
    void returnUrl;
    return Promise.resolve({
      url: `https://mock.onboarding.local/${account.externalId}`,
      expiresAt: new Date(Date.now() + 3600 * 1000),
    });
  }

  getOnboardingStatus(
    account: MerchantAccountRef,
  ): Promise<
    'pending' | 'needs_information' | 'active' | 'rejected' | 'disabled'
  > {
    void account;
    return Promise.resolve('active');
  }

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
  }> {
    void i.merchantAccount;
    void i.amount;
    void i.platformFee;
    void i.orderId;
    void i.idempotencyKey;
    const uuid = randomUUID();

    if (
      i.paymentMethodToken === 'mock_decline' ||
      i.paymentMethodToken === 'tok_decline'
    ) {
      return Promise.resolve({
        paymentRef: {
          provider: this.providerName,
          externalId: `mock_tx_failed_${uuid}`,
        },
        state: 'failed',
      });
    }

    if (i.autoCapture) {
      return Promise.resolve({
        paymentRef: {
          provider: this.providerName,
          externalId: `mock_tx_${uuid}`,
        },
        state: 'captured',
      });
    }

    return Promise.resolve({
      paymentRef: {
        provider: this.providerName,
        externalId: `mock_tx_${uuid}`,
      },
      state: 'authorized',
      authExpiresAt: new Date(Date.now() + 7 * 86400 * 1000),
    });
  }

  capture(i: {
    payment: PaymentRef;
    amount?: Money;
    idempotencyKey: string;
  }): Promise<{
    state: 'partially_captured' | 'captured';
    capturedTotal: Money;
  }> {
    void i.payment;
    void i.idempotencyKey;
    const capturedTotal = i.amount ?? { amount: 0, currency: 'USD' };
    return Promise.resolve({
      state: 'captured',
      capturedTotal,
    });
  }

  void(payment: PaymentRef, idempotencyKey: string): Promise<void> {
    void payment;
    void idempotencyKey;
    return Promise.resolve();
  }

  refund(i: {
    payment: PaymentRef;
    amount?: Money;
    refundPlatformFee: boolean;
    reason?: string;
    idempotencyKey: string;
  }): Promise<{ refundRef: ProviderRef; refundedTotal: Money }> {
    void i.payment;
    void i.refundPlatformFee;
    void i.reason;
    void i.idempotencyKey;
    const uuid = randomUUID();
    const refundedTotal = i.amount ?? { amount: 0, currency: 'USD' };
    return Promise.resolve({
      refundRef: {
        provider: this.providerName,
        externalId: `mock_ref_${uuid}`,
      },
      refundedTotal,
    });
  }

  parseEvent(
    raw: Buffer,
    headers: Record<string, string>,
  ): Promise<NormalizedPaymentEvent> {
    void headers;
    const body = JSON.parse(raw.toString('utf-8')) as {
      id?: string;
      providerEventId?: string;
      type?: NormalizedPaymentEvent['type'];
      merchantAccountId?: string;
      merchantAccount?: { externalId?: string };
      paymentId?: string;
      payment?: { externalId?: string };
      amount?: Money;
      occurredAt?: string;
    };
    const paymentId = body.paymentId || body.payment?.externalId;
    return Promise.resolve({
      providerEventId: body.id || body.providerEventId || `evt_${randomUUID()}`,
      type: body.type ?? 'payment.captured',
      merchantAccount: {
        provider: this.providerName,
        externalId:
          body.merchantAccountId ||
          body.merchantAccount?.externalId ||
          'acct-1',
      },
      payment: paymentId
        ? {
            provider: this.providerName,
            externalId: paymentId,
          }
        : undefined,
      amount: body.amount,
      occurredAt: body.occurredAt ? new Date(body.occurredAt) : new Date(),
    });
  }

  // Legacy PaymentProvider methods
  processPayment(req: PaymentRequest): Promise<PaymentResult> {
    const uuid = randomUUID();

    if (req.token === 'mock_decline') {
      return Promise.resolve({
        success: false,
        status: 'failed',
        providerTransactionId: `mock_tx_failed_${uuid}`,
        errorMessage: 'Card declined',
      });
    }

    if (req.token === 'mock_deferred') {
      return Promise.resolve({
        success: true,
        status: 'pending',
        providerTransactionId: `mock_tx_def_${uuid}`,
      });
    }

    return Promise.resolve({
      success: true,
      status: 'captured',
      providerTransactionId: `mock_tx_${uuid}`,
    });
  }

  processRefund(req: RefundRequest): Promise<RefundResult> {
    void req;
    const uuid = randomUUID();
    return Promise.resolve({
      success: true,
      providerRefundId: `mock_ref_${uuid}`,
      status: 'completed',
    });
  }
}
