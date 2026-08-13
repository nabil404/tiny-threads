import {
  IsString,
  IsNotEmpty,
  IsIn,
  IsArray,
  IsOptional,
  IsUUID,
  ValidateNested,
  IsInt,
  Min,
  IsBoolean,
  MaxLength,
  IsObject,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ErrorCode } from '@tiny-threads/shared';
import { field } from '../../common/errors/validation-field';
import type { ProductStatus } from '../../db/entities/products.entity';

export class CreateVariantDto {
  @IsString({ message: field(ErrorCode.IS_STRING) })
  @IsOptional()
  @MaxLength(255, { message: field(ErrorCode.MAX_LENGTH) })
  name?: string;

  @IsString({ message: field(ErrorCode.IS_STRING) })
  @IsNotEmpty({ message: field(ErrorCode.IS_NOT_EMPTY) })
  @MaxLength(100, { message: field(ErrorCode.MAX_LENGTH) })
  sku!: string;

  @IsInt({ message: field(ErrorCode.IS_INT) })
  @Min(0, { message: field(ErrorCode.MIN) })
  priceCents!: number;

  @IsInt({ message: field(ErrorCode.IS_INT) })
  @Min(0, { message: field(ErrorCode.MIN) })
  stock!: number;

  @IsBoolean({ message: field(ErrorCode.IS_BOOLEAN) })
  @IsOptional()
  isDefault?: boolean;

  @IsString({ message: field(ErrorCode.IS_STRING) })
  @IsOptional()
  @MaxLength(64, { message: field(ErrorCode.MAX_LENGTH) })
  clientKey?: string;
}

export class CreateProductDto {
  @IsString({ message: field(ErrorCode.IS_STRING) })
  @IsNotEmpty({ message: field(ErrorCode.IS_NOT_EMPTY) })
  title!: string;

  @IsObject({ message: field(ErrorCode.IS_OBJECT) })
  @IsOptional()
  description?: Record<string, any>;

  @IsIn(['draft', 'active', 'archived'], { message: field(ErrorCode.IS_IN) })
  status!: ProductStatus;

  @IsArray({ message: field(ErrorCode.IS_ARRAY) })
  @IsOptional()
  @ValidateNested({ each: true })
  @Type(() => CreateVariantDto)
  variants?: CreateVariantDto[];

  @IsArray({ message: field(ErrorCode.IS_ARRAY) })
  @IsOptional()
  @IsUUID('all', { each: true, message: field(ErrorCode.IS_UUID) })
  categoryIds?: string[];
}
