import { Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios, { AxiosError } from 'axios';
import { createHmac } from 'crypto';
import { PrismaService } from '../../common/prisma.service';

type CorpType = 'corp' | 'csdn';

interface WecomUserInfoResp {
  errcode: number;
  errmsg?: string;
  UserId?: string;
  OpenId?: string;
}

interface WecomUserDetailResp {
  errcode: number;
  errmsg?: string;
  userid?: string;
  name?: string;
  avatar?: string;
}

export interface LoginUser {
  id: string;
  corpWxUserId: string;
  realname: string;
  avatar: string;
  token: string;
}

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);
  private readonly tokenCache = new Map<CorpType, { accessToken: string; expiresAt: number }>();
  private readonly stateUserMap = new Map<string, LoginUser>();
  private readonly stateTtlMs = 5 * 60 * 1000;

  constructor(
    private readonly configService: ConfigService,
    private readonly prisma: PrismaService,
  ) {}

  async wxLogin(payload: {
    code: string;
    appid: string;
    state: string;
    corp?: CorpType;
  }): Promise<LoginUser> {
    const corp: CorpType = payload.corp ?? 'corp';
    this.validateAppid(corp, payload.appid);
    const userId = await this.fetchWecomUserId(corp, payload.code);
    if (!userId) {
      throw new UnauthorizedException('未获取到企业微信用户标识');
    }

    // 从 WecomEmployee 表验证登录权限
    const employee = await this.prisma.wecomEmployee.findUnique({
      where: { userId },
    });
    if (!employee || !employee.enabled) {
      throw new UnauthorizedException('当前企微账号未开通系统权限');
    }

    const user = {
      id: employee.userId,
      corpWxUserId: userId,
      realname: employee.name ?? userId,
      avatar: employee.avatar ?? '',
      token: this.signToken({
        id: employee.userId,
        corpWxUserId: userId,
        corp,
      }),
    };

    const detail = await this.fetchWecomUserDetail(corp, userId).catch(() => null);
    if (detail?.avatar) {
      user.avatar = detail.avatar;
    }
    if (detail?.name) {
      user.realname = detail.name;
    }

    this.stateUserMap.set(payload.state, user);
    setTimeout(() => this.stateUserMap.delete(payload.state), this.stateTtlMs);
    return user;
  }

  getStateUser(state: string): LoginUser | null {
    return this.stateUserMap.get(state) ?? null;
  }

  private signToken(payload: { id: string; corpWxUserId: string; corp: CorpType }): string {
    const secret = this.configService.get<string>('AUTH_TOKEN_SECRET') ?? 'kefumonitor-auth-secret';
    const body = {
      ...payload,
      iat: Date.now(),
    };
    const encodedBody = Buffer.from(JSON.stringify(body)).toString('base64url');
    const sign = createHmac('sha256', secret).update(encodedBody).digest('hex');
    return `${encodedBody}.${sign}`;
  }

  private async getAccessToken(corp: CorpType): Promise<string> {
    const now = Date.now();
    const cached = this.tokenCache.get(corp);
    if (cached && cached.expiresAt > now) {
      return cached.accessToken;
    }

    const corpid = this.configService.get<string>(
      corp === 'csdn' ? 'WECOM_CSDN_CORPID' : 'WECOM_CORP_CORPID',
    );
    const secret = this.configService.get<string>(
      corp === 'csdn' ? 'WECOM_CSDN_SECRET' : 'WECOM_CORP_SECRET',
    );
    if (!corpid || !secret) {
      throw new UnauthorizedException('企业微信配置缺失，请检查后端环境变量');
    }

    const resp = await this.safeGet<{ errcode: number; access_token?: string; expires_in?: number; errmsg?: string }>(
      'https://qyapi.weixin.qq.com/cgi-bin/gettoken',
      { corpid, corpsecret: secret },
      '获取企业微信 access_token 失败',
    );
    if (resp.data.errcode !== 0 || !resp.data.access_token) {
      throw new UnauthorizedException(`获取企业微信 access_token 失败: ${resp.data.errmsg ?? 'unknown'}`);
    }

    const expiresInSeconds = Math.max((resp.data.expires_in ?? 7200) - 200, 60);
    this.tokenCache.set(corp, {
      accessToken: resp.data.access_token,
      expiresAt: now + expiresInSeconds * 1000,
    });
    return resp.data.access_token;
  }

  private async fetchWecomUserId(corp: CorpType, code: string): Promise<string | null> {
    const accessToken = await this.getAccessToken(corp);
    const resp = await this.safeGet<WecomUserInfoResp>(
      'https://qyapi.weixin.qq.com/cgi-bin/auth/getuserinfo',
      { access_token: accessToken, code },
      '企业微信 code 校验请求失败',
    );
    if (resp.data.errcode !== 0) {
      throw new UnauthorizedException(`企业微信 code 校验失败: ${resp.data.errmsg ?? 'unknown'}`);
    }
    const payload = resp.data as WecomUserInfoResp & {
      userid?: string;
      openid?: string;
      userId?: string;
      openId?: string;
    };
    const userId =
      payload.UserId ??
      payload.userid ??
      payload.userId ??
      null;
    const openId =
      payload.OpenId ??
      payload.openid ??
      payload.openId ??
      null;

    if (!userId && openId) {
      throw new UnauthorizedException(
        '企业微信仅返回 OpenId，未返回 UserId。请确认扫码账号为企业内部成员，并检查应用授权范围与可见范围配置。',
      );
    }
    if (!userId) {
      this.logger.warn(
        `getuserinfo missing user id corp=${corp} keys=${Object.keys(payload).join(',')}`,
      );
    }
    return userId;
  }

  private async fetchWecomUserDetail(corp: CorpType, userId: string): Promise<WecomUserDetailResp | null> {
    const accessToken = await this.getAccessToken(corp);
    const resp = await this.safeGet<WecomUserDetailResp>(
      'https://qyapi.weixin.qq.com/cgi-bin/user/get',
      { access_token: accessToken, userid: userId },
      '获取企业微信用户详情失败',
    );
    if (resp.data.errcode !== 0) {
      return null;
    }
    return resp.data;
  }

  private async safeGet<T>(url: string, params: Record<string, string>, scene: string) {
    try {
      return await axios.get<T>(url, { params, timeout: 10000 });
    } catch (error) {
      if (error instanceof AxiosError) {
        const status = error.response?.status;
        const respBody =
          typeof error.response?.data === 'string'
            ? error.response?.data
            : JSON.stringify(error.response?.data ?? {});
        if (this.configService.get<string>('NODE_ENV') === 'production') {
          throw new UnauthorizedException(`${scene}: 请求企业微信失败`);
        }
        throw new UnauthorizedException(`${scene}: HTTP ${status ?? 'UNKNOWN'} ${respBody || error.message}`);
      }
      throw new UnauthorizedException(`${scene}: ${String(error)}`);
    }
  }

  private validateAppid(corp: CorpType, appid: string) {
    const expectedAppid = this.configService.get<string>(
      corp === 'csdn' ? 'VITE_WECOM_CSDN_APPID' : 'VITE_WECOM_APPID',
    );
    if (!expectedAppid) {
      return;
    }
    if (appid !== expectedAppid) {
      throw new UnauthorizedException('企业微信 appid 与当前主体不匹配');
    }
  }
}
