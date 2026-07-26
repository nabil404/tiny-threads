import { IsString } from 'class-validator';

export class VerifyMerchantUserEmailDto {
  @IsString()
  token!: string;
}
