import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Headers,
  Res,
  UseGuards,
  Req,
} from '@nestjs/common';
import type { Response } from 'express';
import { CartsService } from './carts.service';
import { AddCartItemDto } from './dto/add-cart-item.dto';
import { UpdateCartItemDto } from './dto/update-cart-item.dto';
import { MergeCartDto } from './dto/merge-cart.dto';
import { CustomerJwtAuthGuard } from '../customers/guards/customer-jwt-auth.guard';
import { OptionalCustomerJwtAuthGuard } from '../customers/guards/optional-customer-jwt-auth.guard';
import { randomUUID } from 'crypto';

@Controller('cart')
export class CartsController {
  constructor(private readonly cartsService: CartsService) {}

  @Get()
  @UseGuards(OptionalCustomerJwtAuthGuard)
  async getCart(
    @Req() req: any,
    @Headers('x-guest-session-id') guestSessionId: string | undefined,
    @Res({ passthrough: true }) res: Response,
  ) {
    const customerId = req.user?.id;
    let sessionId = guestSessionId;

    if (!customerId && !sessionId) {
      sessionId = randomUUID();
      res.setHeader('X-Guest-Session-ID', sessionId);
    }

    const cart = await this.cartsService.getOrCreateCart(customerId, sessionId);
    return this.formatCartResponse(cart);
  }

  @Post('items')
  @UseGuards(OptionalCustomerJwtAuthGuard)
  async addItem(
    @Req() req: any,
    @Headers('x-guest-session-id') guestSessionId: string | undefined,
    @Body() dto: AddCartItemDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const customerId = req.user?.id;
    let sessionId = guestSessionId;

    if (!customerId && !sessionId) {
      sessionId = randomUUID();
      res.setHeader('X-Guest-Session-ID', sessionId);
    }

    const cart = await this.cartsService.getOrCreateCart(customerId, sessionId);
    const updatedCart = await this.cartsService.addItem(cart.id, dto.variantId, dto.qty);
    return this.formatCartResponse(updatedCart);
  }

  @Patch('items/:id')
  @UseGuards(OptionalCustomerJwtAuthGuard)
  async updateItemQty(
    @Req() req: any,
    @Headers('x-guest-session-id') guestSessionId: string | undefined,
    @Param('id') itemId: string,
    @Body() dto: UpdateCartItemDto,
  ) {
    const customerId = req.user?.id;
    const cart = await this.cartsService.getOrCreateCart(customerId, guestSessionId);
    const updatedCart = await this.cartsService.updateItemQty(cart.id, itemId, dto.qty);
    return this.formatCartResponse(updatedCart);
  }

  @Delete('items/:id')
  @UseGuards(OptionalCustomerJwtAuthGuard)
  async removeItem(
    @Req() req: any,
    @Headers('x-guest-session-id') guestSessionId: string | undefined,
    @Param('id') itemId: string,
  ) {
    const customerId = req.user?.id;
    const cart = await this.cartsService.getOrCreateCart(customerId, guestSessionId);
    const updatedCart = await this.cartsService.removeItem(cart.id, itemId);
    return this.formatCartResponse(updatedCart);
  }

  @Post('merge')
  @UseGuards(CustomerJwtAuthGuard)
  async mergeCart(@Req() req: any, @Body() dto: MergeCartDto) {
    const customerId = req.user.id;
    const cart = await this.cartsService.mergeCart(customerId, dto.guestSessionId);
    return this.formatCartResponse(cart);
  }

  private formatCartResponse(cart: any) {
    const items = (cart.items || []).map((item: any) => {
      const priceCents = item.variant?.priceCents || 0;
      return {
        id: item.id,
        variantId: item.variantId,
        productName: item.variant?.product?.name || '',
        variantName: item.variant?.name || '',
        priceCents,
        qty: item.qty,
        lineTotalCents: priceCents * item.qty,
      };
    });

    const itemCount = items.reduce((acc: number, item: any) => acc + item.qty, 0);
    const subtotalCents = items.reduce((acc: number, item: any) => acc + item.lineTotalCents, 0);

    return {
      id: cart.id,
      status: cart.status,
      itemCount,
      subtotalCents,
      items,
    };
  }
}
