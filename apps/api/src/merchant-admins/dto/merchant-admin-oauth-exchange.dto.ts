import { IsNotEmpty, IsString } from 'class-validator';

export class MerchantAdminOAuthExchangeDto {
  @IsString()
  @IsNotEmpty()
  code!: string;
}
