import { Controller, Get, Query } from '@nestjs/common';
import { GetStateQueryDto, WxLoginQueryDto } from './auth.dto';
import { AuthService } from './auth.service';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Get('wxlogin')
  wxLogin(@Query() query: WxLoginQueryDto) {
    return this.authService.wxLogin({
      code: query.code,
      appid: query.appid,
      state: query.state,
      corp: query.corp,
    });
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
