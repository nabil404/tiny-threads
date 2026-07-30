import { IsString, IsNotEmpty, IsOptional, IsUUID } from 'class-validator';

export class CreateCategoryDto {
  @IsString()
  @IsNotEmpty()
  name!: string;

  @IsOptional()
  @IsUUID()
  parentId?: string;
}
