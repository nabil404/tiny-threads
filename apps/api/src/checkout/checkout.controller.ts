import { Body, Controller, Post, Req, UseGuards } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import type { Request } from 'express';
import { CheckoutService } from './checkout.service';
import { CheckoutDto } from './dto/checkout.dto';
import { OptionalCustomerJwtAuthGuard } from '../customers/guards/optional-customer-jwt-auth.guard';
import { CustomerAccessTokenPayload } from '../customers/interfaces/customer-token.interface';

@ApiTags('checkout')
@Controller('checkout')
export class CheckoutController {
  constructor(private readonly checkoutService: CheckoutService) {}

  @ApiOperation({
    summary: 'Process checkout for a cart',
    description:
      'Reserves inventory, creates order and order items, processes payment, and converts cart.',
  })
  @ApiBearerAuth()
  @ApiResponse({ status: 201, description: 'Order created successfully.' })
  @ApiResponse({
    status: 400,
    description: 'Cart empty, converted, or stock insufficient.',
  })
  @ApiResponse({
    status: 403,
    description: 'Guest checkout disabled for this store.',
  })
  @Post()
  @UseGuards(OptionalCustomerJwtAuthGuard)
  async checkout(@Req() req: Request, @Body() dto: CheckoutDto) {
    const customerId = (req.user as CustomerAccessTokenPayload | undefined)
      ?.sub;
    return this.checkoutService.checkout(dto, customerId);
  }
}
