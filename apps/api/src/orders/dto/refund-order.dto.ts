import { IsInt, IsOptional, IsString, Min } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ErrorCode } from '@tiny-threads/shared';
import { field } from '../../common/errors/validation-field';

export class RefundOrderDto {
  @ApiProperty({
    description: 'Amount in minor units (cents) to refund',
    example: 2500,
  })
  @IsInt({ message: field(ErrorCode.IS_INT) })
  @Min(1, { message: field(ErrorCode.MIN) })
  amountCents!: number;

  @ApiPropertyOptional({
    description: 'Reason for the refund',
    example: 'Damaged item on delivery',
  })
  @IsOptional()
  @IsString({ message: field(ErrorCode.IS_STRING) })
  reason?: string;
}
