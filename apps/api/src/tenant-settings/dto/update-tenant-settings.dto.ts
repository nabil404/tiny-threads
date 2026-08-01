import { IsBoolean, IsNumber, IsOptional } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class UpdateTenantSettingsDto {
  @ApiPropertyOptional({
    description: 'Whether guest checkout is enabled for the tenant storefront.',
    example: true,
  })
  @IsOptional()
  @IsBoolean()
  allowGuestCheckout?: boolean;

  @ApiPropertyOptional({
    description: 'Platform fee percentage charged on transactions.',
    example: 2.5,
  })
  @IsOptional()
  @IsNumber()
  platformFeePercent?: number;
}
