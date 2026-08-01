import { Injectable } from '@nestjs/common';
import { randomUUID } from 'crypto';
import {
  PaymentProvider,
  PaymentRequest,
  PaymentResult,
  RefundRequest,
  RefundResult,
} from '../interfaces/payment-provider.interface';

@Injectable()
export class MockPaymentProvider implements PaymentProvider {
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
