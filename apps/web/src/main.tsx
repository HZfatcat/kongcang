import React from 'react';
import ReactDOM from 'react-dom/client';
import 'antd/dist/reset.css';
import { DashboardPage } from './pages/DashboardPage';
import { LoginPage } from './pages/LoginPage';
import { LoginVerifyPage } from './pages/LoginVerifyPage';
import { getToken } from './auth/session';

function App() {
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
  return <DashboardPage />;
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
