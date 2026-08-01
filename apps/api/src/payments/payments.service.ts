import { Inject, Injectable, Optional } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { createHash } from 'crypto';
import { DataSource, EntityManager } from 'typeorm';
import { ClsService } from 'nestjs-cls';
import { TenantDbService } from '../db/tenant-db.service';
import { Order } from '../db/entities/order.entity';
import { Payment } from '../db/entities/payment.entity';
import { Settlement } from '../db/entities/settlement.entity';
import { Refund } from '../db/entities/refund.entity';
import { OrderEvent } from '../db/entities/order-event.entity';
import { Tenant } from '../db/entities/tenants.entity';
import { PaymentProviderConfig } from '../db/entities/payment-provider-configs.entity';
import type { PaymentProvider } from './interfaces/payment-provider.interface';
import { PAYMENT_PROVIDER_TOKEN } from './interfaces/payment-provider.interface';
import { PaymentPortRegistry } from './providers/payment-port.registry';
import { MockPaymentProvider } from './providers/mock-payment.provider';
import { MerchantAccountRef } from './interfaces/payment-port.interface';
import {
  CodedBadRequestException,
  CodedNotFoundException,
} from '../common/errors/coded-exceptions';
import { ErrorCode } from '@tiny-threads/shared';

@Injectable()
export class PaymentsService {
  private readonly registry: PaymentPortRegistry;

  constructor(
    @Inject(PAYMENT_PROVIDER_TOKEN)
    private readonly provider: PaymentProvider,
    private readonly tenantDb: TenantDbService,
    private readonly cls: ClsService,
    @Optional() portRegistry?: PaymentPortRegistry,
    @InjectDataSource() @Optional() private readonly dataSource?: DataSource,
  ) {
    this.registry =
      portRegistry ?? new PaymentPortRegistry(provider as MockPaymentProvider);
  }

  async processOrderPayment(
    order: Order,
    paymentToken: string,
    platformFeePercent: number,
    manager?: EntityManager,
  ): Promise<{ payment: Payment; settlement?: Settlement }> {
    const pct = Number(platformFeePercent);
    if (!Number.isFinite(pct) || pct < 0 || pct > 100) {
      throw new CodedBadRequestException(
        ErrorCode.VALIDATION_FAILED,
        'Platform fee percentage is out of range',
      );
    }

    const executeInContext = async (em: EntityManager) => {
      const tenantId = this.cls.get<string>('tenantId') || order.tenantId;

      const result = await this.provider.processPayment({
        orderId: order.id,
        amountCents: order.totalCents,
        currencyCode: order.currencyCode,
        token: paymentToken,
      });

      const payment = em.create(Payment, {
        tenantId,
        orderId: order.id,
        provider: 'mock',
        providerTransactionId: result.providerTransactionId,
        status: result.status,
        amountCents: order.totalCents,
        currencyCode: order.currencyCode,
        rawResponse: result.rawResponse ?? undefined,
      });
      await em.save(Payment, payment);

      let settlement: Settlement | undefined;

      if (result.status === 'captured') {
        const platformFeeCents = Math.round(order.totalCents * (pct / 100));
        const merchantNetAmountCents = order.totalCents - platformFeeCents;

        settlement = em.create(Settlement, {
          tenantId,
          paymentId: payment.id,
          orderId: order.id,
          grossAmountCents: order.totalCents,
          platformFeeCents,
          merchantNetAmountCents,
          status: 'settled',
        });
        await em.save(Settlement, settlement);
      } else if (result.status === 'failed') {
        throw new CodedBadRequestException(
          ErrorCode.PAYMENT_FAILED,
          `Payment processing failed: ${result.errorMessage || 'Card declined'}`,
        );
      }

      return { payment, settlement };
    };

    return manager
      ? executeInContext(manager)
      : this.tenantDb.run(executeInContext);
  }

  async refundPayment(
    orderId: string,
    amountCents: number,
    reason?: string,
    manager?: EntityManager,
  ): Promise<Refund> {
    if (!Number.isInteger(amountCents) || amountCents <= 0) {
      throw new CodedBadRequestException(
        ErrorCode.VALIDATION_FAILED,
        'Refund amount must be a positive integer number of minor units',
      );
    }

    const executeInContext = async (em: EntityManager) => {
      const tenantId = this.cls.get<string>('tenantId');
      const payment = await em.findOne(Payment, {
        where: { orderId, status: 'captured' },
      });

      if (!payment) {
        throw new CodedNotFoundException(
          ErrorCode.PAYMENT_NOT_FOUND,
          'No captured payment found',
        );
      }

      const existingRefunds = await em.find(Refund, {
        where: { paymentId: payment.id },
      });
      const existingSum = existingRefunds.reduce(
        (sum, r) => sum + r.amountCents,
        0,
      );

      if (existingSum + amountCents > payment.amountCents) {
        throw new CodedBadRequestException(
          ErrorCode.REFUND_EXCEEDS_PAYMENT,
          'Refund amount exceeds captured payment',
        );
      }

      const refundResult = await this.provider.processRefund({
        paymentId: payment.id,
        providerTransactionId: payment.providerTransactionId!,
        amountCents,
        reason,
      });

      const refund = em.create(Refund, {
        tenantId: payment.tenantId || tenantId,
        paymentId: payment.id,
        orderId,
        amountCents,
        reason: reason ?? undefined,
        status: 'completed',
        providerRefundId: refundResult.providerRefundId,
      });

      return em.save(Refund, refund);
    };

    return manager
      ? executeInContext(manager)
      : this.tenantDb.run(executeInContext);
  }

