import {
  IsOptional,
  IsString,
  IsInt,
  Min,
  Max,
  IsIn,
  IsUUID,
  MaxLength,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ErrorCode } from '@tiny-threads/shared';
import { field } from '../../common/errors/validation-field';
import type { ProductStatus } from '../../db/entities/products.entity';

export class ProductQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: field(ErrorCode.IS_INT) })
  @Min(1, { message: field(ErrorCode.MIN) })
  page: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: field(ErrorCode.IS_INT) })
  @Min(1, { message: field(ErrorCode.MIN) })
  @Max(100, { message: field(ErrorCode.MAX) })
  limit: number = 20;

  @IsOptional()
  @IsIn(['draft', 'active', 'archived'], { message: field(ErrorCode.IS_IN) })
  status?: ProductStatus;

  @IsOptional()
  @IsUUID(undefined, { message: field(ErrorCode.IS_UUID) })
  categoryId?: string;

  @IsOptional()
  @IsString({ message: field(ErrorCode.IS_STRING) })
  @MaxLength(100, { message: field(ErrorCode.MAX_LENGTH) })
  q?: string;
}
