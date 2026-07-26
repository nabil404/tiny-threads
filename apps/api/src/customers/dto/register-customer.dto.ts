import { IsEmail, IsNotEmpty, IsString, MinLength } from 'class-validator';

export class RegisterCustomerDto {
  @IsEmail()
  email!: string;

  @MinLength(12)
  password!: string;

  @IsString()
  @IsNotEmpty()
  name!: string;
}
