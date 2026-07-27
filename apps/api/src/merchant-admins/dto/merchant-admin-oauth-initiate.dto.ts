import { IsNotEmpty, IsString } from 'class-validator';

// Mirrors CustomerOAuthInitiateDto. The origin of `returnUrl` is checked
// against the requesting host in the controller (see
// assertReturnUrlMatchesRequestHost) — that can't be expressed as a
// standalone class-validator rule because it depends on the request.
export class MerchantAdminOAuthInitiateDto {
  @IsString()
  @IsNotEmpty()
  returnUrl!: string;
}
