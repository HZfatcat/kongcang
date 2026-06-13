import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../common/prisma.service';
import type { SmtpConfig } from '@prisma/client';

@Injectable()
export class SettingsService {
  constructor(private readonly prisma: PrismaService) {}

  async getSmtpConfig(): Promise<SmtpConfig | null> {
    return this.prisma.smtpConfig.findUnique({ where: { key: 'default' } });
  }

  async saveSmtpConfig(data: {
    host: string;
    port: number;
    user: string;
    pass: string;
    from: string;
  }): Promise<SmtpConfig> {
    return this.prisma.smtpConfig.upsert({
      where: { key: 'default' },
      create: { ...data },
      update: { ...data },
    });
  }

  /** 获取运行时有效的 SMTP 配置：DB 优先，env 降级 */
  getEffectiveSmtpConfig(
    env: Record<string, string | undefined>,
  ): { host: string; port: number; user: string; pass: string; from: string } | null {
    const dbConfig = this._cachedDbConfig;
    const host = dbConfig?.host || env['SMTP_HOST'] || '';
    const user = dbConfig?.user || env['SMTP_USER'] || '';
    const pass = dbConfig?.pass || env['SMTP_PASS'] || '';
    if (!host || !user || !pass) return null;
    return {
      host,
      port: dbConfig?.port ?? Number(env['SMTP_PORT']) || 465,
      user,
      pass,
      from: dbConfig?.from || env['SMTP_FROM'] || user,
    };
  }

  private _cachedDbConfig: SmtpConfig | null = null;

  async refreshCache(): Promise<void> {
    this._cachedDbConfig = await this.getSmtpConfig();
  }
}
