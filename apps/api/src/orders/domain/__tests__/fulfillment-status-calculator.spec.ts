import { deriveFulfillmentStatus } from '../fulfillment-status-calculator';

describe('deriveFulfillmentStatus', () => {
  const items = [{ orderItemId: 'item-1', orderedQty: 5 }];

  it('returns unfulfilled when no ordered items exist', () => {
    expect(deriveFulfillmentStatus([], [])).toBe('unfulfilled');
  });

  it('returns unfulfilled when no shipments exist', () => {
    expect(deriveFulfillmentStatus(items, [])).toBe('unfulfilled');
  });

  it('returns partially_fulfilled when total shipped < ordered', () => {
    const shipments = [{ items: [{ orderItemId: 'item-1', quantity: 2 }] }];
    expect(deriveFulfillmentStatus(items, shipments)).toBe('partially_fulfilled');
  });

  it('returns fulfilled when total shipped == ordered', () => {
    const shipments = [{ items: [{ orderItemId: 'item-1', quantity: 5 }] }];
    expect(deriveFulfillmentStatus(items, shipments)).toBe('fulfilled');
  });

  it('handles multiple items and multiple shipments correctly', () => {
    const multiItems = [
      { orderItemId: 'item-1', orderedQty: 3 },
      { orderItemId: 'item-2', orderedQty: 2 },
    ];
    const shipment1 = { items: [{ orderItemId: 'item-1', quantity: 3 }] };
    expect(deriveFulfillmentStatus(multiItems, [shipment1])).toBe('partially_fulfilled');

    const shipment2 = { items: [{ orderItemId: 'item-2', quantity: 2 }] };
    expect(deriveFulfillmentStatus(multiItems, [shipment1, shipment2])).toBe('fulfilled');
  });

  it('caps shipped quantity at ordered quantity per item', () => {
    const multiItems = [
      { orderItemId: 'item-1', orderedQty: 2 },
      { orderItemId: 'item-2', orderedQty: 2 },
    ];
    // item-1 shipped 10 (over-shipped), item-2 shipped 0
    const shipments = [{ items: [{ orderItemId: 'item-1', quantity: 10 }] }];
    // totalShipped should cap item-1 at 2, so totalShipped = 2, totalOrdered = 4 -> partially_fulfilled
    expect(deriveFulfillmentStatus(multiItems, shipments)).toBe('partially_fulfilled');
  });
});
