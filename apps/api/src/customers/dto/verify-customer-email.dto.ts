import { IsString } from 'class-validator';

export class VerifyCustomerEmailDto {
  @IsString()
  token!: string;
}
