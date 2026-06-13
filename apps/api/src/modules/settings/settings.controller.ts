import { Controller, Get, Put, Post, Body } from '@nestjs/common';
import { SettingsService } from './settings.service';
import * as dns from 'dns';
import * as net from 'net';
import * as tls from 'tls';
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
    const { host, port, user, pass, from, to } = body;
    if (!host || !user || !pass) {
      return { ok: false, message: '缺少必填项：host / user / pass' };
    }

    try {
      const { address: smtpIp } = await dns.promises.lookup(host, { family: 4 });
      const useSsl = port === 465;

      const socket = await new Promise<net.Socket>((resolve, reject) => {
        if (useSsl) {
          const tcp = net.connect(port, smtpIp);
          tcp.once('error', reject);
          const tlsSock = tls.connect(
            { socket: tcp, host, servername: host, rejectUnauthorized: false },
            () => resolve(tlsSock),
          );
          tlsSock.once('error', reject);
        } else {
          const sock = net.connect(port, smtpIp);
          sock.once('connect', () => resolve(sock));
          sock.once('error', reject);
        }
      });

      const transporter = nodemailer.createTransport({
        connection: socket,
      } as any);

      await transporter.verify();
      
      // 发送测试邮件
      await transporter.sendMail({
        from: from || user,
        to: to || user,
        subject: '📧 SMTP 配置测试邮件',
        text: '这是一封测试邮件，表示 SMTP 配置正确。\n\n如果收到此邮件，说明邮箱配置成功！',
      });

      socket.destroy();
      return { ok: true, message: 'SMTP 连接成功，测试邮件已发送' };
    } catch (err: any) {
      return { ok: false, message: `SMTP 测试失败: ${err.message || err}` };
    }
  }
}
