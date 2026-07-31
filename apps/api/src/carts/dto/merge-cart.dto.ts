import { IsUUID } from 'class-validator';
import { ErrorCode } from '@tiny-threads/shared';
import { field } from '../../common/errors/validation-field';

export class MergeCartDto {
  @IsUUID(undefined, { message: field(ErrorCode.IS_UUID) })
  guestSessionId!: string;
}
