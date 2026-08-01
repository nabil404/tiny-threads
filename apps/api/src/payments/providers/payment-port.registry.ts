import { Injectable, NotFoundException } from '@nestjs/common';
import { PaymentPort } from '../interfaces/payment-port.interface';
import { MockPaymentProvider } from './mock-payment.provider';

@Injectable()
export class PaymentPortRegistry {
  private readonly ports = new Map<string, PaymentPort>();

  constructor(mockProvider: MockPaymentProvider) {
    this.register(mockProvider);
  }

  register(port: PaymentPort): void {
    this.ports.set(port.providerName, port);
  }

  get(providerName: string): PaymentPort {
    const port = this.ports.get(providerName);
    if (!port) {
      throw new NotFoundException(`Payment port not found for provider: ${providerName}`);
    }
    return port;
  }

  getByProviderName(providerName: string): PaymentPort {
    return this.get(providerName);
  }

  has(providerName: string): boolean {
    return this.ports.has(providerName);
  }
}
