import { createValidatedLocalAuthGuard } from '../../auth-core/guards/validated-local-auth.guard';
import { LoginMerchantUserDto } from '../dto/login-merchant-user.dto';

export class MerchantAdminLocalAuthGuard extends createValidatedLocalAuthGuard(
  'merchant-admin-local',
  LoginMerchantUserDto,
) {}
