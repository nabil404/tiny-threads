import { IsString, MinLength } from 'class-validator';

export class ResetCustomerPasswordDto {
  @IsString()
  token!: string;

  @MinLength(12)
  password!: string;
}
