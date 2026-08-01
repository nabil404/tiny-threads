import { IsOptional, IsIn, IsInt, Min, Max } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { ErrorCode } from '@tiny-threads/shared';
import { field } from '../../common/errors/validation-field';
import {
  ORDER_STATUSES,
  type OrderStatus,
} from '../../db/entities/order.entity';

export class OrderQueryDto {
  @ApiPropertyOptional({ description: 'Page number', example: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: field(ErrorCode.IS_INT) })
  @Min(1, { message: field(ErrorCode.MIN) })
  page: number = 1;

  @ApiPropertyOptional({
    description: 'Items per page (max 100)',
    example: 20,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: field(ErrorCode.IS_INT) })
  @Min(1, { message: field(ErrorCode.MIN) })
  @Max(100, { message: field(ErrorCode.MAX) })
  limit: number = 20;

  @ApiPropertyOptional({
    description: 'Filter by order status',
    enum: ORDER_STATUSES,
  })
  @IsOptional()
  @IsIn([...ORDER_STATUSES], { message: field(ErrorCode.IS_IN) })
  status?: OrderStatus;
}
