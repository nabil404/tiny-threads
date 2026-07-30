import { IsBoolean, IsOptional } from 'class-validator';

export class SetDefaultAddressDto {
  @IsBoolean()
  @IsOptional()
  defaultShipping?: boolean;

  @IsBoolean()
  @IsOptional()
  defaultBilling?: boolean;
}
