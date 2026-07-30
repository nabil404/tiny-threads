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
} from 'class-validator';
import { Type } from 'class-transformer';
import { ErrorCode } from '@tiny-threads/shared';
import { field } from '../../common/errors/validation-field';
import type { ProductStatus } from '../../db/entities/products.entity';

export class CreateVariantDto {
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
}

export class CreateProductDto {
  @IsString({ message: field(ErrorCode.IS_STRING) })
  @IsNotEmpty({ message: field(ErrorCode.IS_NOT_EMPTY) })
  title!: string;

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
