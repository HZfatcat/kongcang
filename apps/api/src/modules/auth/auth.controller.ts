import { Controller, Get, Logger, Query } from '@nestjs/common';
import { GetStateQueryDto, WxLoginQueryDto } from './auth.dto';
import { AuthService } from './auth.service';

@Controller('auth')
export class AuthController {
  private readonly logger = new Logger(AuthController.name);

  constructor(private readonly authService: AuthService) {}

  @Get('wxlogin')
  async wxLogin(@Query() query: WxLoginQueryDto) {
    const corp = query.corp ?? 'corp';
    const codePreview = query.code ? `${query.code.slice(0, 6)}***` : '-';
    this.logger.log(
      `wxlogin request corp=${corp} state=${query.state} code=${codePreview}`,
    );
    try {
      const user = await this.authService.wxLogin({
        code: query.code,
        appid: query.appid,
        state: query.state,
        corp: query.corp,
      });
      this.logger.log(`wxlogin success corp=${corp} userId=${user.id}`);
      return user;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.warn(
        `wxlogin failed corp=${corp} state=${query.state} code=${codePreview} reason=${message}`,
      );
      throw error;
    }
  }

  @Get('csdnwxlogin')
  csdnWxLogin(@Query() query: WxLoginQueryDto) {
    return this.authService.wxLogin({
      code: query.code,
      appid: query.appid,
      state: query.state,
      corp: 'csdn',
    });
  }

  @Get('getState')
  getState(@Query() query: GetStateQueryDto) {
    return this.authService.getStateUser(query.state);
  }
}
