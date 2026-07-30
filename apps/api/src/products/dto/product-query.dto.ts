import {
  IsOptional,
  IsString,
  IsInt,
  Min,
  Max,
  IsIn,
  IsUUID,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ProductStatus } from '../../db/entities/products.entity';

export class ProductQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit: number = 20;

  @IsOptional()
  @IsIn(['draft', 'active', 'archived'])
  status?: ProductStatus;

  @IsOptional()
  @IsUUID()
  categoryId?: string;

  @IsOptional()
  @IsString()
  q?: string;
}
