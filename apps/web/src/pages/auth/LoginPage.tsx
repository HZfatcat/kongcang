import { useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Card, Space, Typography } from 'antd';
import { accountGetState } from '../../api/account';
import { setLoginUser } from '../../auth/session';

const DEFAULT_CORP: 'corp' | 'csdn' = 'corp';

function randomState() {
  return Math.random().toString(36).slice(2, 18);
}

function resolveCorp(): 'corp' | 'csdn' {
  const params = new URLSearchParams(window.location.search);
  const corpFromUrl = params.get('corp');
  if (corpFromUrl === 'corp' || corpFromUrl === 'csdn') {
    sessionStorage.setItem('loginCorp', corpFromUrl);
    return corpFromUrl;
  }
  const corpFromSession = sessionStorage.getItem('loginCorp');
  if (corpFromSession === 'corp' || corpFromSession === 'csdn') {
    return corpFromSession;
  }
  return DEFAULT_CORP;
}

function getOauthUrl(corp: 'corp' | 'csdn', state: string) {
  const appid =
    corp === 'csdn' ? import.meta.env.VITE_WECOM_CSDN_APPID : import.meta.env.VITE_WECOM_APPID;
  const agentid =
    corp === 'csdn'
      ? import.meta.env.VITE_WECOM_CSDN_AGENTID
      : import.meta.env.VITE_WECOM_AGENTID;
  const configuredRedirectBase = (import.meta.env.VITE_WECOM_REDIRECT_BASE_URL ?? '').trim();
  const redirectBase = (configuredRedirectBase || window.location.origin).replace(/\/$/, '');
  const redirectUri = encodeURIComponent(
    `${redirectBase}/login/verify?corp=${corp}&redirect=${encodeURIComponent('/')}`,
  );
  // Use snsapi_base for internal member auth to reliably obtain UserId.
  return `https://open.weixin.qq.com/connect/oauth2/authorize?appid=${appid}&redirect_uri=${redirectUri}&response_type=code&scope=snsapi_base&agentid=${agentid}&state=${state}#wechat_redirect`;
}

export function LoginPage() {
  const [corp] = useState<'corp' | 'csdn'>(() => resolveCorp());
  const [state] = useState(() => randomState());
  const [error, setError] = useState<string | null>(null);
  const intervalRef = useRef<number | null>(null);

  const oauthUrl = useMemo(() => getOauthUrl(corp, state), [corp, state]);
  const qrUrl = useMemo(
    () =>
      `https://api.qrserver.com/v1/create-qr-code/?size=240x240&data=${encodeURIComponent(oauthUrl)}`,
    [oauthUrl],
  );

  useEffect(() => {
    if (oauthUrl.includes('appid=undefined') || oauthUrl.includes('agentid=undefined')) {
      setError('企微登录配置缺失，请联系管理员补充环境变量。');
      return;
    }
    const inWxWork = /wxwork/i.test(navigator.userAgent);
    if (inWxWork) {
      window.location.href = oauthUrl;
      return;
    }

    intervalRef.current = window.setInterval(async () => {
      try {
        const user = await accountGetState(state);
        if (!user) {
          return;
        }
        setLoginUser(user);
        window.location.href = '/';
      } catch {
        // ignore polling error
      }
    }, 2000);

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, [oauthUrl, state]);

  const corpLabel = corp === 'csdn' ? '创新乐知' : '开源共创';

  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <Card title="企业微信登录" style={{ width: 420 }}>
        <Space direction="vertical" size="middle" style={{ width: '100%' }}>
          <Typography.Text>请使用 {corpLabel} 企业微信扫码登录。</Typography.Text>
          {error && <Alert type="error" message={error} showIcon />}
          <div style={{ display: 'flex', justifyContent: 'center' }}>
            <img src={qrUrl} alt="企业微信登录二维码" width={240} height={240} />
          </div>
        </Space>
      </Card>
    </div>
  );
}
