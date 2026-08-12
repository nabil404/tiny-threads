import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsString,
  IsNotEmpty,
  IsNumber,
  Min,
  IsBoolean,
  IsOptional,
} from 'class-validator';

export class CreateProductVariantDto {
  @ApiPropertyOptional({
    description: 'Display name for the variant',
    example: 'Black / Small',
  })
  @IsString()
  @IsOptional()
  name?: string;

  @ApiProperty({
    description: 'Unique SKU code for the variant',
    example: 'TEE-BLK-S',
  })
  @IsString()
  @IsNotEmpty()
  sku!: string;

  @ApiProperty({ description: 'Price in cents', example: 2500 })
  @IsNumber()
  @Min(0)
  priceCents!: number;

  @ApiProperty({ description: 'Available stock quantity', example: 100 })
  @IsNumber()
  @Min(0)
  stock!: number;

  @ApiPropertyOptional({
    description: 'Whether this variant is the default for the product',
    default: false,
  })
  @IsBoolean()
  @IsOptional()
  isDefault?: boolean;
}
