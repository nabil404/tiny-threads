import { Injectable } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { Strategy } from 'passport-local';
import { ClsService } from 'nestjs-cls';
import { CustomersAuthService } from './customers-auth.service';

@Injectable()
export class CustomerLocalStrategy extends PassportStrategy(
  Strategy,
  'customer-local',
) {
  constructor(
    private readonly customersAuthService: CustomersAuthService,
    private readonly cls: ClsService,
  ) {
    super({ usernameField: 'email' });
  }

  async validate(email: string, password: string) {
    const tenantId = this.cls.get<string>('tenantId');
    return this.customersAuthService.login(tenantId, email, password);
  }
}
