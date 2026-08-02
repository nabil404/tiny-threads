import { SoftDeletableTenantEntityBase } from '../entities/base';

class TestSoftDeletableEntity extends SoftDeletableTenantEntityBase {}

describe('SoftDeletableTenantEntityBase', () => {
  it('instantiates correctly and inherits generateId hook and properties from TenantEntityBase', () => {
    const entity = new TestSoftDeletableEntity();
    entity.tenantId = '00000000-0000-0000-0000-000000000001';

    expect(entity.id).toBeUndefined();
    expect(entity.deletedAt).toBeUndefined();

    entity.generateId();
    expect(entity.id).toBeDefined();
    expect(typeof entity.id).toBe('string');
  });

  it('allows deletedAt to be set to a Date or null', () => {
    const entity = new TestSoftDeletableEntity();
    const now = new Date();

    entity.deletedAt = now;
    expect(entity.deletedAt).toBe(now);

    entity.deletedAt = null;
    expect(entity.deletedAt).toBeNull();
  });
});
