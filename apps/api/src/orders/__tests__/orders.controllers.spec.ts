import { Test, TestingModule } from '@nestjs/testing';
import { CustomersOrdersController } from '../controllers/customers-orders.controller';
import { MerchantAdminsOrdersController } from '../controllers/merchant-admins-orders.controller';
import { OrdersService } from '../orders.service';
import { Order } from '../../db/entities/order.entity';
import { OrderQueryDto } from '../dto/order-query.dto';

describe('Orders Controllers', () => {
  let customersController: CustomersOrdersController;
  let merchantController: MerchantAdminsOrdersController;
  let ordersService: {
    getCustomerOrders: jest.Mock;
    getCustomerOrderById: jest.Mock;
    customerCancelOrder: jest.Mock;
    getMerchantOrders: jest.Mock;
    getMerchantOrderById: jest.Mock;
    transitionStatus: jest.Mock;
    refundOrder: jest.Mock;
  };

  beforeEach(async () => {
    ordersService = {
      getCustomerOrders: jest.fn(),
      getCustomerOrderById: jest.fn(),
      customerCancelOrder: jest.fn(),
      getMerchantOrders: jest.fn(),
      getMerchantOrderById: jest.fn(),
      transitionStatus: jest.fn(),
      refundOrder: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [CustomersOrdersController, MerchantAdminsOrdersController],
      providers: [{ provide: OrdersService, useValue: ordersService }],
    }).compile();

    customersController = module.get<CustomersOrdersController>(
      CustomersOrdersController,
    );
    merchantController = module.get<MerchantAdminsOrdersController>(
      MerchantAdminsOrdersController,
    );
  });

  describe('CustomersOrdersController', () => {
    it('getCustomerOrders should pass customerId and query to service and return paginated object', async () => {
      const mockQuery: OrderQueryDto = { page: 1, limit: 10 };
      const expectedResult = {
        items: [{ id: 'order-1' }] as Order[],
        total: 1,
        page: 1,
        limit: 10,
      };
      ordersService.getCustomerOrders.mockResolvedValue(expectedResult);

      const req = { user: { sub: 'cust-123' } } as any;
      const result = await customersController.getCustomerOrders(
        req,
        mockQuery,
      );

      expect(ordersService.getCustomerOrders).toHaveBeenCalledWith(
        'cust-123',
        mockQuery,
      );
      expect(result).toEqual(expectedResult);
    });

    it('getCustomerOrderById should pass customerId and orderId to service', async () => {
      const mockOrder = { id: 'order-123' } as Order;
      ordersService.getCustomerOrderById.mockResolvedValue(mockOrder);

      const req = { user: { sub: 'cust-123' } } as any;
      const result = await customersController.getCustomerOrderById(
        req,
        'order-123',
      );

      expect(ordersService.getCustomerOrderById).toHaveBeenCalledWith(
        'cust-123',
        'order-123',
      );
      expect(result).toBe(mockOrder);
    });

    it('cancelOrder should pass customerId and orderId to service', async () => {
      const mockOrder = { id: 'order-123', status: 'cancelled' } as Order;
      ordersService.customerCancelOrder.mockResolvedValue(mockOrder);

      const req = { user: { sub: 'cust-123' } } as any;
      const result = await customersController.cancelOrder(req, 'order-123');

      expect(ordersService.customerCancelOrder).toHaveBeenCalledWith(
        'cust-123',
        'order-123',
      );
      expect(result).toBe(mockOrder);
    });
  });

  describe('MerchantAdminsOrdersController', () => {
    it('getMerchantOrders should pass query to service and return paginated object', async () => {
      const mockQuery: OrderQueryDto = { page: 2, limit: 20 };
      const expectedResult = {
        items: [{ id: 'order-2' }] as Order[],
        total: 10,
        page: 2,
        limit: 20,
      };
      ordersService.getMerchantOrders.mockResolvedValue(expectedResult);

      const result = await merchantController.getMerchantOrders(mockQuery);

      expect(ordersService.getMerchantOrders).toHaveBeenCalledWith(mockQuery);
      expect(result).toEqual(expectedResult);
    });

    it('getMerchantOrderById should pass orderId to service', async () => {
      const mockOrder = { id: 'order-123' } as Order;
      ordersService.getMerchantOrderById.mockResolvedValue(mockOrder);

      const result = await merchantController.getMerchantOrderById('order-123');

      expect(ordersService.getMerchantOrderById).toHaveBeenCalledWith(
        'order-123',
      );
      expect(result).toBe(mockOrder);
    });

    it('updateStatus should pass orderId, status, actorType, and actorId to service', async () => {
      const mockOrder = { id: 'order-123', status: 'shipped' } as Order;
      ordersService.transitionStatus.mockResolvedValue(mockOrder);

      const req = { user: { sub: 'admin-456' } } as any;
      const result = await merchantController.updateStatus(req, 'order-123', {
        status: 'shipped',
      });

      expect(ordersService.transitionStatus).toHaveBeenCalledWith(
        'order-123',
        'shipped',
        'merchant_admin',
        'admin-456',
      );
      expect(result).toBe(mockOrder);
    });

    it('refundOrder should pass orderId and dto to service', async () => {
      const mockRefund = { id: 'ref-1', amountCents: 500 } as any;
      ordersService.refundOrder.mockResolvedValue(mockRefund);

      const dto = { amountCents: 500, reason: 'Defective' };
      const result = await merchantController.refundOrder('order-123', dto);

      expect(ordersService.refundOrder).toHaveBeenCalledWith('order-123', dto);
      expect(result).toBe(mockRefund);
    });
  });
});
