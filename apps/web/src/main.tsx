import React from 'react';
import ReactDOM from 'react-dom/client';
import 'antd/dist/reset.css';
import { DashboardPage } from './pages/DashboardPage';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <DashboardPage />
  </React.StrictMode>,
);
