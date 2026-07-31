import { IsInt, Min } from 'class-validator';
import { ErrorCode } from '@tiny-threads/shared';
import { field } from '../../common/errors/validation-field';

export class UpdateCartItemDto {
  @IsInt({ message: field(ErrorCode.IS_INT) })
  @Min(0, { message: field(ErrorCode.MIN) })
  qty!: number;
}
