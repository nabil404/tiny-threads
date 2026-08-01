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
import {
  ApiBearerAuth,
  ApiHeader,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import type { Request, Response } from 'express';
import { randomUUID } from 'crypto';
import { resolveGuestSessionId } from '../common/utils/guest-session';
import { CartsService } from './carts.service';
import { Cart } from '../db/entities/carts.entity';
import { AddCartItemDto } from './dto/add-cart-item.dto';
import { UpdateCartItemDto } from './dto/update-cart-item.dto';
import { MergeCartDto } from './dto/merge-cart.dto';
import { CustomerJwtAuthGuard } from '../customers/guards/customer-jwt-auth.guard';
import { OptionalCustomerJwtAuthGuard } from '../customers/guards/optional-customer-jwt-auth.guard';
import { CustomerAccessTokenPayload } from '../auth-core/services/token.service';

@ApiTags('Cart')
@ApiHeader({
  name: 'x-guest-session-id',
  required: false,
  description:
    'Guest session identifier (UUID). Returned as X-Guest-Session-ID on first access. Ignored for authenticated customers.',
})
@Controller('cart')
export class CartsController {
  constructor(private readonly cartsService: CartsService) {}

  @ApiOperation({
    summary: 'Get the current cart',
    description:
      "Returns the authenticated customer's active cart, or the guest cart for the supplied session. Creates an empty cart (and a guest session id) on first access.",
  })
  @ApiResponse({ status: 200, description: 'The current active cart.' })
  @ApiResponse({
    status: 400,
    description: 'The x-guest-session-id header is not a valid UUID.',
  })
  @Get()
  @UseGuards(OptionalCustomerJwtAuthGuard)
  async getCart(
    @Req() req: Request,
    @Headers('x-guest-session-id') guestSessionId: string | undefined,
    @Res({ passthrough: true }) res: Response,
  ) {
    const customerId = this.getCustomerId(req);
    let sessionId = resolveGuestSessionId(guestSessionId);

    if (!customerId && !sessionId) {
      sessionId = randomUUID();
      res.setHeader('X-Guest-Session-ID', sessionId);
    }

    const cart = await this.cartsService.getOrCreateCart(customerId, sessionId);
    return this.formatCartResponse(cart);
  }

  @ApiOperation({
    summary: 'Add an item to the cart',
    description:
      'Adds a product variant to the cart, incrementing the quantity if the variant is already present. Creates the cart on first access.',
  })
  @ApiResponse({ status: 201, description: 'The updated cart.' })
  @ApiResponse({
    status: 400,
    description: 'Invalid body, or x-guest-session-id is not a valid UUID.',
  })
  @ApiResponse({ status: 404, description: 'Product variant not found.' })
  @Post('items')
  @UseGuards(OptionalCustomerJwtAuthGuard)
  async addItem(
    @Req() req: Request,
    @Headers('x-guest-session-id') guestSessionId: string | undefined,
    @Body() dto: AddCartItemDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const customerId = this.getCustomerId(req);
    let sessionId = resolveGuestSessionId(guestSessionId);

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

  @ApiOperation({
    summary: 'Update a cart item quantity',
    description:
      'Sets the quantity of an existing cart item. A quantity of 0 removes it. Does not create a cart.',
  })
  @ApiResponse({ status: 200, description: 'The updated cart.' })
  @ApiResponse({
    status: 400,
    description: 'Invalid body, or x-guest-session-id is not a valid UUID.',
  })
  @ApiResponse({ status: 404, description: 'Cart or cart item not found.' })
  @Patch('items/:id')
  @UseGuards(OptionalCustomerJwtAuthGuard)
  async updateItemQty(
    @Req() req: Request,
    @Headers('x-guest-session-id') guestSessionId: string | undefined,
    @Param('id') itemId: string,
    @Body() dto: UpdateCartItemDto,
  ) {
    const customerId = this.getCustomerId(req);
    const cart = await this.cartsService.getActiveCart(
      customerId,
      resolveGuestSessionId(guestSessionId),
    );
    const updatedCart = await this.cartsService.updateItemQty(
      cart.id,
      itemId,
      dto.qty,
    );
    return this.formatCartResponse(updatedCart);
  }

  @ApiOperation({
    summary: 'Remove a cart item',
    description:
      'Removes an item from the cart and returns the updated cart. Does not create a cart.',
  })
  @ApiResponse({ status: 200, description: 'The updated cart.' })
  @ApiResponse({
    status: 400,
    description: 'The x-guest-session-id header is not a valid UUID.',
  })
  @ApiResponse({ status: 404, description: 'Cart or cart item not found.' })
  @Delete('items/:id')
  @UseGuards(OptionalCustomerJwtAuthGuard)
  async removeItem(
    @Req() req: Request,
    @Headers('x-guest-session-id') guestSessionId: string | undefined,
    @Param('id') itemId: string,
  ) {
    const customerId = this.getCustomerId(req);
    const cart = await this.cartsService.getActiveCart(
      customerId,
      resolveGuestSessionId(guestSessionId),
    );
    const updatedCart = await this.cartsService.removeItem(cart.id, itemId);
    return this.formatCartResponse(updatedCart);
  }

  @ApiOperation({
    summary: 'Merge a guest cart into the customer cart',
    description:
      "Moves the items of the guest session's active cart into the authenticated customer's cart, summing quantities for duplicate variants, and marks the guest cart abandoned.",
  })
  @ApiBearerAuth()
  @ApiResponse({ status: 201, description: "The customer's merged cart." })
  @ApiResponse({ status: 400, description: 'Invalid guest session id.' })
  @ApiResponse({ status: 401, description: 'Missing or invalid access token.' })
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
