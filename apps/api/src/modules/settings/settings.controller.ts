import { Controller, Get, Put, Post, Body } from '@nestjs/common';
import { SettingsService } from './settings.service';
import * as dns from 'dns';
import * as nodemailer from 'nodemailer';

@Controller('settings')
export class SettingsController {
  constructor(private readonly settingsService: SettingsService) {}

  @Get('smtp')
  async getSmtp() {
    const config = await this.settingsService.getSmtpConfig();
    return config ?? { host: '', port: 465, user: '', pass: '', from: '' };
  }

  @Put('smtp')
  async saveSmtp(
    @Body() body: { host: string; port: number; user: string; pass: string; from: string },
  ) {
    await this.settingsService.saveSmtpConfig(body);
    await this.settingsService.refreshCache();
    return { ok: true };
  }

  @Post('smtp/test')
  async testSmtp(
    @Body() body: { host: string; port: number; user: string; pass: string; from: string; to: string },
  ) {
    const { host, port, user, pass, to } = body;
    if (!host || !user || !pass) {
      return { ok: false, message: '缺少必填项：host / user / pass' };
    }

    try {
      // 使用系统 DNS 解析（与发送邮件一致）
      const { address: smtpIp } = await dns.promises.lookup(host, { family: 4 });

      const transporter = nodemailer.createTransport({
        host: smtpIp,
        port,
        secure: port === 465,
        auth: { user, pass },
        tls: { rejectUnauthorized: false, servername: host },
        connectionTimeout: 15000,
        greetingTimeout: 10000,
        socketTimeout: 15000,
        logger: false,
      } as any);

      await transporter.verify();

      await transporter.sendMail({
        from: user,
        to: to || user,
        subject: '📧 SMTP 配置测试邮件',
        text: `这是一封测试邮件，表示 SMTP 配置正确。\n\n发件账号：${user}\n如果收到此邮件，说明邮箱配置成功！`,
      });

      return { ok: true, message: 'SMTP 连接成功，测试邮件已发送' };
    } catch (err: any) {
      return { ok: false, message: `SMTP 测试失败: ${err.message || err}` };
    }
  }
}
