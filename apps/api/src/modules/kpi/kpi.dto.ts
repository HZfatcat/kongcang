import { IsDateString, IsIn, IsOptional } from 'class-validator';

export class DateRangeQueryDto {
  @IsOptional()
  @IsDateString()
  startDate?: string;

  @IsOptional()
  @IsDateString()
  endDate?: string;

  @IsOptional()
  agentName?: string;
}

export class FunnelQueryDto extends DateRangeQueryDto {
  @IsOptional()
  @IsIn(['day', 'week', 'month'])
  granularity?: 'day' | 'week' | 'month';
}

export class ProductModuleQueryDto extends DateRangeQueryDto {
  @IsOptional()
  @IsIn(['0', '1'])
  issueType?: string; // 0=需求, 1=Bug
}
