import { IsUUID, IsInt, Min } from 'class-validator';

export class AddCartItemDto {
  @IsUUID()
  variantId!: string;

  @IsInt()
  @Min(1)
  qty!: number;
}
