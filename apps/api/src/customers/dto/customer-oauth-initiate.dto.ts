import { IsNotEmpty, IsString } from 'class-validator';

export class CustomerOAuthInitiateDto {
  @IsString()
  @IsNotEmpty()
  returnUrl!: string;
}
