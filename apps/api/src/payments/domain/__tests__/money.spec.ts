import { MoneyUtil } from '../money';

describe('MoneyUtil', () => {
  it('creates valid money objects', () => {
    const m = MoneyUtil.create(1000, 'usd');
    expect(m).toEqual({ amount: 1000, currency: 'USD' });
  });

  it('rejects negative or fractional amounts', () => {
    expect(() => MoneyUtil.create(-500, 'USD')).toThrow();
    expect(() => MoneyUtil.create(10.5, 'USD')).toThrow();
  });

  it('adds money of same currency', () => {
    const a = MoneyUtil.create(1000, 'USD');
    const b = MoneyUtil.create(500, 'USD');
    expect(MoneyUtil.add(a, b)).toEqual({ amount: 1500, currency: 'USD' });
  });

  it('subtracts money of same currency', () => {
    const a = MoneyUtil.create(1000, 'USD');
    const b = MoneyUtil.create(400, 'USD');
    expect(MoneyUtil.subtract(a, b)).toEqual({ amount: 600, currency: 'USD' });
  });

  it('rejects subtraction resulting in negative balance', () => {
    const a = MoneyUtil.create(500, 'USD');
    const b = MoneyUtil.create(1000, 'USD');
    expect(() => MoneyUtil.subtract(a, b)).toThrow();
  });

  it('rejects addition or subtraction with currency mismatch', () => {
    const usd = MoneyUtil.create(500, 'USD');
    const eur = MoneyUtil.create(500, 'EUR');
    expect(() => MoneyUtil.add(usd, eur)).toThrow('Currency mismatch');
    expect(() => MoneyUtil.subtract(usd, eur)).toThrow('Currency mismatch');
  });
});
