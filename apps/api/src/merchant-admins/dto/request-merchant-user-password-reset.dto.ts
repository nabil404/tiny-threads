import { IsEmail } from 'class-validator';

export class RequestMerchantUserPasswordResetDto {
  @IsEmail()
  email!: string;
}
