import { IsBoolean, IsOptional } from 'class-validator';
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
}

