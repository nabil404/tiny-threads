import { IsString, MinLength } from 'class-validator';
import { ErrorCode } from '@tiny-threads/shared';
import { field } from '../../common/errors/validation-field';

export class ResetCustomerPasswordDto {
  @IsString({ message: field(ErrorCode.IS_STRING) })
  token!: string;

  @MinLength(12, { message: field(ErrorCode.MIN_LENGTH) })
  password!: string;
}
