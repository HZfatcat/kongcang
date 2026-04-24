import React, { useState } from 'react';
import ReactDOM from 'react-dom/client';
import 'antd/dist/reset.css';
import './styles/global.css';
import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { Layout, Menu, Avatar, Dropdown, Space, Typography } from 'antd';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { DashboardPage } from './pages/DashboardPage';
import { DemandSummaryPage } from './pages/DemandSummaryPage';
import { RequirementDetailPage } from './pages/RequirementDetailPage';
import { BugDetailPage } from './pages/BugDetailPage';
import { LoginPage } from './pages/LoginPage';
import { LoginVerifyPage } from './pages/LoginVerifyPage';
import { UsersPage } from './pages/UsersPage';
import { LogsPage } from './pages/LogsPage';
import { VotesPage } from './pages/VotesPage';
import { TicketsPage } from './pages/TicketsPage';

import { MetricsPage } from './pages/MetricsPage';
import { SessionDetailPage } from './pages/SessionDetailPage';
import { getToken, getLoginUser, clearSession } from './auth/session';
import {
  HomeOutlined,
  SmileOutlined,
  CheckCircleOutlined,
  DollarOutlined,
  SyncOutlined,
  TeamOutlined,
  FileTextOutlined,
  StarOutlined,
  UserOutlined,
  DashboardOutlined,
} from '@ant-design/icons';

const { Content, Sider, Header } = Layout;
const { Text } = Typography;
const queryClient = new QueryClient();

const DISABLE_AUTH = import.meta.env.VITE_DISABLE_AUTH === 'true';

function AppLayout({ children }: { children: React.ReactNode }) {
  const location = useLocation();
  const loginUser = getLoginUser();
  
  // 根据当前路径计算默认展开的菜单
  const getDefaultOpenKeys = (pathname: string): string[] => {
    if (pathname.startsWith('/udesc')) return ['udesc'];
    if (pathname.startsWith('/demand')) return ['demand'];
    return [];
  };
  
  // 使用受控模式管理展开状态
  const [openKeys, setOpenKeys] = useState<string[]>(() => getDefaultOpenKeys(location.pathname));
  const menuItems = [
    {
      key: '/',
      icon: <HomeOutlined />,
      label: '客服运营后台',
    },
    {
      key: '/satisfaction',
      icon: <SmileOutlined />,
      label: '用户满意度',
    },
    {
      key: 'udesc',
      icon: <DashboardOutlined />,
      label: 'Udesk 数据分析',
      children: [
        { key: '/udesc/votes', label: '评价分析' },
        { key: '/udesc/metrics', label: '会话指标' },
        { key: '/udesc/tickets', label: '工单分析' },
        { key: '/udesc/sessions', label: '咨询详情' },
      ],
    },
    {
      key: 'demand',
      icon: <CheckCircleOutlined />,
      label: '需求结单率',
      children: [
        { key: '/demand', label: '汇总 Dashboard' },
        { key: '/demand/requirements', label: '需求详情' },
        { key: '/demand/bugs', label: 'Bug 详情' },
      ],
    },
    {
      key: '/opportunity',
      icon: <DollarOutlined />,
      label: '商机管理',
    },
    {
      key: '/sync-udesk',
      icon: <SyncOutlined />,
      label: '数据同步（Udesk）',
    },
    {
      key: '/sync-zouwu',
      icon: <SyncOutlined />,
      label: '数据同步（驺吾）',
    },
    {
      key: '/users',
      icon: <TeamOutlined />,
      label: '人员管理',
    },
    {
      key: '/logs',
      icon: <FileTextOutlined />,
      label: '系统日志',
    },
  ];

  const userMenuItems = [
    {
      key: 'logout',
      label: '退出登录',
    },
  ];

  return (
    <Layout style={{ minHeight: '100vh' }}>
      <Sider 
        width={220} 
        theme="dark"
        style={{
          overflow: 'auto',
          height: '100vh',
          position: 'fixed',
          left: 0,
          top: 0,
          bottom: 0,
        }}
      >
        <div style={{
          height: 64,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          borderBottom: '1px solid rgba(255,255,255,0.1)',
        }}>
          <Text strong style={{ color: '#fff', fontSize: 18 }}>客服监控系统</Text>
        </div>
        <Menu
          theme="dark"
          mode="inline"
          selectedKeys={[location.pathname]}
          openKeys={openKeys}
          onOpenChange={(keys) => setOpenKeys(keys)}
          style={{ borderRight: 0, marginTop: 8 }}
          items={menuItems}
          onClick={({ key }) => {
            if (key.startsWith('/')) {
              window.location.href = key;
            }
          }}
        />
      </Sider>
      <Layout style={{ marginLeft: 220 }}>
        <Header style={{
          background: '#fff',
          padding: '0 24px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          boxShadow: '0 1px 4px rgba(0,0,0,0.08)',
          position: 'sticky',
          top: 0,
          zIndex: 10,
        }}>
          <Text style={{ fontSize: 16, fontWeight: 500 }}>
            {menuItems.find(item => item.key === location.pathname)?.label || '仪表盘'}
          </Text>
          {!DISABLE_AUTH && loginUser && (
            <Dropdown menu={{ 
              items: userMenuItems,
              onClick: ({ key }) => {
                if (key === 'logout') {
                  clearSession();
                  window.location.href = '/login';
                }
              }
            }}>
              <Space style={{ cursor: 'pointer' }}>
                <Avatar style={{ backgroundColor: '#1890ff' }}>
                  {loginUser.realname?.charAt(0) || 'U'}
                </Avatar>
                <Text>{loginUser.realname || '用户'}</Text>
              </Space>
            </Dropdown>
          )}
        </Header>
        <Content style={{ 
          background: '#f0f2f5', 
          minHeight: 'calc(100vh - 64px)',
          padding: 24,
        }}>
          <div className="fade-in" style={{ 
            background: '#fff', 
            padding: 24, 
            borderRadius: 8,
            minHeight: 'calc(100vh - 112px)',
          }}>
            {children}
          </div>
        </Content>
      </Layout>
    </Layout>
  );
}

