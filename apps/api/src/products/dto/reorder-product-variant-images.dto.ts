import { ApiProperty } from '@nestjs/swagger';
import { IsArray, ArrayNotEmpty, IsUUID } from 'class-validator';
import { ErrorCode } from '@tiny-threads/shared';
import { field } from '../../common/errors/validation-field';

export class ReorderProductVariantImagesDto {
  @ApiProperty({
    description: 'Ordered array of image UUIDs for the variant',
    type: [String],
  })
  @IsArray({ message: field(ErrorCode.IS_ARRAY) })
  @ArrayNotEmpty({ message: field(ErrorCode.IS_NOT_EMPTY) })
  @IsUUID('all', { each: true, message: field(ErrorCode.IS_UUID) })
  imageIds!: string[];
}
