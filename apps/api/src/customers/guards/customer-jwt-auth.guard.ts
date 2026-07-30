import { createCodedJwtAuthGuard } from '../../auth-core/guards/coded-jwt-auth.guard';

export class CustomerJwtAuthGuard extends createCodedJwtAuthGuard(
  'customer-jwt',
) {}