function AppRoutes() {
  return (
    <Routes>
      <Route path="/" element={<AppLayout><DashboardPage initialMenuKey="satisfaction" /></AppLayout>} />
      <Route path="/satisfaction" element={<AppLayout><DashboardPage initialMenuKey="satisfaction" /></AppLayout>} />
      <Route path="/udesc/votes" element={<AppLayout><VotesPage /></AppLayout>} />
      <Route path="/udesc/metrics" element={<AppLayout><MetricsPage /></AppLayout>} />
      <Route path="/udesc/tickets" element={<AppLayout><TicketsPage /></AppLayout>} />
      <Route path="/udesc/sessions" element={<AppLayout><SessionDetailPage /></AppLayout>} />
      <Route path="/demand" element={<AppLayout><DemandSummaryPage /></AppLayout>} />
      <Route path="/demand/requirements" element={<AppLayout><RequirementDetailPage /></AppLayout>} />
      <Route path="/demand/bugs" element={<AppLayout><BugDetailPage /></AppLayout>} />
      <Route path="/opportunity" element={<AppLayout><DashboardPage initialMenuKey="opportunity" /></AppLayout>} />
      <Route path="/sync-udesk" element={<AppLayout><DashboardPage initialMenuKey="sync-udesc" /></AppLayout>} />
      <Route path="/sync-zouwu" element={<AppLayout><DashboardPage initialMenuKey="sync-zouwu" /></AppLayout>} />
      <Route path="/users" element={<AppLayout><UsersPage /></AppLayout>} />
      <Route path="/logs" element={<AppLayout><LogsPage /></AppLayout>} />
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
