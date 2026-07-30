import { PartialType, OmitType } from '@nestjs/swagger';
import { CreateProductDto } from './create-product.dto';
import {
  IsOptional,
  IsUUID,
  IsArray,
  ValidateNested,
  IsString,
  MaxLength,
  IsInt,
  Min,
  IsBoolean,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ErrorCode } from '@tiny-threads/shared';
import { field } from '../../common/errors/validation-field';

export class UpdateVariantDto {
  @IsOptional()
  @IsUUID(undefined, { message: field(ErrorCode.IS_UUID) })
  id?: string;

  @IsOptional()
  @IsString({ message: field(ErrorCode.IS_STRING) })
  @MaxLength(100, { message: field(ErrorCode.MAX_LENGTH) })
  sku?: string;

  @IsOptional()
  @IsInt({ message: field(ErrorCode.IS_INT) })
  @Min(0, { message: field(ErrorCode.MIN) })
  priceCents?: number;

  @IsOptional()
  @IsInt({ message: field(ErrorCode.IS_INT) })
  @Min(0, { message: field(ErrorCode.MIN) })
  stock?: number;

  @IsOptional()
  @IsBoolean({ message: field(ErrorCode.IS_BOOLEAN) })
  isDefault?: boolean;
}

export class UpdateProductDto extends PartialType(
  OmitType(CreateProductDto, ['variants'] as const),
) {
  @IsArray({ message: field(ErrorCode.IS_ARRAY) })
  @IsOptional()
  @ValidateNested({ each: true })
  @Type(() => UpdateVariantDto)
  variants?: UpdateVariantDto[];
}
