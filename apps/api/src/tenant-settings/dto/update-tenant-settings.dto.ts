import { IsBoolean, IsOptional } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class UpdateTenantSettingsDto {
  @ApiPropertyOptional({
    description: 'Whether guest checkout is enabled for the tenant storefront.',
    example: true,
  })
  @IsOptional()
  @IsBoolean()
  allowGuestCheckout?: boolean;
}
