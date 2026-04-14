import React from 'react';
import ReactDOM from 'react-dom/client';
import 'antd/dist/reset.css';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { Layout, Menu } from 'antd';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { DashboardPage } from './pages/DashboardPage';
import { DemandSummaryPage } from './pages/DemandSummaryPage';
import { RequirementDetailPage } from './pages/RequirementDetailPage';
import { BugDetailPage } from './pages/BugDetailPage';
import { LoginPage } from './pages/LoginPage';
import { LoginVerifyPage } from './pages/LoginVerifyPage';
import { UsersPage } from './pages/UsersPage';
import { getToken } from './auth/session';

const { Content, Sider } = Layout;
const queryClient = new QueryClient();

const DISABLE_AUTH = import.meta.env.VITE_DISABLE_AUTH === 'true';

function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <Layout style={{ minHeight: '100vh' }}>
      <Sider width={220} theme="light">
        <Menu
          mode="inline"
          defaultSelectedKeys={['/']}
          defaultOpenKeys={['demand']}
          style={{ height: '100%', borderRight: 0 }}
          items={[
            {
              key: '/',
              label: '客服运营后台',
            },
            {
              key: '/satisfaction',
              label: '用户满意度',
            },
            {
              key: 'demand',
              label: '需求完成率',
              children: [
                { key: '/demand', label: '汇总 Dashboard' },
                { key: '/demand/requirements', label: '需求详情' },
                { key: '/demand/bugs', label: 'Bug 详情' },
              ],
            },
            {
              key: '/opportunity',
              label: '商机管理',
            },
            {
              key: '/sync-udesk',
              label: '数据同步（Udesk）',
            },
            {
              key: '/sync-zouwu',
              label: '数据同步（驺吾）',
            },
            {
              key: '/users',
              label: '人员管理',
            },
          ]}
          onClick={({ key }) => {
            if (key.startsWith('/')) {
              window.location.href = key;
            }
          }}
        />
      </Sider>
      <Layout>
        <Content style={{ background: '#fff', minHeight: '100%' }}>
          {children}
        </Content>
      </Layout>
    </Layout>
  );
}

function AppRoutes() {
  return (
    <Routes>
      <Route path="/" element={<AppLayout><DashboardPage /></AppLayout>} />
      <Route path="/demand" element={<AppLayout><DemandSummaryPage /></AppLayout>} />
      <Route path="/demand/requirements" element={<AppLayout><RequirementDetailPage /></AppLayout>} />
      <Route path="/demand/bugs" element={<AppLayout><BugDetailPage /></AppLayout>} />
      <Route path="/users" element={<AppLayout><UsersPage /></AppLayout>} />
    </Routes>
  );
}

function App() {
  if (!DISABLE_AUTH) {
    const pathname = window.location.pathname;
    if (pathname === '/login/verify') {
      return <LoginVerifyPage />;
    }
    if (pathname === '/login') {
      return <LoginPage />;
    }
    if (!getToken()) {
      return <LoginPage />;
    }
  }
  return (
    <BrowserRouter>
      <AppRoutes />
    </BrowserRouter>
  );
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <App />
    </QueryClientProvider>
  </React.StrictMode>,
);
