import { IsOptional, IsString, Matches, MaxLength } from 'class-validator';

export class ZouwuFeedbackStatisticsQueryDto {
  @IsOptional()
  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}\s\d{2}:\d{2}:\d{2}$/)
  start?: string;

  @IsOptional()
  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}\s\d{2}:\d{2}:\d{2}$/)
  end?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2048)
  token?: string;
}
