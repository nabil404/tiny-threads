import { createValidatedLocalAuthGuard } from '../../auth-core/guards/validated-local-auth.guard';
import { LoginCustomerDto } from '../dto/login-customer.dto';

export class CustomerLocalAuthGuard extends createValidatedLocalAuthGuard(
  'customer-local',
  LoginCustomerDto,
) {}
