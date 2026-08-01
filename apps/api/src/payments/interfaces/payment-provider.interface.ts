export interface PaymentRequest {
  orderId: string;
  amountCents: number;
  currencyCode: string;
  token: string;
}

export interface PaymentResult {
  success: boolean;
  status: 'captured' | 'failed' | 'pending';
  providerTransactionId: string;
  rawResponse?: Record<string, any>;
  errorMessage?: string;
}

export interface RefundRequest {
  paymentId: string;
  providerTransactionId: string;
  amountCents: number;
  reason?: string;
}

export interface RefundResult {
  success: boolean;
  providerRefundId: string;
  status: 'completed' | 'failed';
  rawResponse?: Record<string, any>;
  errorMessage?: string;
}

export interface PaymentProvider {
  processPayment(req: PaymentRequest): Promise<PaymentResult>;
  processRefund(req: RefundRequest): Promise<RefundResult>;
}

export const PAYMENT_PROVIDER_TOKEN = 'PAYMENT_PROVIDER_TOKEN';
