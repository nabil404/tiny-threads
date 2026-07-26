import { Body, Controller, HttpCode, Post } from '@nestjs/common';
import { CustomersAuthService } from './customers-auth.service';
import { RegisterCustomerDto } from './dto/register-customer.dto';
import { VerifyCustomerEmailDto } from './dto/verify-customer-email.dto';

@Controller('customers/auth')
export class CustomersAuthController {
  constructor(private readonly customersAuthService: CustomersAuthService) {}

  @Post('register')
  register(@Body() dto: RegisterCustomerDto) {
    return this.customersAuthService.register(dto);
  }

  @Post('verify-email')
  @HttpCode(200)
  verifyEmail(@Body() dto: VerifyCustomerEmailDto) {
    return this.customersAuthService.verifyEmail(dto);
  }
}
