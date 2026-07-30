import { IsNotEmpty, IsString } from 'class-validator';
import { ErrorCode } from '@tiny-threads/shared';
import { field } from '../../common/errors/validation-field';

// Mirrors CustomerOAuthInitiateDto. The origin of `returnUrl` is checked
// against the requesting host in the controller (see
// assertReturnUrlMatchesRequestHost) — that can't be expressed as a
// standalone class-validator rule because it depends on the request.
export class MerchantAdminOAuthInitiateDto {
  @IsString({ message: field(ErrorCode.IS_STRING) })
  @IsNotEmpty({ message: field(ErrorCode.IS_NOT_EMPTY) })
  returnUrl!: string;
}
