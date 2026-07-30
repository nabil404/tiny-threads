import { IsString, MinLength } from 'class-validator';
import { ErrorCode } from '@tiny-threads/shared';
import { field } from '../../common/errors/validation-field';

// email/role are deliberately NOT part of this DTO — they're derived
// server-side from the invite record the token resolves to (see
// MerchantAdminsAuthService.register()). A public, unauthenticated
// registration endpoint must never let the caller pick their own role or
// email; the invite (issued by an existing owner/admin via
// MerchantAdminsAuthService.inviteMember()) is the only source of truth for
// both.
export class RegisterMerchantUserDto {
  @IsString({ message: field(ErrorCode.IS_STRING) })
  token!: string;

  @MinLength(12, { message: field(ErrorCode.MIN_LENGTH) })
  password!: string;
}
