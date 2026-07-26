import { IsEmail, IsString } from 'class-validator';

export class LoginMerchantUserDto {
  @IsEmail()
  email!: string;

  @IsString()
  password!: string;
}
