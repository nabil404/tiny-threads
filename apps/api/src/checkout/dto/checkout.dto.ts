import { IsEmail, IsObject, IsOptional, IsString } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { field } from '../../common/errors/validation-field';
import { ErrorCode } from '@tiny-threads/shared';

export class CheckoutDto {
  @ApiProperty({ description: 'Customer email address' })
  @IsEmail(undefined, { message: field(ErrorCode.IS_EMAIL) })
  customerEmail!: string;

  @ApiProperty({ description: 'Shipping address details' })
  @IsObject({ message: field(ErrorCode.IS_OBJECT) })
  shippingAddress!: Record<string, any>;

  @ApiPropertyOptional({ description: 'Billing address details' })
  @IsOptional()
  @IsObject({ message: field(ErrorCode.IS_OBJECT) })
  billingAddress?: Record<string, any>;

  @ApiPropertyOptional({
    description: 'Payment token provided by client',
    default: 'mock_success',
  })
  @IsOptional()
  @IsString({ message: field(ErrorCode.IS_STRING) })
  paymentToken: string = 'mock_success';
}
