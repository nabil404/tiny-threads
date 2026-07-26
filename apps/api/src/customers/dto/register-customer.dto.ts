import { IsEmail, MinLength } from 'class-validator';

export class RegisterCustomerDto {
  @IsEmail()
  email!: string;

  @MinLength(12)
  password!: string;

  name!: string;
}
