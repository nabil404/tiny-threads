import { IsBoolean, IsInt, IsOptional, IsString, Min } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { ErrorCode } from '@tiny-threads/shared';
import { field } from '../../common/errors/validation-field';

export class UpdateTenantSettingsDto {
  @ApiPropertyOptional({
    description: 'Whether guest checkout is enabled for the tenant storefront.',
    example: true,
  })
  @IsOptional()
  @IsBoolean({ message: field(ErrorCode.IS_BOOLEAN) })
  allowGuestCheckout?: boolean;

  @ApiPropertyOptional({
    description: 'Default currency code for the tenant store.',
    example: 'USD',
  })
  @IsOptional()
  @IsString({ message: field(ErrorCode.IS_STRING) })
  defaultCurrencyCode?: string;

  @ApiPropertyOptional({
    description:
      'Variant stock at or below this (and above zero) counts as low stock.',
    example: 10,
  })
  @IsOptional()
  @IsInt({ message: field(ErrorCode.IS_INT) })
  @Min(0, { message: field(ErrorCode.MIN) })
  lowStockThreshold?: number;
}
