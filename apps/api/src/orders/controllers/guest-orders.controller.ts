import { Controller, Get, Param, Query } from '@nestjs/common';
import { ApiOperation, ApiQuery, ApiResponse, ApiTags } from '@nestjs/swagger';
import { OrdersService } from '../orders.service';

@ApiTags('Guest Orders')
@Controller('guest/orders')
export class GuestOrdersController {
  constructor(private readonly ordersService: OrdersService) {}

  @ApiOperation({
    summary: 'Get guest order by ID and token',
    description:
      'Retrieves order details for a guest using order ID and the guest access token returned at checkout.',
  })
  @ApiQuery({
    name: 'token',
    required: true,
    description: 'Secret guest access token issued during checkout',
  })
  @ApiResponse({ status: 200, description: 'Order details found.' })
  @ApiResponse({
    status: 404,
    description: 'Order not found or invalid token.',
  })
  @Get(':id')
  async getGuestOrder(
    @Param('id') id: string,
    @Query('token') token: string,
  ) {
    return this.ordersService.getGuestOrder(id, token);
  }
}
