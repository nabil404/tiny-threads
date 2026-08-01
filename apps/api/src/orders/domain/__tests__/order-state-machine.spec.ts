import { transitionLifecycle, transitionPayment } from '../order-state-machine';

describe('Order State Machine', () => {
  describe('transitionLifecycle', () => {
    it('allows valid pending -> confirmed transition', () => {
      const res = transitionLifecycle('pending', 'PAYMENT_SUCCESS');
      expect(res).toEqual({ success: true, nextState: 'confirmed' });
    });

    it('allows pending -> cancelled transition', () => {
      const res = transitionLifecycle('pending', 'CANCEL');
      expect(res).toEqual({ success: true, nextState: 'cancelled' });
    });

    it('allows confirmed -> cancelled transition', () => {
      const res = transitionLifecycle('confirmed', 'CANCEL');
      expect(res).toEqual({ success: true, nextState: 'cancelled' });
    });

    it('allows confirmed -> completed transition', () => {
      const res = transitionLifecycle('confirmed', 'FULFILLMENT_COMPLETE');
      expect(res).toEqual({ success: true, nextState: 'completed' });
    });

    it('rejects invalid confirmed -> pending transition', () => {
      const res = transitionLifecycle('confirmed', 'PAYMENT_SUCCESS');
      expect(res.success).toBe(false);
      if (!res.success) {
        expect(res.errorCode).toBe('INVALID_LIFECYCLE_TRANSITION');
      }
    });

    it('rejects invalid completed -> cancelled transition', () => {
      const res = transitionLifecycle('completed', 'CANCEL');
      expect(res.success).toBe(false);
      if (!res.success) {
        expect(res.errorCode).toBe('INVALID_LIFECYCLE_TRANSITION');
      }
    });
  });

  describe('transitionPayment', () => {
    it('allows pending -> authorized transition', () => {
      const res = transitionPayment('pending', 'AUTHORIZE');
      expect(res).toEqual({ success: true, nextState: 'authorized' });
    });

    it('allows pending -> paid transition', () => {
      const res = transitionPayment('pending', 'CAPTURE');
      expect(res).toEqual({ success: true, nextState: 'paid' });
    });

    it('allows authorized -> partially_captured transition', () => {
      const res = transitionPayment('authorized', 'PARTIAL_CAPTURE');
      expect(res).toEqual({ success: true, nextState: 'partially_captured' });
    });

    it('allows authorized -> paid transition', () => {
      const res = transitionPayment('authorized', 'CAPTURE');
      expect(res).toEqual({ success: true, nextState: 'paid' });
    });

    it('allows partially_captured -> paid transition', () => {
      const res = transitionPayment('partially_captured', 'CAPTURE');
      expect(res).toEqual({ success: true, nextState: 'paid' });
    });

    it('allows authorized -> voided transition', () => {
      const res = transitionPayment('authorized', 'VOID');
      expect(res).toEqual({ success: true, nextState: 'voided' });
    });

    it('allows paid -> partially_refunded transition', () => {
      const res = transitionPayment('paid', 'PARTIAL_REFUND');
      expect(res).toEqual({ success: true, nextState: 'partially_refunded' });
    });

    it('allows paid -> refunded transition', () => {
      const res = transitionPayment('paid', 'REFUND');
      expect(res).toEqual({ success: true, nextState: 'refunded' });
    });

    it('allows partially_refunded -> refunded transition', () => {
      const res = transitionPayment('partially_refunded', 'REFUND');
      expect(res).toEqual({ success: true, nextState: 'refunded' });
    });

    it('allows paid -> disputed transition', () => {
      const res = transitionPayment('paid', 'DISPUTE_OPENED');
      expect(res).toEqual({ success: true, nextState: 'disputed' });
    });

    it('allows partially_refunded -> disputed transition', () => {
      const res = transitionPayment('partially_refunded', 'DISPUTE_OPENED');
      expect(res).toEqual({ success: true, nextState: 'disputed' });
    });

    it('rejects invalid transitions', () => {
      const res = transitionPayment('pending', 'VOID');
      expect(res.success).toBe(false);
      if (!res.success) {
        expect(res.errorCode).toBe('INVALID_PAYMENT_TRANSITION');
      }
    });
  });
});
