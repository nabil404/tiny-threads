import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
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
import { UpdateOrderStatusDto } from '../dto/update-order-status.dto';
import { RefundOrderDto } from '../dto/refund-order.dto';
import { CreateShipmentDto } from '../dto/create-shipment.dto';
import { OrderQueryDto } from '../dto/order-query.dto';
import { MerchantAdminJwtAuthGuard } from '../../merchant-admins/guards/merchant-admin-jwt-auth.guard';
import { RolesGuard } from '../../merchant-admins/guards/roles.guard';
import { Roles } from '../../merchant-admins/decorators/roles.decorator';
import { MerchantAdminAccessTokenPayload } from '../../auth-core/services/token.service';

@ApiTags('Merchant Admins Orders')
@ApiBearerAuth()
@Controller('merchant-admins/orders')
@UseGuards(MerchantAdminJwtAuthGuard, RolesGuard)
@Roles('owner', 'admin')
export class MerchantAdminsOrdersController {
  constructor(private readonly ordersService: OrdersService) {}

  @ApiOperation({
    summary: 'List merchant orders',
    description: 'Returns all orders placed in the current tenant store.',
  })
  @ApiResponse({ status: 200, description: 'List of merchant orders.' })
  @Get()
  async getMerchantOrders(@Query() query: OrderQueryDto) {
    return this.ordersService.getMerchantOrders(query);
  }

  @ApiOperation({
    summary: 'Get merchant order by ID',
    description: 'Retrieves a single order by ID for the merchant store.',
  })
  @ApiResponse({ status: 200, description: 'Order details found.' })
  @ApiResponse({ status: 404, description: 'Order not found.' })
  @Get(':id')
  async getMerchantOrderById(@Param('id') id: string) {
    return this.ordersService.getMerchantOrderById(id);
  }

  @ApiOperation({
    summary: 'Update order status',
    description:
      'Transitions order status following valid state machine rules.',
  })
  @ApiResponse({
    status: 200,
    description: 'Order status updated successfully.',
  })
  @ApiResponse({
    status: 400,
    description: 'Invalid order status transition.',
  })
  @ApiResponse({ status: 404, description: 'Order not found.' })
  @Patch(':id/status')
  async updateStatus(
    @Req() req: Request,
    @Param('id') id: string,
    @Body() dto: UpdateOrderStatusDto,
  ) {
    const actorId = (req.user as MerchantAdminAccessTokenPayload | undefined)
      ?.sub;
    return this.ordersService.transitionStatus(
      id,
      dto.status,
      'merchant_admin',
      actorId,
    );
  }

  @ApiOperation({
    summary: 'Refund order',
    description: 'Processes a partial or full refund for an order.',
  })
  @ApiResponse({ status: 200, description: 'Refund processed successfully.' })
  @ApiResponse({
    status: 400,
    description: 'Refund amount exceeds captured payment.',
  })
  @ApiResponse({ status: 404, description: 'Order or payment not found.' })
  @Post(':id/refund')
  async refundOrder(@Param('id') id: string, @Body() dto: RefundOrderDto) {
    return this.ordersService.refundOrder(id, dto);
  }

  @ApiOperation({
    summary: 'Create shipment',
    description:
      'Creates a shipment for specified order items and updates fulfillment status.',
  })
  @ApiResponse({ status: 201, description: 'Shipment created successfully.' })
  @ApiResponse({
    status: 400,
    description: 'Invalid shipment items or quantity.',
  })
  @ApiResponse({ status: 404, description: 'Order not found.' })
  @Roles('owner', 'admin', 'staff')
  @Post(':id/shipments')
  async createShipment(
    @Req() req: Request,
    @Param('id') id: string,
    @Body() dto: CreateShipmentDto,
  ) {
    const actorId = (req.user as MerchantAdminAccessTokenPayload | undefined)
      ?.sub;
    return this.ordersService.createShipment(id, dto, actorId);
  }

  @ApiOperation({
    summary: 'Cancel order',
    description:
      'Cancels order, restores product variant stock, and voids or refunds payment.',
  })
  @ApiResponse({ status: 201, description: 'Order cancelled successfully.' })
  @ApiResponse({ status: 400, description: 'Order cannot be cancelled.' })
  @ApiResponse({ status: 404, description: 'Order not found.' })
  @Roles('owner', 'admin')
  @Post(':id/cancel')
  async cancelOrder(@Req() req: Request, @Param('id') id: string) {
    const actorId = (req.user as MerchantAdminAccessTokenPayload | undefined)
      ?.sub;
    return this.ordersService.cancelOrder(id, actorId);
  }
}
