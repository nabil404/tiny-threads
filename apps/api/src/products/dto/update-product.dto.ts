import { PartialType } from '@nestjs/swagger';
import { CreateProductDto, CreateVariantDto } from './create-product.dto';
import { IsOptional, IsUUID, IsArray, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';

export class UpdateVariantDto extends PartialType(CreateVariantDto) {
  @IsOptional()
  @IsUUID()
  id?: string;
}

export class UpdateProductDto extends PartialType(CreateProductDto) {
  @IsArray()
  @IsOptional()
  @ValidateNested({ each: true })
  @Type(() => UpdateVariantDto)
  variants?: UpdateVariantDto[];
}
