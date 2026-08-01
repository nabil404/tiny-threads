import {
  Body,
  Controller,
  Headers,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiHeader,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import type { Request } from 'express';
import { isUUID } from 'class-validator';
import { CheckoutService } from './checkout.service';
import { CheckoutDto } from './dto/checkout.dto';
import { OptionalCustomerJwtAuthGuard } from '../customers/guards/optional-customer-jwt-auth.guard';
import { CustomerAccessTokenPayload } from '../auth-core/services/token.service';
import { CodedBadRequestException } from '../common/errors/coded-exceptions';
import { ErrorCode } from '@tiny-threads/shared';

@ApiTags('checkout')
@ApiHeader({
  name: 'x-guest-session-id',
  required: false,
  description:
    'Guest session identifier (UUID) returned by GET /cart. Identifies which guest cart to check out. Ignored for authenticated customers.',
})
@Controller('checkout')
export class CheckoutController {
  constructor(private readonly checkoutService: CheckoutService) {}

  @ApiOperation({
    summary: 'Process checkout for a cart',
    description:
      "Reserves inventory, creates order and order items, processes payment, and converts the authenticated customer's (or guest session's) active cart. Cart identity is derived from the caller's own credentials, never from the request body.",
  })
  @ApiBearerAuth()
  @ApiResponse({ status: 201, description: 'Order created successfully.' })
  @ApiResponse({
    status: 400,
    description:
      'Cart empty or already converted, stock insufficient, or x-guest-session-id is not a valid UUID.',
  })
  @ApiResponse({
    status: 403,
    description: 'Guest checkout disabled for this store.',
  })
  @Post()
  @UseGuards(OptionalCustomerJwtAuthGuard)
  async checkout(
    @Req() req: Request,
    @Headers('x-guest-session-id') guestSessionId: string | undefined,
    @Body() dto: CheckoutDto,
  ) {
    const customerId = (req.user as CustomerAccessTokenPayload | undefined)
      ?.sub;
    return this.checkoutService.checkout(
      dto,
      customerId,
      this.resolveGuestSessionId(guestSessionId),
    );
  }

  // Mirrors CartsController.resolveGuestSessionId: the session id is an
  // attacker-controlled header that ends up as a cart lookup key, so it's
  // constrained to the UUID shape we hand out ourselves. A blank header is
  // treated as absent rather than rejected.
  private resolveGuestSessionId(raw: string | undefined): string | undefined {
    const sessionId = raw?.trim();
    if (!sessionId) {
      return undefined;
    }
    if (!isUUID(sessionId)) {
      throw new CodedBadRequestException(
        ErrorCode.VALIDATION_FAILED,
        'x-guest-session-id must be a valid UUID',
      );
    }
    return sessionId;
  }
}
