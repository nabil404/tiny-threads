import { Injectable } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

@Injectable()
export class MerchantAdminJwtAuthGuard extends AuthGuard(
  'merchant-admin-jwt',
) {}
