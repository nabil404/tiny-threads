import { IsNotEmpty, IsString } from 'class-validator';

export class CustomerOAuthExchangeDto {
  @IsString()
  @IsNotEmpty()
  code!: string;
}
