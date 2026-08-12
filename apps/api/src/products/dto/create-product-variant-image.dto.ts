import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsOptional, IsBoolean } from 'class-validator';
import { Transform } from 'class-transformer';
import { ErrorCode } from '@tiny-threads/shared';
import { field } from '../../common/errors/validation-field';

export class CreateProductVariantImageDto {
  @ApiPropertyOptional({ description: 'Alt text for the image' })
  @IsOptional()
  @IsString({ message: field(ErrorCode.IS_STRING) })
  altText?: string;

  @ApiPropertyOptional({
    description: 'Whether this image should be set as primary',
  })
  @IsOptional()
  @Transform(({ value }: { value: unknown }): unknown => {
    if (value === 'true' || value === true) return true;
    if (value === 'false' || value === false) return false;
    return value;
  })
  @IsBoolean({ message: field(ErrorCode.IS_BOOLEAN) })
  isPrimary?: boolean;
}
