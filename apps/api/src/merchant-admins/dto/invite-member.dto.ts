import { IsEmail, IsIn } from 'class-validator';
import { ErrorCode } from '@tiny-threads/shared';
import { field } from '../../common/errors/validation-field';

export class InviteMemberDto {
  @IsEmail(undefined, { message: field(ErrorCode.IS_EMAIL) })
  email!: string;

  @IsIn(['owner', 'admin', 'staff', 'viewer'], {
    message: field(ErrorCode.IS_IN),
  })
  role!: string;
}
