import { IsEmail, IsNotEmpty, IsString, MinLength } from 'class-validator';
import { ErrorCode } from '@tiny-threads/shared';
import { field } from '../../common/errors/validation-field';

export class RegisterCustomerDto {
  @IsEmail(undefined, { message: field(ErrorCode.IS_EMAIL) })
  email!: string;

  @MinLength(12, { message: field(ErrorCode.MIN_LENGTH) })
  password!: string;

  @IsString({ message: field(ErrorCode.IS_STRING) })
  @IsNotEmpty({ message: field(ErrorCode.IS_NOT_EMPTY) })
  name!: string;
}
