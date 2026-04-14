import { IsBoolean, IsOptional, IsString, MaxLength } from 'class-validator';

export class UpsertWecomEmployeeDto {
  @IsString()
  @MaxLength(64)
  userId!: string; // 企微 userId

  @IsOptional()
  @IsString()
  @MaxLength(64)
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  department?: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  position?: string;

  @IsOptional()
  @IsString()
  @MaxLength(32)
  mobile?: string;

  @IsOptional()
  @IsString()
  @MaxLength(128)
  email?: string;

  @IsOptional()
  @IsString()
  @MaxLength(512)
  avatar?: string;

  @IsOptional()
  @IsBoolean()
  enabled?: boolean;

  @IsOptional()
  @IsBoolean()
  isCustomerService?: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(256)
  remark?: string;
}
