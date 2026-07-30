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
} from 'class-validator';
import { Type } from 'class-transformer';
import { ProductStatus } from '../../db/entities/products.entity';

export class CreateVariantDto {
  @IsString()
  @IsNotEmpty()
  sku!: string;

  @IsInt()
  @Min(0)
  priceCents!: number;

  @IsInt()
  @Min(0)
  stock!: number;

  @IsBoolean()
  @IsOptional()
  isDefault?: boolean;
}

export class CreateProductDto {
  @IsString()
  @IsNotEmpty()
  title!: string;

  @IsIn(['draft', 'active', 'archived'])
  status!: ProductStatus;

  @IsArray()
  @IsOptional()
  @ValidateNested({ each: true })
  @Type(() => CreateVariantDto)
  variants?: CreateVariantDto[];

  @IsArray()
  @IsOptional()
  @IsUUID('all', { each: true })
  categoryIds?: string[];
}
