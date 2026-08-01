import { Inject, Injectable } from '@nestjs/common';
import { EntityManager } from 'typeorm';
import { ClsService } from 'nestjs-cls';
import { TenantDbService } from '../db/tenant-db.service';
import { Order } from '../db/entities/order.entity';
import { Payment } from '../db/entities/payment.entity';
import { Settlement } from '../db/entities/settlement.entity';
import { Refund } from '../db/entities/refund.entity';
import type { PaymentProvider } from './interfaces/payment-provider.interface';
import { PAYMENT_PROVIDER_TOKEN } from './interfaces/payment-provider.interface';
import {
  CodedBadRequestException,
  CodedNotFoundException,
} from '../common/errors/coded-exceptions';
import { ErrorCode } from '@tiny-threads/shared';

@Injectable()
export class PaymentsService {
  constructor(
    @Inject(PAYMENT_PROVIDER_TOKEN)
    private readonly provider: PaymentProvider,
    private readonly tenantDb: TenantDbService,
    private readonly cls: ClsService,
  ) {}

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
}
