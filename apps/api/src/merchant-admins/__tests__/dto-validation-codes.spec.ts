import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { LoginMerchantUserDto } from '../dto/login-merchant-user.dto';
import { MerchantAdminOAuthExchangeDto } from '../dto/merchant-admin-oauth-exchange.dto';
import { VerifyMerchantUserEmailDto } from '../dto/verify-merchant-user-email.dto';
import { RegisterMerchantUserDto } from '../dto/register-merchant-user.dto';
import { RequestMerchantUserPasswordResetDto } from '../dto/request-merchant-user-password-reset.dto';
import { InviteMemberDto } from '../dto/invite-member.dto';
import { MerchantAdminOAuthInitiateDto } from '../dto/merchant-admin-oauth-initiate.dto';
import { ResetMerchantUserPasswordDto } from '../dto/reset-merchant-user-password.dto';
import { UpdateMerchantAdminLocaleDto } from '../dto/merchant-admin-locale.dto';

function decode(raw: string): {
  code: string;
  params: Record<string, unknown>;
} {
  return JSON.parse(raw);
}

describe('merchant-admins DTO validation codes', () => {
  it('LoginMerchantUserDto encodes IS_EMAIL and IS_STRING', async () => {
    const dto = plainToInstance(LoginMerchantUserDto, {
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

  it('MerchantAdminOAuthExchangeDto encodes IS_NOT_EMPTY for an empty code', async () => {
    const dto = plainToInstance(MerchantAdminOAuthExchangeDto, { code: '' });
    const [error] = await validate(dto);
    expect(decode(error.constraints!.isNotEmpty)).toMatchObject({
      code: 'IS_NOT_EMPTY',
    });
  });

  it('VerifyMerchantUserEmailDto encodes IS_STRING', async () => {
    const dto = plainToInstance(VerifyMerchantUserEmailDto, { token: 123 });
    const [error] = await validate(dto);
    expect(decode(error.constraints!.isString)).toMatchObject({
      code: 'IS_STRING',
    });
  });

  it('RegisterMerchantUserDto encodes MIN_LENGTH with the real minimum', async () => {
    const dto = plainToInstance(RegisterMerchantUserDto, {
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

  it('RequestMerchantUserPasswordResetDto encodes IS_EMAIL', async () => {
    const dto = plainToInstance(RequestMerchantUserPasswordResetDto, {
      email: 'bad',
    });
    const [error] = await validate(dto);
    expect(decode(error.constraints!.isEmail)).toMatchObject({
      code: 'IS_EMAIL',
    });
  });

  it('InviteMemberDto encodes IS_EMAIL and IS_IN with the allowed roles as a param', async () => {
    const dto = plainToInstance(InviteMemberDto, {
      email: 'bad',
      role: 'superadmin',
    });
    const byProperty = Object.fromEntries(
      (await validate(dto)).map((e) => [e.property, e.constraints ?? {}]),
    );
    expect(decode(byProperty.email.isEmail)).toMatchObject({
      code: 'IS_EMAIL',
    });
    expect(decode(byProperty.role.isIn)).toMatchObject({
      code: 'IS_IN',
      params: { values: 'owner, admin, staff, viewer' },
    });
  });

  it('MerchantAdminOAuthInitiateDto encodes IS_NOT_EMPTY for an empty returnUrl', async () => {
    const dto = plainToInstance(MerchantAdminOAuthInitiateDto, {
      returnUrl: '',
    });
    const [error] = await validate(dto);
    expect(decode(error.constraints!.isNotEmpty)).toMatchObject({
      code: 'IS_NOT_EMPTY',
    });
  });

  it('ResetMerchantUserPasswordDto encodes MIN_LENGTH with the real minimum', async () => {
    const dto = plainToInstance(ResetMerchantUserPasswordDto, {
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

  it('UpdateMerchantAdminLocaleDto encodes IS_IN with the supported locales as a param for an unsupported locale', async () => {
    const dto = plainToInstance(UpdateMerchantAdminLocaleDto, {
      locale: 'xx',
    });
    const [error] = await validate(dto);
    expect(decode(error.constraints!.isIn)).toMatchObject({
      code: 'IS_IN',
      params: { values: 'en' },
    });
  });

  it('UpdateMerchantAdminLocaleDto allows a null locale with no validation errors', async () => {
    const dto = plainToInstance(UpdateMerchantAdminLocaleDto, {
      locale: null,
    });
    const errors = await validate(dto);
    expect(errors).toHaveLength(0);
  });
});
