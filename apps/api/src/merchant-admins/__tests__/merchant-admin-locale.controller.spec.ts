/* eslint-disable @typescript-eslint/unbound-method */
import { GUARDS_METADATA } from '@nestjs/common/constants';
import type { Request } from 'express';
import { MerchantAdminLocaleController } from '../merchant-admin-locale.controller';
import { MerchantAdminJwtAuthGuard } from '../guards/merchant-admin-jwt-auth.guard';
import { MerchantAdminLocaleService } from '../merchant-admin-locale.service';

describe('MerchantAdminLocaleController route metadata', () => {
  it('requires MerchantAdminJwtAuthGuard on the controller', () => {
    const guards = Reflect.getMetadata(
      GUARDS_METADATA,
      MerchantAdminLocaleController,
    ) as unknown[];

    expect(guards).toContain(MerchantAdminJwtAuthGuard);
  });
});

describe('MerchantAdminLocaleController', () => {
  let controller: MerchantAdminLocaleController;
  let service: jest.Mocked<MerchantAdminLocaleService>;

  beforeEach(() => {
    service = {
      getLocale: jest.fn(),
      updateLocale: jest.fn(),
    } as unknown as jest.Mocked<MerchantAdminLocaleService>;
    controller = new MerchantAdminLocaleController(service);
  });

  function reqWithSub(sub: string): Request {
    return { user: { sub } } as unknown as Request;
  }

  it('getLocale resolves the merchant user id from the JWT sub and returns the locale', async () => {
    service.getLocale.mockResolvedValue('en');

    const result = await controller.getLocale(reqWithSub('user-1'));

    expect(service.getLocale).toHaveBeenCalledWith('user-1');
    expect(result).toEqual({ locale: 'en' });
  });

  it('updateLocale resolves the merchant user id from the JWT sub and persists the new locale', async () => {
    service.updateLocale.mockResolvedValue('en');

    const result = await controller.updateLocale(reqWithSub('user-1'), {
      locale: 'en',
    });

    expect(service.updateLocale).toHaveBeenCalledWith('user-1', 'en');
    expect(result).toEqual({ locale: 'en' });
  });
});
