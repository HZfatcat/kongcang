import { Type } from 'class-transformer';
import { IsBoolean, IsDateString, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';

export class UdescDateRangeDto {
  @IsOptional()
  @IsDateString()
  startDate?: string;

  @IsOptional()
  @IsDateString()
  endDate?: string;
}

export class UdescSessionQueryDto extends UdescDateRangeDto {
  @IsOptional()
  @IsString()
  agentId?: string;

  @IsOptional()
  @IsString()
  agentIds?: string;

  @IsOptional()
  @IsString()
  sessionId?: string;

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

export class UdescCustomerQueryDto {
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

  @IsOptional()
  @IsString()
  search?: string;

  @IsOptional()
  @IsString()
  enterprise?: string;
}

export class UdescAgentQueryDto {
  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  enabled?: boolean;
}

export class UdescAgentPerformanceDto extends UdescDateRangeDto {
  @IsString()
  agentId!: string;
}

export class UdescVoteQueryDto extends UdescDateRangeDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(5)
  minRating?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(5)
  maxRating?: number;

  @IsOptional()
  @IsString()
  sortBy?: string;

  @IsOptional()
  @IsString()
  sortOrder?: 'asc' | 'desc';

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

  @IsOptional()
  @IsString()
  sessionId?: string;
}

export class UdescMetricsQueryDto extends UdescDateRangeDto {
  @IsOptional()
  @IsString()
  agentId?: string;

  @IsOptional()
  @IsString()
  agentIds?: string;

  @IsOptional()
  @IsString()
  sessionId?: string;

  @IsOptional()
  @IsString()
  sortBy?: string;

  @IsOptional()
  @IsString()
  sortOrder?: 'asc' | 'desc';

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

export class UdescTicketQueryDto extends UdescDateRangeDto {
  @IsOptional()
  @IsString()
  status?: string;

  @IsOptional()
  @IsString()
  assigneeId?: string;

  @IsOptional()
  @IsString()
  priority?: string;

  @IsOptional()
  @IsString()
  sortBy?: string;

  @IsOptional()
  @IsString()
  sortOrder?: 'asc' | 'desc';

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

export class UdescHeatmapQueryDto extends UdescDateRangeDto {
  @IsOptional()
  @IsString()
  agentId?: string;

  @IsOptional()
  @IsString()
  type?: 'session' | 'ticket'; // 会话或工单
}

