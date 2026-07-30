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
import type { Request, Response } from 'express';
import { randomUUID } from 'crypto';
import { CartsService } from './carts.service';
import { Cart } from '../db/entities/carts.entity';
import { AddCartItemDto } from './dto/add-cart-item.dto';
import { UpdateCartItemDto } from './dto/update-cart-item.dto';
import { MergeCartDto } from './dto/merge-cart.dto';
import { CustomerJwtAuthGuard } from '../customers/guards/customer-jwt-auth.guard';
import { OptionalCustomerJwtAuthGuard } from '../customers/guards/optional-customer-jwt-auth.guard';
import { CustomerAccessTokenPayload } from '../auth-core/services/token.service';

@Controller('cart')
export class CartsController {
  constructor(private readonly cartsService: CartsService) {}

  @Get()
  @UseGuards(OptionalCustomerJwtAuthGuard)
  async getCart(
    @Req() req: Request,
    @Headers('x-guest-session-id') guestSessionId: string | undefined,
    @Res({ passthrough: true }) res: Response,
  ) {
    const customerId = this.getCustomerId(req);
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
    @Req() req: Request,
    @Headers('x-guest-session-id') guestSessionId: string | undefined,
    @Body() dto: AddCartItemDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const customerId = this.getCustomerId(req);
    let sessionId = guestSessionId;

    if (!customerId && !sessionId) {
      sessionId = randomUUID();
      res.setHeader('X-Guest-Session-ID', sessionId);
    }

    const cart = await this.cartsService.getOrCreateCart(customerId, sessionId);
    const updatedCart = await this.cartsService.addItem(
      cart.id,
      dto.variantId,
      dto.qty,
    );
    return this.formatCartResponse(updatedCart);
  }

  @Patch('items/:id')
  @UseGuards(OptionalCustomerJwtAuthGuard)
  async updateItemQty(
    @Req() req: Request,
    @Headers('x-guest-session-id') guestSessionId: string | undefined,
    @Param('id') itemId: string,
    @Body() dto: UpdateCartItemDto,
  ) {
    const customerId = this.getCustomerId(req);
    const cart = await this.cartsService.getOrCreateCart(
      customerId,
      guestSessionId,
    );
    const updatedCart = await this.cartsService.updateItemQty(
      cart.id,
      itemId,
      dto.qty,
    );
    return this.formatCartResponse(updatedCart);
  }

  @Delete('items/:id')
  @UseGuards(OptionalCustomerJwtAuthGuard)
  async removeItem(
    @Req() req: Request,
    @Headers('x-guest-session-id') guestSessionId: string | undefined,
    @Param('id') itemId: string,
  ) {
    const customerId = this.getCustomerId(req);
    const cart = await this.cartsService.getOrCreateCart(
      customerId,
      guestSessionId,
    );
    const updatedCart = await this.cartsService.removeItem(cart.id, itemId);
    return this.formatCartResponse(updatedCart);
  }

  @Post('merge')
  @UseGuards(CustomerJwtAuthGuard)
  async mergeCart(@Req() req: Request, @Body() dto: MergeCartDto) {
    const { sub: customerId } = req.user as CustomerAccessTokenPayload;
    const cart = await this.cartsService.mergeCart(
      customerId,
      dto.guestSessionId,
    );
    return this.formatCartResponse(cart);
  }

  // OptionalCustomerJwtAuthGuard leaves req.user undefined for guest
  // requests (no/invalid token) and populated for authenticated ones — the
  // JWT payload's customer id lives in `sub`, not `id`.
  private getCustomerId(req: Request): string | undefined {
    return (req.user as CustomerAccessTokenPayload | undefined)?.sub;
  }

  private formatCartResponse(cart: Cart) {
    const items = (cart.items ?? []).map((item) => {
      const priceCents = item.variant?.priceCents ?? 0;
      return {
        id: item.id,
        variantId: item.variantId,
        productName: item.variant?.product?.title ?? '',
        variantName: item.variant?.sku ?? '',
        priceCents,
        qty: item.qty,
        lineTotalCents: priceCents * item.qty,
      };
    });

    const itemCount = items.reduce((acc, item) => acc + item.qty, 0);
    const subtotalCents = items.reduce(
      (acc, item) => acc + item.lineTotalCents,
      0,
    );

    return {
      id: cart.id,
      status: cart.status,
      itemCount,
      subtotalCents,
      items,
    };
  }
}
