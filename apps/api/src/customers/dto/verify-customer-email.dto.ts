import { IsString } from 'class-validator';
import { ErrorCode } from '@tiny-threads/shared';
import { field } from '../../common/errors/validation-field';

export class VerifyCustomerEmailDto {
  @IsString({ message: field(ErrorCode.IS_STRING) })
  token!: string;
}
