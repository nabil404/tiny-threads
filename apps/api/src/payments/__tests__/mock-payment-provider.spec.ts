import { MockPaymentProvider } from '../providers/mock-payment.provider';
import { PaymentPortRegistry } from '../providers/payment-port.registry';

describe('MockPaymentProvider (D7)', () => {
  let provider: MockPaymentProvider;

  beforeEach(() => {
    provider = new MockPaymentProvider();
  });

  it('authorizes payment with Money object', async () => {
    const res = await provider.authorize({
      merchantAccount: { provider: 'mock', externalId: 'acct-1' },
      amount: { amount: 2500, currency: 'USD' },
      platformFee: { amount: 100, currency: 'USD' },
      paymentMethodToken: 'tok_valid',
      orderId: 'order-123',
      autoCapture: false,
      idempotencyKey: 'idemp-1',
    });

    expect(res.state).toBe('authorized');
    expect(res.paymentRef.provider).toBe('mock');
    expect(res.authExpiresAt).toBeInstanceOf(Date);
  });

  it('authorizes and auto-captures when autoCapture is true', async () => {
    const res = await provider.authorize({
      merchantAccount: { provider: 'mock', externalId: 'acct-1' },
      amount: { amount: 2500, currency: 'USD' },
      platformFee: { amount: 100, currency: 'USD' },
      paymentMethodToken: 'tok_valid',
      orderId: 'order-123',
      autoCapture: true,
      idempotencyKey: 'idemp-1',
    });

    expect(res.state).toBe('captured');
  });

  it('returns failed state on declined token', async () => {
    const res = await provider.authorize({
      merchantAccount: { provider: 'mock', externalId: 'acct-1' },
      amount: { amount: 2500, currency: 'USD' },
      platformFee: { amount: 100, currency: 'USD' },
      paymentMethodToken: 'tok_decline',
      orderId: 'order-123',
      autoCapture: false,
      idempotencyKey: 'idemp-1',
    });

    expect(res.state).toBe('failed');
  });

  it('captures payment', async () => {
    const res = await provider.capture({
      payment: { provider: 'mock', externalId: 'tx-1' },
      amount: { amount: 1000, currency: 'USD' },
      idempotencyKey: 'idemp-cap-1',
    });

    expect(res.state).toBe('captured');
    expect(res.capturedTotal).toEqual({ amount: 1000, currency: 'USD' });
  });

  it('voids payment', async () => {
    await expect(
      provider.void({ provider: 'mock', externalId: 'tx-1' }, 'idemp-void-1'),
    ).resolves.toBeUndefined();
  });

  it('refunds payment', async () => {
    const res = await provider.refund({
      payment: { provider: 'mock', externalId: 'tx-1' },
      amount: { amount: 500, currency: 'USD' },
      refundPlatformFee: true,
      reason: 'customer_request',
      idempotencyKey: 'idemp-ref-1',
    });

    expect(res.refundRef.provider).toBe('mock');
    expect(res.refundedTotal).toEqual({ amount: 500, currency: 'USD' });
  });

  it('handles merchant account onboarding methods', async () => {
    const acct = await provider.createMerchantAccount({
      tenantId: 'tenant-1',
      profile: { name: 'Test Store' },
      idempotencyKey: 'idemp-acct-1',
    });
    expect(acct.provider).toBe('mock');
    expect(acct.externalId).toBe('acct_mock_tenant-1');

    const session = await provider.createOnboardingSession(acct, 'https://example.com/return');
    expect(session.url).toContain('mock.onboarding.local');

    const status = await provider.getOnboardingStatus(acct);
    expect(status).toBe('active');
  });

  it('parses valid signed webhook event', async () => {
    const raw = Buffer.from(
      JSON.stringify({
        id: 'evt-123',
        type: 'payment.captured',
        merchantAccountId: 'acct-1',
      })
    );
    const headers = { 'x-mock-signature': 'test-sig' };

    const event = await provider.parseEvent(raw, headers);
    expect(event.providerEventId).toBe('evt-123');
    expect(event.type).toBe('payment.captured');
    expect(event.merchantAccount.externalId).toBe('acct-1');
  });
});

describe('PaymentPortRegistry', () => {
  it('registers and retrieves payment port by provider name', () => {
    const mockProvider = new MockPaymentProvider();
    const registry = new PaymentPortRegistry(mockProvider);

    expect(registry.has('mock')).toBe(true);
    expect(registry.get('mock')).toBe(mockProvider);
    expect(registry.getByProviderName('mock')).toBe(mockProvider);
  });

  it('throws NotFoundException for unregistered provider', () => {
    const mockProvider = new MockPaymentProvider();
    const registry = new PaymentPortRegistry(mockProvider);

    expect(() => registry.get('stripe')).toThrow('Payment port not found for provider: stripe');
  });
});
