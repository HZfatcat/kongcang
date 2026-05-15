import React, { useState, Suspense } from 'react';
import ReactDOM from 'react-dom/client';
import 'antd/dist/reset.css';
import './styles/global.css';
import { BrowserRouter, Routes, Route, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { Layout, Menu, Avatar, Dropdown, Space, Typography, Spin } from 'antd';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const DashboardPage = React.lazy(() => import('./pages/DashboardPage').then(m => ({ default: m.DashboardPage })));
const DemandSummaryPage = React.lazy(() => import('./pages/DemandSummaryPage').then(m => ({ default: m.DemandSummaryPage })));
const RequirementDetailPage = React.lazy(() => import('./pages/RequirementDetailPage').then(m => ({ default: m.RequirementDetailPage })));
const BugDetailPage = React.lazy(() => import('./pages/BugDetailPage').then(m => ({ default: m.BugDetailPage })));
const WeeklyReportPage = React.lazy(() => import('./pages/WeeklyReportPage').then(m => ({ default: m.WeeklyReportPage })));
const LoginPage = React.lazy(() => import('./pages/LoginPage').then(m => ({ default: m.LoginPage })));
const LoginVerifyPage = React.lazy(() => import('./pages/LoginVerifyPage').then(m => ({ default: m.LoginVerifyPage })));
const UsersPage = React.lazy(() => import('./pages/UsersPage').then(m => ({ default: m.UsersPage })));
const LogsPage = React.lazy(() => import('./pages/LogsPage').then(m => ({ default: m.LogsPage })));
const VotesPage = React.lazy(() => import('./pages/VotesPage').then(m => ({ default: m.VotesPage })));
const TicketsPage = React.lazy(() => import('./pages/TicketsPage').then(m => ({ default: m.TicketsPage })));
const HeatmapPage = React.lazy(() => import('./pages/HeatmapPage').then(m => ({ default: m.HeatmapPage })));
const MetricsPage = React.lazy(() => import('./pages/MetricsPage').then(m => ({ default: m.MetricsPage })));
const SessionDetailPage = React.lazy(() => import('./pages/SessionDetailPage').then(m => ({ default: m.SessionDetailPage })));
const AccessControlPage = React.lazy(() => import('./pages/AccessControlPage').then(m => ({ default: m.AccessControlPage })));
const RoleManagePage = React.lazy(() => import('./pages/RoleManagePage').then(m => ({ default: m.RoleManagePage })));
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
  SafetyOutlined,
  CalendarOutlined,
} from '@ant-design/icons';

const { Content, Sider, Header } = Layout;
const { Text } = Typography;
const queryClient = new QueryClient();

const DISABLE_AUTH = import.meta.env.VITE_DISABLE_AUTH === 'true';

