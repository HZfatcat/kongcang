import { useEffect, useMemo, useState } from 'react';
import { Alert, Button, Card, Space, Spin, Typography } from 'antd';
import { AxiosError } from 'axios';
import { accountWxLogin } from '../api/account';
import { setLoginUser } from '../auth/session';

function getQueryValue(key: string) {
  const params = new URLSearchParams(window.location.search);
  return params.get(key) ?? '';
}

export function LoginVerifyPage() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const code = useMemo(() => getQueryValue('code'), []);
  const state = useMemo(() => getQueryValue('state'), []);
  const corp = useMemo(() => (getQueryValue('corp') === 'csdn' ? 'csdn' : 'corp'), []);
  const redirect = useMemo(() => getQueryValue('redirect') || '/', []);
  const appid =
    corp === 'csdn' ? import.meta.env.VITE_WECOM_CSDN_APPID : import.meta.env.VITE_WECOM_APPID;

  const resolveErrorMessage = (error: unknown) => {
    if (error instanceof AxiosError) {
      const payload = error.response?.data as { message?: string | string[] } | undefined;
      const message = payload?.message;
      if (Array.isArray(message)) {
        return message.join('；');
      }
      if (typeof message === 'string' && message.trim().length > 0) {
        return message;
      }
      if (error.message) {
        return error.message;
      }
    }
    return '身份验证失败，请重试。';
  };

  const doLogin = async () => {
    if (!code || !state || !appid) {
      setError('登录参数缺失，请返回登录页重试。');
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const user = await accountWxLogin({
        code,
        appid,
        state,
        corp,
      });
      setLoginUser(user);
      window.location.href = redirect;
    } catch (e) {
      setError(resolveErrorMessage(e));
      setLoading(false);
    }
  };

  useEffect(() => {
    void doLogin();
  }, []);

  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <Card title="企业微信身份验证" style={{ width: 420 }}>
        <Space direction="vertical" size="middle" style={{ width: '100%' }}>
          {loading && (
            <div style={{ textAlign: 'center' }}>
              <Spin />
              <Typography.Paragraph style={{ marginTop: 16, marginBottom: 0 }}>
                正在验证身份信息...
              </Typography.Paragraph>
            </div>
          )}
          {error && <Alert type="error" message={error} showIcon />}
          {error && (
            <Button type="primary" block onClick={() => void doLogin()}>
              重试
            </Button>
          )}
        </Space>
      </Card>
    </div>
  );
}
