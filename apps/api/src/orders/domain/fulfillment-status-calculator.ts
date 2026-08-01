import { OrderFulfillmentStatus } from './order-state-machine';

export interface OrderLineItemSummary {
  orderItemId: string;
  orderedQty: number;
}

export interface ShipmentSummary {
  items: Array<{ orderItemId: string; quantity: number }>;
}

export function deriveFulfillmentStatus(
  orderedItems: OrderLineItemSummary[],
  shipments: ShipmentSummary[]
): OrderFulfillmentStatus {
  if (!orderedItems.length) return 'unfulfilled';

  const shippedMap = new Map<string, number>();
  for (const s of shipments) {
    for (const item of s.items) {
      const cur = shippedMap.get(item.orderItemId) ?? 0;
      shippedMap.set(item.orderItemId, cur + item.quantity);
    }
  }

  let totalOrdered = 0;
  let totalShipped = 0;

  for (const item of orderedItems) {
    totalOrdered += item.orderedQty;
    const shippedForLine = shippedMap.get(item.orderItemId) ?? 0;
    totalShipped += Math.min(shippedForLine, item.orderedQty);
  }

  if (totalShipped === 0) return 'unfulfilled';
  if (totalShipped >= totalOrdered) return 'fulfilled';
  return 'partially_fulfilled';
}
