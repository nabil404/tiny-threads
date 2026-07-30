import { IsEmail } from 'class-validator';
import { ErrorCode } from '@tiny-threads/shared';
import { field } from '../../common/errors/validation-field';

export class RequestCustomerPasswordResetDto {
  @IsEmail(undefined, { message: field(ErrorCode.IS_EMAIL) })
  email!: string;
}
