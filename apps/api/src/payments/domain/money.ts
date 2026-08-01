export interface Money {
  amount: number;
  currency: string;
}

export class MoneyUtil {
  static create(amount: number, currency: string): Money {
    if (!Number.isInteger(amount) || amount < 0) {
      throw new Error('Money amount must be a non-negative integer');
    }
    return { amount, currency: currency.toUpperCase() };
  }

  static add(a: Money, b: Money): Money {
    if (a.currency !== b.currency) throw new Error('Currency mismatch');
    return { amount: a.amount + b.amount, currency: a.currency };
  }

  static subtract(a: Money, b: Money): Money {
    if (a.currency !== b.currency) throw new Error('Currency mismatch');
    if (a.amount < b.amount) throw new Error('Insufficient funds for subtraction');
    return { amount: a.amount - b.amount, currency: a.currency };
  }
}
