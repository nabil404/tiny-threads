import { IsIn, ValidateIf } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { ErrorCode, SUPPORTED_LOCALES } from '@tiny-threads/shared';
import { field } from '../../common/errors/validation-field';

export class UpdateMerchantAdminLocaleDto {
  @ApiProperty({
    description:
      'Preferred UI locale, or null to clear the preference and fall back to the client default.',
    example: 'en',
    nullable: true,
  })
  @ValidateIf((o: UpdateMerchantAdminLocaleDto) => o.locale !== null)
  @IsIn(SUPPORTED_LOCALES, { message: field(ErrorCode.IS_IN) })
  locale!: string | null;
}

export class MerchantAdminLocaleResponseDto {
  @ApiProperty({ example: 'en', nullable: true })
  locale!: string | null;
}
