import { IsEmail, IsIn, MinLength } from 'class-validator';

export class RegisterMerchantUserDto {
  @IsEmail()
  email!: string;

  @MinLength(12)
  password!: string;

  @IsIn(['owner', 'admin', 'staff', 'viewer'])
  role!: string;
}
