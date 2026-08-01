export type OrderLifecycleStatus = 'pending' | 'confirmed' | 'completed' | 'cancelled';
export type OrderPaymentStatus =
  | 'pending'
  | 'authorized'
  | 'partially_captured'
  | 'paid'
  | 'partially_refunded'
  | 'refunded'
  | 'voided'
  | 'failed'
  | 'disputed'
  | 'charged_back';
export type OrderFulfillmentStatus = 'unfulfilled' | 'partially_fulfilled' | 'fulfilled';

export type StateMachineResult<S> =
  | { success: true; nextState: S }
  | { success: false; errorCode: string; message: string };

export function transitionLifecycle(
  current: OrderLifecycleStatus,
  event: 'PAYMENT_SUCCESS' | 'CANCEL' | 'FULFILLMENT_COMPLETE'
): StateMachineResult<OrderLifecycleStatus> {
  if (current === 'pending' && event === 'PAYMENT_SUCCESS') {
    return { success: true, nextState: 'confirmed' };
  }
  if (current === 'pending' && event === 'CANCEL') {
    return { success: true, nextState: 'cancelled' };
  }
  if (current === 'confirmed' && event === 'CANCEL') {
    return { success: true, nextState: 'cancelled' };
  }
  if (current === 'confirmed' && event === 'FULFILLMENT_COMPLETE') {
    return { success: true, nextState: 'completed' };
  }
  return {
    success: false,
    errorCode: 'INVALID_LIFECYCLE_TRANSITION',
    message: `Cannot transition lifecycle from ${current} via ${event}`,
  };
}

export function transitionPayment(
  current: OrderPaymentStatus,
  event: 'AUTHORIZE' | 'CAPTURE' | 'PARTIAL_CAPTURE' | 'VOID' | 'REFUND' | 'PARTIAL_REFUND' | 'DISPUTE_OPENED'
): StateMachineResult<OrderPaymentStatus> {
  if (current === 'pending' && event === 'AUTHORIZE') {
    return { success: true, nextState: 'authorized' };
  }
  if (current === 'pending' && event === 'CAPTURE') {
    return { success: true, nextState: 'paid' };
  }
  if (current === 'authorized' && event === 'PARTIAL_CAPTURE') {
    return { success: true, nextState: 'partially_captured' };
  }
  if ((current === 'authorized' || current === 'partially_captured') && event === 'CAPTURE') {
    return { success: true, nextState: 'paid' };
  }
  if (current === 'authorized' && event === 'VOID') {
    return { success: true, nextState: 'voided' };
  }
  if (current === 'paid' && event === 'PARTIAL_REFUND') {
    return { success: true, nextState: 'partially_refunded' };
  }
  if ((current === 'paid' || current === 'partially_refunded') && event === 'REFUND') {
    return { success: true, nextState: 'refunded' };
  }
  if ((current === 'paid' || current === 'partially_refunded') && event === 'DISPUTE_OPENED') {
    return { success: true, nextState: 'disputed' };
  }
  return {
    success: false,
    errorCode: 'INVALID_PAYMENT_TRANSITION',
    message: `Cannot transition payment status from ${current} via ${event}`,
  };
}
