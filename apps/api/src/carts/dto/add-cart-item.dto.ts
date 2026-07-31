import { IsUUID, IsInt, Min } from 'class-validator';
import { ErrorCode } from '@tiny-threads/shared';
import { field } from '../../common/errors/validation-field';

export class AddCartItemDto {
  @IsUUID(undefined, { message: field(ErrorCode.IS_UUID) })
  variantId!: string;

  @IsInt({ message: field(ErrorCode.IS_INT) })
  @Min(1, { message: field(ErrorCode.MIN) })
  qty!: number;
}