function AppLayout({ children }: { children: React.ReactNode }) {
  const location = useLocation();
  const navigate = useNavigate();
  const loginUser = getLoginUser();
  
  // 根据当前路径计算默认展开的菜单
  const getDefaultOpenKeys = (pathname: string): string[] => {
    if (pathname.startsWith('/udesc')) return ['udesc'];
    if (pathname.startsWith('/demand')) return ['demand'];
    if (pathname.startsWith('/access-control') || pathname.startsWith('/role-manage')) return ['access-control'];
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
        { key: '/udesc/heatmap', label: '时段热力图' },
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
      key: 'weekly',
      icon: <CalendarOutlined />,
      label: '周报中心',
      children: [
        { key: '/weekly-report', label: '周报预览' },
      ],
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
    {
      key: 'access-control',
      icon: <SafetyOutlined />,
      label: '权限管理',
      children: [
        { key: '/access-control', label: '权限总览' },
        { key: '/role-manage', label: '角色管理' },
      ],
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
              navigate(key);
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
<<<<<<< HEAD
    <Routes>
      <Route path="/" element={<AppLayout><DashboardPage initialMenuKey="satisfaction" /></AppLayout>} />
      <Route path="/satisfaction" element={<AppLayout><DashboardPage initialMenuKey="satisfaction" /></AppLayout>} />
      <Route path="/udesc/votes" element={<AppLayout><VotesPage /></AppLayout>} />
      <Route path="/udesc/metrics" element={<AppLayout><MetricsPage /></AppLayout>} />
      <Route path="/udesc/tickets" element={<AppLayout><TicketsPage /></AppLayout>} />
      <Route path="/udesc/heatmap" element={<AppLayout><HeatmapPage /></AppLayout>} />
      <Route path="/udesc/sessions" element={<AppLayout><SessionDetailPage /></AppLayout>} />
      <Route path="/demand" element={<AppLayout><DemandSummaryPage /></AppLayout>} />
      <Route path="/demand/requirements" element={<AppLayout><RequirementDetailPage /></AppLayout>} />
      <Route path="/demand/bugs" element={<AppLayout><BugDetailPage /></AppLayout>} />
      <Route path="/opportunity" element={<AppLayout><DashboardPage initialMenuKey="opportunity" /></AppLayout>} />
      <Route path="/weekly-report" element={<AppLayout><WeeklyReportPage /></AppLayout>} />
      <Route path="/sync-udesk" element={<AppLayout><DashboardPage initialMenuKey="sync-udesc" /></AppLayout>} />
      <Route path="/sync-zouwu" element={<AppLayout><DashboardPage initialMenuKey="sync-zouwu" /></AppLayout>} />
      <Route path="/users" element={<AppLayout><UsersPage /></AppLayout>} />
      <Route path="/logs" element={<AppLayout><LogsPage /></AppLayout>} />
      <Route path="/access-control" element={<AppLayout><AccessControlPage /></AppLayout>} />
      <Route path="/role-manage" element={<AppLayout><RoleManagePage /></AppLayout>} />
    </Routes>
=======
    <Suspense fallback={
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '100vh' }}>
        <Spin size="large" tip="加载中..." />
      </div>
    }>
      <Routes>
        <Route path="/" element={<AppLayout><DashboardPage initialMenuKey="satisfaction" /></AppLayout>} />
        <Route path="/satisfaction" element={<AppLayout><DashboardPage initialMenuKey="satisfaction" /></AppLayout>} />
        <Route path="/udesc/votes" element={<AppLayout><VotesPage /></AppLayout>} />
        <Route path="/udesc/metrics" element={<AppLayout><MetricsPage /></AppLayout>} />
        <Route path="/udesc/tickets" element={<AppLayout><TicketsPage /></AppLayout>} />
        <Route path="/udesc/heatmap" element={<AppLayout><HeatmapPage /></AppLayout>} />
        <Route path="/udesc/sessions" element={<AppLayout><SessionDetailPage /></AppLayout>} />
        <Route path="/demand" element={<AppLayout><DemandSummaryPage /></AppLayout>} />
        <Route path="/demand/requirements" element={<AppLayout><RequirementDetailPage /></AppLayout>} />
        <Route path="/demand/bugs" element={<AppLayout><BugDetailPage /></AppLayout>} />
        <Route path="/opportunity" element={<AppLayout><DashboardPage initialMenuKey="opportunity" /></AppLayout>} />
        <Route path="/weekly-report" element={<AppLayout><WeeklyReportPage /></AppLayout>} />
        <Route path="/sync-udesk" element={<AppLayout><DashboardPage initialMenuKey="sync-udesc" /></AppLayout>} />
        <Route path="/sync-zouwu" element={<AppLayout><DashboardPage initialMenuKey="sync-zouwu" /></AppLayout>} />
        <Route path="/users" element={<AppLayout><UsersPage /></AppLayout>} />
        <Route path="/logs" element={<AppLayout><LogsPage /></AppLayout>} />
        <Route path="/access-control" element={<AppLayout><AccessControlPage /></AppLayout>} />
      </Routes>
    </Suspense>
>>>>>>> 8c412a1 (fix: 重命名卡片标题、统一字段命名、补全 tooltip 公式说明)
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
