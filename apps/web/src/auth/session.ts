const TOKEN_KEY = 'kefumonitor_token';
const USER_KEY = 'kefumonitor_user';

export interface LoginUser {
  id: string;
  corpWxUserId: string;
  realname: string;
  avatar: string;
  token: string;
}

export function getToken() {
  return localStorage.getItem(TOKEN_KEY);
}

export function setLoginUser(user: LoginUser) {
  localStorage.setItem(TOKEN_KEY, user.token);
  localStorage.setItem(USER_KEY, JSON.stringify(user));
}

export function getLoginUser(): LoginUser | null {
  const raw = localStorage.getItem(USER_KEY);
  if (!raw) {
    return null;
  }
  try {
    return JSON.parse(raw) as LoginUser;
  } catch {
    return null;
  }
}

export function clearSession() {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(USER_KEY);
}
