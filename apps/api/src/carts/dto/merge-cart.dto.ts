import { IsUUID } from 'class-validator';

export class MergeCartDto {
  @IsUUID()
  guestSessionId!: string;
}
