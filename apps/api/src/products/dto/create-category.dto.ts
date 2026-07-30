import { IsString, IsNotEmpty, IsOptional, IsUUID } from 'class-validator';
import { ErrorCode } from '@tiny-threads/shared';
import { field } from '../../common/errors/validation-field';

export class CreateCategoryDto {
  @IsString({ message: field(ErrorCode.IS_STRING) })
  @IsNotEmpty({ message: field(ErrorCode.IS_NOT_EMPTY) })
  name!: string;

  @IsOptional()
  @IsUUID(undefined, { message: field(ErrorCode.IS_UUID) })
  parentId?: string;
}
