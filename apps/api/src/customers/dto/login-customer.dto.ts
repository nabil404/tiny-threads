import { IsEmail, IsString } from 'class-validator';

export class LoginCustomerDto {
  @IsEmail()
  email!: string;

  @IsString()
  password!: string;
}
