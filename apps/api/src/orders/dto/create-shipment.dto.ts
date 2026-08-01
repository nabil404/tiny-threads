import { Type } from 'class-transformer';
import {
  IsArray,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUrl,
  IsUUID,
  Min,
  ValidateNested,
} from 'class-validator';
import { ErrorCode } from '@tiny-threads/shared';
import { field } from '../../common/errors/validation-field';

export class CreateShipmentItemDto {
  @IsUUID(7, { message: field(ErrorCode.IS_UUID) })
  orderItemId!: string;

  @IsInt({ message: field(ErrorCode.IS_INT) })
  @Min(1, { message: field(ErrorCode.MIN) })
  quantity!: number;
}

export class CreateShipmentDto {
  @IsString({ message: field(ErrorCode.IS_STRING) })
  @IsNotEmpty({ message: field(ErrorCode.IS_NOT_EMPTY) })
  carrier!: string;

  @IsOptional()
  @IsString({ message: field(ErrorCode.IS_STRING) })
  trackingNumber?: string;

  @IsOptional()
  @IsUrl(undefined, { message: field(ErrorCode.VALIDATION_FAILED) })
  trackingUrl?: string;

  @IsArray({ message: field(ErrorCode.IS_ARRAY) })
  @ValidateNested({ each: true })
  @Type(() => CreateShipmentItemDto)
  items!: CreateShipmentItemDto[];
}
