import { createCodedJwtAuthGuard } from '../../auth-core/guards/coded-jwt-auth.guard';

export class MerchantAdminJwtAuthGuard extends createCodedJwtAuthGuard(
  'merchant-admin-jwt',
) {}
