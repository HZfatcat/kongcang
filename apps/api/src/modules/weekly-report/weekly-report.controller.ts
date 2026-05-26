import { Body, Controller, HttpException, Post } from '@nestjs/common';
import { IsOptional, IsString } from 'class-validator';
import { WeeklyReportService } from './weekly-report.service';

export class SendReportDto {
  @IsOptional() @IsString() startDate?: string;
  @IsOptional() @IsString() endDate?: string;
  @IsOptional() @IsString() summary?: string;
  @IsOptional() @IsString() nextPlan?: string;
  @IsOptional() @IsString() recipientEmail?: string;
  @IsOptional() @IsString() subject?: string;
  @IsOptional() @IsString() type?: 'team' | 'personal';
  @IsOptional() @IsString() agentName?: string;
  @IsOptional() topQuestions?: { name: string; count: number; pct: number }[];
  @IsOptional() risks?: string[];
  @IsOptional() suggestions?: string[];
}

@Controller('weekly-report')
export class WeeklyReportController {
  constructor(private readonly service: WeeklyReportService) {}

  /** 生成精美 HTML 周报（不发送，仅返回 HTML 字符串） */
  @Post('preview')
  async preview(@Body() dto: SendReportDto) {
    try {
      const html = await this.service.generateHtml({
        startDate: dto.startDate,
        endDate: dto.endDate,
        summary: dto.summary,
        nextPlan: dto.nextPlan,
        type: dto.type ?? 'team',
        agentName: dto.agentName,
        topQuestions: dto.topQuestions,
        risks: dto.risks,
        suggestions: dto.suggestions,
      });
      return { html };
    } catch (e: any) {
      throw new HttpException(e.message ?? '生成周报失败', 500);
    }
  }

  /** 生成 HTML 并通过 SMTP 发送邮件 */
  @Post('send')
  async send(@Body() dto: SendReportDto) {
    console.log('[WeeklyReport] send body:', JSON.stringify(dto));
    if (!dto.recipientEmail) {
      throw new HttpException('请指定收件人邮箱 recipientEmail', 400);
    }
    try {
      const html = await this.service.generateHtml({
        startDate: dto.startDate,
        endDate: dto.endDate,
        summary: dto.summary,
        nextPlan: dto.nextPlan,
        type: dto.type ?? 'team',
        agentName: dto.agentName,
        topQuestions: dto.topQuestions,
        risks: dto.risks,
        suggestions: dto.suggestions,
      });
      await this.service.sendEmail({
        to: dto.recipientEmail,
        subject: dto.subject ?? `客服部周报`,
        html,
      });
      return { success: true, message: '邮件已发送' };
    } catch (e: any) {
      throw new HttpException(e.message ?? '发送邮件失败', 500);
    }
  }
}
