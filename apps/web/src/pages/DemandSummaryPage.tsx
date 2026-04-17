import React from 'react';
import { Card, Row, Col, Statistic, Typography } from 'antd';
import { Link } from 'react-router-dom';
import { useKpi } from '../api/kpi';
import type { MonthlyCompletion } from '../types/kpi';
import { ResizableTable } from '../components/ResizableTable';
import dayjs from 'dayjs';

interface MonthlySummaryRow {
  month: string;
  reqCreated: number;
  reqCompleted: number;
  reqRate: number;
  bugCreated: number;
  bugCompleted: number;
  bugRate: number;
}

interface RecentRequirement {
  id: string;
  title: string;
  status: string;
  issueType?: number;
  createdAtSource: string;
}

export function DemandSummaryPage() {
  const { demandOverview, demandLoading } = useKpi();

  const monthlySummary: MonthlySummaryRow[] = React.useMemo(() => {
    const reqMonthly = demandOverview?.monthlyRequirement ?? [];
    const bugMonthly = demandOverview?.monthlyBug ?? [];
    
    const monthMap = new Map<string, MonthlySummaryRow>();
    
    reqMonthly.forEach((m: MonthlyCompletion) => {
      const rate = m.created > 0 ? m.completed / m.created : 0;
      monthMap.set(m.month, { 
        month: m.month, 
        reqCreated: m.created, 
        reqCompleted: m.completed, 
        reqRate: rate,
        bugCreated: 0, 
        bugCompleted: 0,
        bugRate: 0
      });
    });
    
    bugMonthly.forEach((m: MonthlyCompletion) => {
      const rate = m.created > 0 ? m.completed / m.created : 0;
      const existing = monthMap.get(m.month);
      if (existing) {
        existing.bugCreated = m.created;
        existing.bugCompleted = m.completed;
        existing.bugRate = rate;
      } else {
        monthMap.set(m.month, { 
          month: m.month, 
          reqCreated: 0, 
          reqCompleted: 0, 
          reqRate: 0,
          bugCreated: m.created, 
          bugCompleted: m.completed, 
          bugRate: rate
        });
      }
    });
    
    return Array.from(monthMap.values()).sort((a, b) => b.month.localeCompare(a.month));
  }, [demandOverview]);

  const recentRequirements = React.useMemo(() => {
    return (demandOverview?.recentRequirements ?? [])
      .filter((r: RecentRequirement) => r.issueType !== 1)
      .slice(0, 5);
  }, [demandOverview]);

  const recentBugs = React.useMemo(() => {
    return (demandOverview?.recentRequirements ?? [])
      .filter((r: RecentRequirement) => r.issueType === 1)
      .slice(0, 5);
  }, [demandOverview]);

  const monthlyColumns = [
    { 
      title: '月份', 
      dataIndex: 'month', 
      key: 'month',
      width: 100,
      sorter: (a: MonthlySummaryRow, b: MonthlySummaryRow) => a.month.localeCompare(b.month),
    },
    { 
      title: '需求识别', 
      dataIndex: 'reqCreated', 
      key: 'reqCreated',
      width: 100,
      sorter: (a: MonthlySummaryRow, b: MonthlySummaryRow) => a.reqCreated - b.reqCreated,
    },
    { 
      title: '需求完成', 
      dataIndex: 'reqCompleted', 
      key: 'reqCompleted',
      width: 100,
      sorter: (a: MonthlySummaryRow, b: MonthlySummaryRow) => a.reqCompleted - b.reqCompleted,
    },
    {
      title: '需求完成率',
      dataIndex: 'reqRate',
      key: 'reqRate',
      width: 110,
      sorter: (a: MonthlySummaryRow, b: MonthlySummaryRow) => a.reqRate - b.reqRate,
      render: (rate: number) => (
        <span style={{ color: rate >= 0.8 ? '#52c41a' : rate >= 0.5 ? '#faad14' : '#ff4d4f' }}>
          {(rate * 100).toFixed(1)}%
        </span>
      )
    },
    { 
      title: 'Bug识别', 
      dataIndex: 'bugCreated', 
      key: 'bugCreated',
      width: 90,
      sorter: (a: MonthlySummaryRow, b: MonthlySummaryRow) => a.bugCreated - b.bugCreated,
    },
    { 
      title: 'Bug完成', 
      dataIndex: 'bugCompleted', 
      key: 'bugCompleted',
      width: 90,
      sorter: (a: MonthlySummaryRow, b: MonthlySummaryRow) => a.bugCompleted - b.bugCompleted,
    },
    {
      title: 'Bug完成率',
      dataIndex: 'bugRate',
      key: 'bugRate',
      width: 100,
      sorter: (a: MonthlySummaryRow, b: MonthlySummaryRow) => a.bugRate - b.bugRate,
      render: (rate: number) => (
        <span style={{ color: rate >= 0.8 ? '#52c41a' : rate >= 0.5 ? '#faad14' : '#ff4d4f' }}>
          {(rate * 100).toFixed(1)}%
        </span>
      )
    },
  ];

  const requirementColumns = [
    { 
      title: 'ID', 
      dataIndex: 'id', 
      key: 'id', 
      width: 80,
      sorter: (a: RecentRequirement, b: RecentRequirement) => a.id.localeCompare(b.id),
    },
    { 
      title: '标题', 
      dataIndex: 'title', 
      key: 'title',
      width: 300,
      ellipsis: true,
      sorter: (a: RecentRequirement, b: RecentRequirement) => a.title.localeCompare(b.title),
      render: (title: string, record: RecentRequirement) => (
        <a href={`https://zouwu.gitcode.com/feedback/detail/${record.id}`} target="_blank" rel="noopener noreferrer">
          {title}
        </a>
      ),
    },
    { 
      title: '状态', 
      dataIndex: 'status', 
      key: 'status', 
      width: 100,
      sorter: (a: RecentRequirement, b: RecentRequirement) => a.status.localeCompare(b.status),
    },
    { 
      title: '创建时间', 
      dataIndex: 'createdAtSource', 
      key: 'createdAtSource',
      width: 160,
      sorter: (a: RecentRequirement, b: RecentRequirement) => 
        new Date(a.createdAtSource).getTime() - new Date(b.createdAtSource).getTime(),
      render: (v: string) => dayjs(v).format('YYYY-MM-DD HH:mm')
    },
  ];

  return (
    <div className="fade-in">
      <div className="page-header">
        <h1 className="page-title">需求与 Bug 汇总 Dashboard</h1>
        <p className="page-subtitle">跟踪需求和 Bug 的完成情况</p>
      </div>
      
      <Row gutter={[16, 16]}>
        <Col xs={24} sm={12} lg={6}>
          <Card 
            loading={demandLoading} 
            className="stat-card"
            bodyStyle={{ padding: '20px 24px' }}
          >
            <Statistic 
              title="需求总数" 
              value={demandOverview?.totalIdentifiedCount ?? 0}
            />
          </Card>
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <Card 
            loading={demandLoading} 
            className="stat-card green"
            bodyStyle={{ padding: '20px 24px' }}
          >
            <Statistic 
              title="需求已完成" 
              value={demandOverview?.completedCount ?? 0}
            />
          </Card>
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <Card 
            loading={demandLoading} 
            className="stat-card orange"
            bodyStyle={{ padding: '20px 24px' }}
          >
            <Statistic 
              title="Bug 总数" 
              value={demandOverview?.bugCount ?? 0}
            />
          </Card>
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <Card 
            loading={demandLoading} 
            className="stat-card blue"
            bodyStyle={{ padding: '20px 24px' }}
          >
            <Statistic 
              title="Bug 已完成" 
              value={demandOverview?.bugCompletedCount ?? 0}
            />
          </Card>
        </Col>
      </Row>

      <Card 
        title={<span style={{ fontWeight: 600 }}>按月汇总</span>} 
        style={{ marginTop: 16, borderRadius: 8, boxShadow: '0 1px 2px rgba(0,0,0,0.03)' }}
      >
        <ResizableTable<MonthlySummaryRow>
          rowKey="month"
          dataSource={monthlySummary}
          columns={monthlyColumns}
          pagination={false}
          size="middle"
          loading={demandLoading}
        />
      </Card>

      <Card 
        title={<span style={{ fontWeight: 600 }}>最近需求</span>}
        style={{ marginTop: 16, borderRadius: 8, boxShadow: '0 1px 2px rgba(0,0,0,0.03)' }}
        extra={<Link to="/demand/requirements">查看全部 →</Link>}
      >
        <ResizableTable<RecentRequirement>
          rowKey="id"
          dataSource={recentRequirements}
          columns={requirementColumns}
          pagination={false}
          size="middle"
          loading={demandLoading}
        />
      </Card>

      <Card 
        title={<span style={{ fontWeight: 600 }}>最近 Bug</span>}
        style={{ marginTop: 16, borderRadius: 8, boxShadow: '0 1px 2px rgba(0,0,0,0.03)' }}
        extra={<Link to="/demand/bugs">查看全部 →</Link>}
      >
        <ResizableTable<RecentRequirement>
          rowKey="id"
          dataSource={recentBugs}
          columns={requirementColumns}
          pagination={false}
          size="middle"
          loading={demandLoading}
        />
      </Card>
    </div>
  );
}
