import { Test, TestingModule } from '@nestjs/testing';
import { getDataSourceToken } from '@nestjs/typeorm';
import { ClsService } from 'nestjs-cls';
import { EntityManager } from 'typeorm';
import { OrderExpiryService } from '../jobs/order-expiry.service';
import { OrderExpiryJob } from '../jobs/order-expiry.job';
import { TenantDbService } from '../../db/tenant-db.service';
import { OrdersService } from '../../orders/orders.service';
import { Tenant } from '../../db/entities/tenants.entity';
import { OrderEvent } from '../../db/entities/order-event.entity';

describe('OrderExpiryScheduler', () => {
  let service: OrderExpiryService;
  let job: OrderExpiryJob;
  let tenantRepo: { find: jest.Mock };
  let manager: {
    find: jest.Mock;
    save: jest.Mock;
    create: jest.Mock;
  };
  let tenantDb: { run: jest.Mock };
  let ordersService: { cancelOrderSideEffects: jest.Mock };
  let clsService: { run: jest.Mock; set: jest.Mock; get: jest.Mock };
  let clsStore: Record<string, unknown>;

  beforeEach(async () => {
    clsStore = {};
    tenantRepo = {
      find: jest.fn(),
    };
    const dataSource = {
      getRepository: jest.fn().mockImplementation((entity) => {
        if (entity === Tenant) return tenantRepo;
        return {};
      }),
    };
    clsService = {
      run: jest.fn().mockImplementation((cb: () => unknown) => cb()),
      set: jest.fn().mockImplementation((key: string, val: unknown) => {
        clsStore[key] = val;
      }),
      get: jest.fn().mockImplementation((key: string) => clsStore[key]),
    };
    manager = {
      find: jest.fn(),
      save: jest
        .fn()
        .mockImplementation((entityOrClass: unknown, entity?: unknown) =>
          Promise.resolve(entity ?? entityOrClass),
        ),
      create: jest
        .fn()
        .mockImplementation((_entityClass: unknown, dto: unknown) => ({
          ...(dto as object),
          id: 'event-1',
        })),
    };
    tenantDb = {
      run: jest
        .fn()
        .mockImplementation((cb: (m: EntityManager) => unknown) =>
          cb(manager as unknown as EntityManager),
        ),
    };
    ordersService = {
      cancelOrderSideEffects: jest.fn().mockResolvedValue(undefined),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        OrderExpiryService,
        OrderExpiryJob,
        { provide: getDataSourceToken(), useValue: dataSource },
        { provide: ClsService, useValue: clsService },
        { provide: TenantDbService, useValue: tenantDb },
        { provide: OrdersService, useValue: ordersService },
      ],
    }).compile();

    service = module.get<OrderExpiryService>(OrderExpiryService);
    job = module.get<OrderExpiryJob>(OrderExpiryJob);
  });

  describe('OrderExpiryJob', () => {
    it('should delegate to orderExpiryService.expireStaleOrders', async () => {
      const spy = jest
        .spyOn(service, 'expireStaleOrders')
        .mockResolvedValue(undefined);
      await job.handleExpiry();
      expect(spy).toHaveBeenCalledTimes(1);
    });
  });

  describe('OrderExpiryService', () => {
    it('should process stale orders for multiple tenants with proper CLS context', async () => {
      const tenants = [{ id: 'tenant-1' }, { id: 'tenant-2' }];
      tenantRepo.find.mockResolvedValue(tenants);

      const staleOrderTenant1 = {
        id: 'order-1',
        status: 'pending_payment',
        expiresAt: new Date(Date.now() - 1000),
      };

      const setClsKeys: string[] = [];
      clsService.set.mockImplementation((key: string, val: unknown) => {
        setClsKeys.push(`${key}:${val as string}`);
        clsStore[key] = val;
      });

      manager.find.mockImplementation(() => {
        if (clsStore['tenantId'] === 'tenant-1') {
          return Promise.resolve([staleOrderTenant1]);
        }
        return Promise.resolve([]);
      });

      await service.expireStaleOrders();

      expect(tenantRepo.find).toHaveBeenCalledTimes(1);
      expect(clsService.run).toHaveBeenCalledTimes(2);
      expect(setClsKeys).toEqual(['tenantId:tenant-1', 'tenantId:tenant-2']);
      expect(ordersService.cancelOrderSideEffects).toHaveBeenCalledWith(
        manager,
        staleOrderTenant1,
        'system',
      );
      expect(staleOrderTenant1.status).toBe('cancelled');
      expect(staleOrderTenant1.expiresAt).toBeNull();

      expect(manager.create).toHaveBeenCalledWith(OrderEvent, {
        tenantId: 'tenant-1',
        orderId: 'order-1',
        eventType: 'order_expired',
        actorType: 'system',
      });
      expect(manager.save).toHaveBeenCalledTimes(2); // Order and OrderEvent
    });

    it('should handle errors per tenant gracefully without blocking subsequent tenants', async () => {
      const tenants = [{ id: 'tenant-1' }, { id: 'tenant-2' }];
      tenantRepo.find.mockResolvedValue(tenants);

      let runCount = 0;
      tenantDb.run.mockImplementation(
        (cb: (m: EntityManager) => Promise<unknown>) => {
          runCount++;
          if (runCount === 1) {
            return Promise.reject(new Error('Database error on tenant 1'));
          }
          return cb(manager as unknown as EntityManager);
        },
      );

      manager.find.mockResolvedValue([]);

      await service.expireStaleOrders();

      expect(tenantDb.run).toHaveBeenCalledTimes(2);
    });
  });
});
