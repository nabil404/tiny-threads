import { IsString, IsNotEmpty, IsOptional, IsBoolean } from 'class-validator';
import { ErrorCode } from '@tiny-threads/shared';
import { field } from '../../common/errors/validation-field';

export class CreateAddressDto {
  @IsString({ message: field(ErrorCode.IS_STRING) })
  @IsNotEmpty({ message: field(ErrorCode.IS_NOT_EMPTY) })
  firstName!: string;

  @IsString({ message: field(ErrorCode.IS_STRING) })
  @IsNotEmpty({ message: field(ErrorCode.IS_NOT_EMPTY) })
  lastName!: string;

  @IsString({ message: field(ErrorCode.IS_STRING) })
  @IsOptional()
  company?: string;

  @IsString({ message: field(ErrorCode.IS_STRING) })
  @IsNotEmpty({ message: field(ErrorCode.IS_NOT_EMPTY) })
  line1!: string;

  @IsString({ message: field(ErrorCode.IS_STRING) })
  @IsOptional()
  line2?: string;

  @IsString({ message: field(ErrorCode.IS_STRING) })
  @IsNotEmpty({ message: field(ErrorCode.IS_NOT_EMPTY) })
  city!: string;

  @IsString({ message: field(ErrorCode.IS_STRING) })
  @IsOptional()
  stateProvince?: string;

  @IsString({ message: field(ErrorCode.IS_STRING) })
  @IsNotEmpty({ message: field(ErrorCode.IS_NOT_EMPTY) })
  postalCode!: string;

  @IsString({ message: field(ErrorCode.IS_STRING) })
  @IsNotEmpty({ message: field(ErrorCode.IS_NOT_EMPTY) })
  countryCode!: string;

  @IsString({ message: field(ErrorCode.IS_STRING) })
  @IsOptional()
  phone?: string;

  @IsBoolean({ message: field(ErrorCode.IS_BOOLEAN) })
  @IsOptional()
  isDefaultShipping?: boolean;

  @IsBoolean({ message: field(ErrorCode.IS_BOOLEAN) })
  @IsOptional()
  isDefaultBilling?: boolean;
}
