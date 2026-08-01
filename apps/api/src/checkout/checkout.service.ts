import { Injectable } from '@nestjs/common';
import * as crypto from 'crypto';
import { ClsService } from 'nestjs-cls';
import { ErrorCode } from '@tiny-threads/shared';
import { TenantDbService } from '../db/tenant-db.service';
import { TenantSettingsService } from '../tenant-settings/tenant-settings.service';
import { PaymentsService } from '../payments/payments.service';
import { CheckoutDto } from './dto/checkout.dto';
import { Cart } from '../db/entities/carts.entity';
import { Product } from '../db/entities/products.entity';
import { ProductVariant } from '../db/entities/product-variants.entity';
import { Order } from '../db/entities/order.entity';
import { OrderItem } from '../db/entities/order-item.entity';
import { OrderEvent } from '../db/entities/order-event.entity';
import {
  CodedBadRequestException,
  CodedForbiddenException,
} from '../common/errors/coded-exceptions';

@Injectable()
export class CheckoutService {
  constructor(
    private readonly tenantDb: TenantDbService,
    private readonly tenantSettingsService: TenantSettingsService,
    private readonly paymentsService: PaymentsService,
    private readonly cls: ClsService,
  ) {}

  async checkout(
    dto: CheckoutDto,
    customerId?: string,
  ): Promise<{ order: Order; guestAccessToken: string | null }> {
    const settings = await this.tenantSettingsService.getSettings();

    if (!customerId && !settings.allowGuestCheckout) {
      throw new CodedForbiddenException(
        ErrorCode.GUEST_CHECKOUT_DISABLED,
        'Guest checkout is disabled for this store',
      );
    }

    return this.tenantDb.run(async (manager) => {
      const tenantId = this.cls.get<string>('tenantId');

      const cart = await manager.findOne(Cart, {
        where: { id: dto.cartId },
        relations: { items: true },
      });

      if (
        !cart ||
        !cart.items ||
        cart.items.length === 0 ||
        cart.status === 'converted'
      ) {
        throw new CodedBadRequestException(
          ErrorCode.CART_EMPTY,
          'Cart is empty or already converted',
        );
      }

      const itemsWithVariants: { variant: ProductVariant; quantity: number }[] =
        [];

      const sortedItems = [...cart.items].sort((a, b) =>
        a.variantId.localeCompare(b.variantId),
      );

      for (const item of sortedItems) {
        const itemQty = item.qty;
        const variant = await manager.findOne(ProductVariant, {
          where: { id: item.variantId },
          lock: { mode: 'pessimistic_write' },
        });

        if (!variant || variant.stock < itemQty) {
          throw new CodedBadRequestException(
            ErrorCode.INSUFFICIENT_STOCK,
            `Insufficient stock for product variant ${item.variantId}`,
          );
        }

        const product = await manager.findOne(Product, {
          where: { id: variant.productId },
        });
        if (product) {
          variant.product = product;
        }

        variant.stock -= itemQty;
        await manager.save(ProductVariant, variant);

        itemsWithVariants.push({ variant, quantity: itemQty });
      }

      let rawGuestToken: string | undefined;
      let guestTokenHash: string | undefined;

      if (!customerId) {
        rawGuestToken = crypto.randomBytes(32).toString('hex');
        guestTokenHash = crypto
          .createHash('sha256')
          .update(rawGuestToken)
          .digest('hex');
      }

      let totalCents = 0;
      for (const { variant, quantity } of itemsWithVariants) {
        totalCents += variant.priceCents * quantity;
      }

      const effectiveTenantId = tenantId || cart.tenantId;

      const order = manager.create(Order, {
        tenantId: effectiveTenantId,
        customerId: customerId ?? undefined,
        customerEmail: dto.customerEmail,
        status: 'pending_payment',
        paymentStatus: 'pending',
        currencyCode: 'USD',
        totalCents,
        shippingAddress: dto.shippingAddress,
        billingAddress: dto.billingAddress ?? dto.shippingAddress,
        guestAccessTokenHash: guestTokenHash ?? undefined,
      });

      const savedOrder = await manager.save(Order, order);

      const orderItems: OrderItem[] = [];
      for (const { variant, quantity } of itemsWithVariants) {
        const totalPriceCents = variant.priceCents * quantity;
        const orderItem = manager.create(OrderItem, {
          tenantId: effectiveTenantId,
          orderId: savedOrder.id,
          productId: variant.productId,
          variantId: variant.id,
          productName: variant.product?.title || '',
          variantName: variant.sku,
          sku: variant.sku,
          unitPriceCents: variant.priceCents,
          quantity,
          totalPriceCents,
        });
        orderItems.push(orderItem);
      }

      await manager.save(OrderItem, orderItems);
      savedOrder.items = orderItems;

      const createdEvent = manager.create(OrderEvent, {
        tenantId: effectiveTenantId,
        orderId: savedOrder.id,
        eventType: 'created',
        actorType: customerId ? 'customer' : 'guest',
        actorId: customerId ?? undefined,
      });
      await manager.save(OrderEvent, createdEvent);

      const paymentToken = dto.paymentToken || 'mock_success';
      const paymentResult = await this.paymentsService.processOrderPayment(
        savedOrder,
        paymentToken,
        settings.platformFeePercent,
        manager,
      );

      if (paymentResult.payment.status === 'captured') {
        savedOrder.status = 'paid';
        savedOrder.paymentStatus = 'captured';
        await manager.save(Order, savedOrder);

        const paymentCapturedEvent = manager.create(OrderEvent, {
          tenantId: effectiveTenantId,
          orderId: savedOrder.id,
          eventType: 'payment_captured',
          actorType: customerId ? 'customer' : 'guest',
          actorId: customerId ?? undefined,
        });
        await manager.save(OrderEvent, paymentCapturedEvent);
      }

      cart.status = 'converted';
      await manager.save(Cart, cart);

      return {
        order: savedOrder,
        guestAccessToken: rawGuestToken ?? null,
      };
    });
  }
}
