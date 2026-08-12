import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsOptional, IsBoolean, IsInt } from 'class-validator';
import { ErrorCode } from '@tiny-threads/shared';
import { field } from '../../common/errors/validation-field';

export class UpdateProductVariantImageDto {
  @ApiPropertyOptional({ description: 'Alt text for the image' })
  @IsOptional()
  @IsString({ message: field(ErrorCode.IS_STRING) })
  altText?: string;

  @ApiPropertyOptional({ description: 'Whether this image is primary' })
  @IsOptional()
  @IsBoolean({ message: field(ErrorCode.IS_BOOLEAN) })
  isPrimary?: boolean;

  @ApiPropertyOptional({ description: 'Sort order integer' })
  @IsOptional()
  @IsInt({ message: field(ErrorCode.IS_INT) })
  sortOrder?: number;
}