  handleWebhook(payload: unknown): { received: boolean } {
    void payload;
    return { received: true };
  }

  async handleWebhookEvent(
    payload: unknown,
    headers: Record<string, string> = {},
  ): Promise<{ received: boolean; status: string }> {
    const providerName = (
      headers['x-provider'] ||
      headers['provider'] ||
      'mock'
    ).toLowerCase();
    const port = this.registry.get(providerName);

    const rawBuffer = Buffer.isBuffer(payload)
      ? payload
      : Buffer.from(
          typeof payload === 'string'
            ? payload
            : JSON.stringify(payload ?? {}),
        );

    const event = await port.parseEvent(rawBuffer, headers);
    const tenantId = await this.resolveTenantId(event.merchantAccount);

    if (!tenantId) {
      throw new CodedNotFoundException(
        ErrorCode.TENANT_NOT_FOUND,
        'Merchant account not associated with any tenant',
      );
    }

    return this.tenantDb.run(tenantId, async (manager) => {
      if (event.providerEventId) {
        const existingEvent = await manager.findOne(OrderEvent, {
          where: { providerEventId: event.providerEventId },
        });
        if (existingEvent) {
          return { received: true, status: 'already_processed' };
        }
      }

      let targetOrderId: string | undefined;

      if (event.payment?.externalId) {
        const payment = await manager.findOne(Payment, {
          where: { providerTransactionId: event.payment.externalId },
        });
        if (payment) {
          targetOrderId = payment.orderId;

          if (event.type === 'payment.captured') {
            payment.status = 'captured';
            await manager.save(Payment, payment);

            if (targetOrderId) {
              const order = await manager.findOne(Order, {
                where: { id: targetOrderId },
              });
              if (order && order.status !== 'cancelled') {
                order.paymentStatus = 'captured';
                if (order.status === 'pending') {
                  order.status = 'confirmed';
                }
                await manager.save(Order, order);
              }
            }
          }
        }
      }

      const orderEvent = manager.create(OrderEvent, {
        tenantId,
        orderId: targetOrderId,
        eventType: event.type,
        actorType: 'system',
        actorId: `provider:${event.merchantAccount.provider}`,
        providerEventId: event.providerEventId,
        metadata: {
          merchantAccount: event.merchantAccount,
          payment: event.payment,
          amount: event.amount,
          occurredAt: event.occurredAt,
        },
      });
      await manager.save(OrderEvent, orderEvent);

      return { received: true, status: 'processed' };
    });
  }

  private async resolveTenantId(
    merchantAccount: MerchantAccountRef,
  ): Promise<string | null> {
    if (!merchantAccount.externalId) {
      return null;
    }

    if (this.dataSource) {
      try {
        const config = await this.dataSource
          .getRepository(PaymentProviderConfig)
          .findOne({ where: { accountRef: merchantAccount.externalId } });
        if (config) {
          return config.tenantId;
        }
      } catch {
        // Safe fallback if RLS or query fails before context is set
      }

      try {
        const isUuid =
          /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
            merchantAccount.externalId,
          );

        const whereConditions: Array<{ id?: string; host?: string; name?: string }> = [
          { host: merchantAccount.externalId },
          { name: merchantAccount.externalId },
        ];
        if (isUuid) {
          whereConditions.push({ id: merchantAccount.externalId });
        }

        const tenant = await this.dataSource
          .getRepository(Tenant)
          .findOne({ where: whereConditions });
        if (tenant) {
          return tenant.id;
        }
      } catch {
        // Safe fallback if tenant query fails
      }
    }

    return this.toValidUuid(merchantAccount.externalId);
  }

  private toValidUuid(input: string): string {
    const isUuid =
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
        input,
      );
    if (isUuid) {
      return input;
    }

    const hash = createHash('md5').update(input).digest('hex');
    return `${hash.slice(0, 8)}-${hash.slice(8, 12)}-4${hash.slice(13, 16)}-8${hash.slice(17, 20)}-${hash.slice(20, 32)}`;
  }
}
