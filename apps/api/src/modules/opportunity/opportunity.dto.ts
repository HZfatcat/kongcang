import { Type } from 'class-transformer';
import {
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  IsDateString,
  Max,
  MaxLength,
  Min,
  IsInt,
} from 'class-validator';
import { OpportunitySourceType, OpportunityStatus } from '@prisma/client';

export class OpportunityQueryDto {
  @IsOptional()
  @IsDateString()
  startDate?: string;

  @IsOptional()
  @IsDateString()
  endDate?: string;

  @IsOptional()
  @IsEnum(OpportunityStatus)
  status?: OpportunityStatus;

  @IsOptional()
  @IsEnum(OpportunitySourceType)
  sourceType?: OpportunitySourceType;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  agentId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  keyword?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(200)
  pageSize?: number;
}

export class UpsertOpportunityDto {
  @IsOptional()
  @IsString()
  id?: string;

  @IsString()
  @MaxLength(200)
  title!: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;

  @IsOptional()
  @IsEnum(OpportunitySourceType)
  sourceType?: OpportunitySourceType;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  sourceSessionId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  agentId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(128)
  customerName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  contactInfo?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  estimatedAmount?: number;

  @IsOptional()
  @IsEnum(OpportunityStatus)
  status?: OpportunityStatus;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  nextAction?: string;

  // 新增字段
  @IsOptional()
  @IsString()
  @MaxLength(128)
  username?: string;

  @IsOptional()
  @IsString()
  @MaxLength(128)
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(32)
  phone?: string;

  @IsOptional()
  @IsString()
  @MaxLength(128)
  email?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  companyName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  requestType?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  requestDetails?: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  feedbackChannel?: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  feedbackPerson?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  feedbackResult?: string;
}

export class UpdateOpportunityStatusDto {
  @IsEnum(OpportunityStatus)
  status!: OpportunityStatus;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  closeReason?: string;
}
