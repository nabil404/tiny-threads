import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { RegisterCustomerDto } from '../dto/register-customer.dto';
import { LoginCustomerDto } from '../dto/login-customer.dto';
import { VerifyCustomerEmailDto } from '../dto/verify-customer-email.dto';
import { CustomerOAuthExchangeDto } from '../dto/customer-oauth-exchange.dto';
import { RequestCustomerPasswordResetDto } from '../dto/request-customer-password-reset.dto';
import { CustomerOAuthInitiateDto } from '../dto/customer-oauth-initiate.dto';
import { ResetCustomerPasswordDto } from '../dto/reset-customer-password.dto';

function decode(raw: string): {
  code: string;
  params: Record<string, unknown>;
} {
  return JSON.parse(raw);
}

describe('customers DTO validation codes', () => {
  it('RegisterCustomerDto encodes IS_EMAIL, MIN_LENGTH (with min), and IS_NOT_EMPTY', async () => {
    const dto = plainToInstance(RegisterCustomerDto, {
      email: 'not-an-email',
      password: 'short',
      name: '',
    });
    const byProperty = Object.fromEntries(
      (await validate(dto)).map((e) => [e.property, e.constraints ?? {}]),
    );

    expect(decode(byProperty.email.isEmail)).toMatchObject({
      code: 'IS_EMAIL',
    });
    expect(decode(byProperty.password.minLength)).toMatchObject({
      code: 'MIN_LENGTH',
      params: { min: 12 },
    });
    expect(decode(byProperty.name.isNotEmpty)).toMatchObject({
      code: 'IS_NOT_EMPTY',
    });
  });

  it('LoginCustomerDto encodes IS_EMAIL and IS_STRING', async () => {
    const dto = plainToInstance(LoginCustomerDto, {
      email: 'bad',
      password: 123,
    });
    const byProperty = Object.fromEntries(
      (await validate(dto)).map((e) => [e.property, e.constraints ?? {}]),
    );

    expect(decode(byProperty.email.isEmail)).toMatchObject({
      code: 'IS_EMAIL',
    });
    expect(decode(byProperty.password.isString)).toMatchObject({
      code: 'IS_STRING',
    });
  });

  it('VerifyCustomerEmailDto encodes IS_STRING', async () => {
    const dto = plainToInstance(VerifyCustomerEmailDto, { token: 123 });
    const [error] = await validate(dto);
    expect(decode(error.constraints!.isString)).toMatchObject({
      code: 'IS_STRING',
    });
  });

  it('CustomerOAuthExchangeDto encodes IS_NOT_EMPTY for an empty code', async () => {
    const dto = plainToInstance(CustomerOAuthExchangeDto, { code: '' });
    const [error] = await validate(dto);
    expect(decode(error.constraints!.isNotEmpty)).toMatchObject({
      code: 'IS_NOT_EMPTY',
    });
  });

  it('RequestCustomerPasswordResetDto encodes IS_EMAIL', async () => {
    const dto = plainToInstance(RequestCustomerPasswordResetDto, {
      email: 'bad',
    });
    const [error] = await validate(dto);
    expect(decode(error.constraints!.isEmail)).toMatchObject({
      code: 'IS_EMAIL',
    });
  });

  it('CustomerOAuthInitiateDto encodes IS_NOT_EMPTY for an empty returnUrl', async () => {
    const dto = plainToInstance(CustomerOAuthInitiateDto, { returnUrl: '' });
    const [error] = await validate(dto);
    expect(decode(error.constraints!.isNotEmpty)).toMatchObject({
      code: 'IS_NOT_EMPTY',
    });
  });

  it('ResetCustomerPasswordDto encodes MIN_LENGTH with the real minimum', async () => {
    const dto = plainToInstance(ResetCustomerPasswordDto, {
      token: 'tok',
      password: 'short',
    });
    const byProperty = Object.fromEntries(
      (await validate(dto)).map((e) => [e.property, e.constraints ?? {}]),
    );
    expect(decode(byProperty.password.minLength)).toMatchObject({
      code: 'MIN_LENGTH',
      params: { min: 12 },
    });
  });
});
