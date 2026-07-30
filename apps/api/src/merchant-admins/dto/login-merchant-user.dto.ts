import { IsEmail, IsString } from 'class-validator';
import { ErrorCode } from '@tiny-threads/shared';
import { field } from '../../common/errors/validation-field';

export class LoginMerchantUserDto {
  @IsEmail(undefined, { message: field(ErrorCode.IS_EMAIL) })
  email!: string;

  @IsString({ message: field(ErrorCode.IS_STRING) })
  password!: string;
}
