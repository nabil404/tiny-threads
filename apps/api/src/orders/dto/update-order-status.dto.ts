import { IsIn } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { ErrorCode } from '@tiny-threads/shared';
import { field } from '../../common/errors/validation-field';
import {
  ORDER_STATUSES,
  type OrderStatus,
} from '../../db/entities/order.entity';

export class UpdateOrderStatusDto {
  @ApiProperty({
    description: 'New order status',
    example: 'shipped',
    enum: ORDER_STATUSES,
  })
  @IsIn([...ORDER_STATUSES], { message: field(ErrorCode.IS_IN) })
  status!: OrderStatus;
}
