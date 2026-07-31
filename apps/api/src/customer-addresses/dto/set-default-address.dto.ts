import { IsBoolean, IsOptional } from 'class-validator';
import { ErrorCode } from '@tiny-threads/shared';
import { field } from '../../common/errors/validation-field';

export class SetDefaultAddressDto {
  @IsBoolean({ message: field(ErrorCode.IS_BOOLEAN) })
  @IsOptional()
  defaultShipping?: boolean;

  @IsBoolean({ message: field(ErrorCode.IS_BOOLEAN) })
  @IsOptional()
  defaultBilling?: boolean;
}
