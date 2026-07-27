import { IsString, MinLength } from 'class-validator';

export class ResetMerchantUserPasswordDto {
  @IsString()
  token!: string;

  @MinLength(12)
  password!: string;
}
