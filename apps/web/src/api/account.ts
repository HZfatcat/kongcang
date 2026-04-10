import { apiClient } from './client';

export interface WxLoginParams {
  code: string;
  appid: string;
  state: string;
  corp?: 'corp' | 'csdn';
}

export interface LoginUser {
  id: string;
  corpWxUserId: string;
  realname: string;
  avatar: string;
  token: string;
}

export async function accountWxLogin(params: WxLoginParams) {
  const resp = await apiClient.get<LoginUser>('/auth/wxlogin', { params });
  return resp.data;
}

export async function accountGetState(state: string) {
  const resp = await apiClient.get<LoginUser | null>('/auth/getState', {
    params: { state },
  });
  return resp.data;
}
