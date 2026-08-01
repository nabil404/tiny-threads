import { IsString } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { ErrorCode } from '@tiny-threads/shared';
import { field } from '../../common/errors/validation-field';

export class UpdateOrderStatusDto {
  @ApiProperty({
    description: 'New order status',
    example: 'shipped',
  })
  @IsString({ message: field(ErrorCode.IS_STRING) })
  status!: string;
}
