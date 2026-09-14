import { IsArray, IsIn, IsOptional, IsString } from 'class-validator';

export class UpdateUserDto {
  @IsOptional()
  @IsIn(['employee', 'admin'])
  role?: 'employee' | 'admin';

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  officeIds?: string[];
}
