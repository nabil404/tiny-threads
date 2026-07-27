import { IsEmail } from 'class-validator';

export class RequestCustomerPasswordResetDto {
  @IsEmail()
  email!: string;
}
