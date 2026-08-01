import { IsEmail, IsObject, IsOptional, IsString, IsUUID } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CheckoutDto {
  @ApiProperty({ description: 'Cart ID to check out' })
  @IsUUID()
  cartId!: string;

  @ApiProperty({ description: 'Customer email address' })
  @IsEmail()
  customerEmail!: string;

  @ApiProperty({ description: 'Shipping address details' })
  @IsObject()
  shippingAddress!: Record<string, any>;

  @ApiPropertyOptional({ description: 'Billing address details' })
  @IsOptional()
  @IsObject()
  billingAddress?: Record<string, any>;

  @ApiPropertyOptional({
    description: 'Payment token provided by client',
    default: 'mock_success',
  })
  @IsOptional()
  @IsString()
  paymentToken: string = 'mock_success';
}
