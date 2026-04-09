import { IsBoolean, IsOptional, IsString, MaxLength } from 'class-validator';

export class UpsertAgentDto {
  @IsString()
  @MaxLength(64)
  agentId!: string;

  @IsString()
  @MaxLength(128)
  displayName!: string;

  @IsOptional()
  @IsString()
  @MaxLength(128)
  team?: string;

  @IsOptional()
  @IsString()
  @MaxLength(128)
  role?: string;

  @IsOptional()
  @IsBoolean()
  enabled?: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  remark?: string;
}
