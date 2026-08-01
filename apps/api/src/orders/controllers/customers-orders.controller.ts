import {
  Controller,
  Get,
  Param,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import type { Request } from 'express';
import { OrdersService } from '../orders.service';
import { OrderQueryDto } from '../dto/order-query.dto';
import { CustomerJwtAuthGuard } from '../../customers/guards/customer-jwt-auth.guard';
import { CustomerAccessTokenPayload } from '../../auth-core/services/token.service';

@ApiTags('Customers Orders')
@ApiBearerAuth()
@Controller('customers/orders')
@UseGuards(CustomerJwtAuthGuard)
export class CustomersOrdersController {
  constructor(private readonly ordersService: OrdersService) {}

  @ApiOperation({
    summary: 'List customer orders',
    description: 'Returns all orders placed by the authenticated customer.',
  })
  @ApiResponse({ status: 200, description: 'List of customer orders.' })
  @Get()
  async getCustomerOrders(@Req() req: Request, @Query() query: OrderQueryDto) {
    const { sub: customerId } = req.user as CustomerAccessTokenPayload;
    return this.ordersService.getCustomerOrders(customerId, query);
  }

  @ApiOperation({
    summary: 'Get customer order by ID',
    description:
      'Retrieves a single order by ID for the authenticated customer.',
  })
  @ApiResponse({ status: 200, description: 'Order details found.' })
  @ApiResponse({ status: 404, description: 'Order not found.' })
  @Get(':id')
  async getCustomerOrderById(@Req() req: Request, @Param('id') id: string) {
    const { sub: customerId } = req.user as CustomerAccessTokenPayload;
    return this.ordersService.getCustomerOrderById(customerId, id);
  }

  @ApiOperation({
    summary: 'Cancel customer order',
    description:
      'Cancels an order in pending_payment status and restores item stock.',
  })
  @ApiResponse({ status: 200, description: 'Order cancelled successfully.' })
  @ApiResponse({
    status: 400,
    description: 'Order cannot be cancelled (e.g. status is paid/shipped).',
  })
  @ApiResponse({ status: 404, description: 'Order not found.' })
  @Post(':id/cancel')
  async cancelOrder(@Req() req: Request, @Param('id') id: string) {
    const { sub: customerId } = req.user as CustomerAccessTokenPayload;
    return this.ordersService.customerCancelOrder(customerId, id);
  }
}
