import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsString,
  IsNotEmpty,
  IsNumber,
  Min,
  IsBoolean,
  IsOptional,
} from 'class-validator';

export class UpdateProductVariantDto {
  @ApiPropertyOptional({
    description: 'Unique SKU code for the variant',
    example: 'TEE-BLK-M',
  })
  @IsString()
  @IsNotEmpty()
  @IsOptional()
  sku?: string;

  @ApiPropertyOptional({ description: 'Price in cents', example: 2800 })
  @IsNumber()
  @Min(0)
  @IsOptional()
  priceCents?: number;

  @ApiPropertyOptional({ description: 'Available stock quantity', example: 50 })
  @IsNumber()
  @Min(0)
  @IsOptional()
  stock?: number;

  @ApiPropertyOptional({
    description: 'Whether this variant is the default for the product',
  })
  @IsBoolean()
  @IsOptional()
  isDefault?: boolean;
}
