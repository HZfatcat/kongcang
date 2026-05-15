import React from 'react';
import { Card, Row, Col, Statistic, Typography, DatePicker, Space, Tag, Tooltip } from 'antd';
import { Link } from 'react-router-dom';
import { useKpi, fetchProductModuleDistribution } from '../api/kpi';
import type { MonthlyCompletion, ProductModuleDistribution } from '../types/kpi';
import { ResizableTable } from '../components/ResizableTable';
import { ProductModuleChart } from '../components/ProductModuleChart';
import dayjs from 'dayjs';
import { useState, useEffect } from 'react';

const { RangePicker } = DatePicker;

const statusTextMap: Record<string, string> = {
  'OPEN': '待评估',
  'IN_PROGRESS': '已采纳',
  'DONE': '已闭环',
  'CLOSED': '已闭环',
  'REJECTED': '已拒绝',
};


interface MonthlySummaryRow {
  month: string;
  reqCreated: number;
  reqCompleted: number;
  reqRejected: number;
  reqLongTerm: number;
  reqRate: number;
  bugCreated: number;
  bugCompleted: number;
  bugRejected: number;
  bugLongTerm: number;
  bugRate: number;
}

interface RecentItem {
  id: string;
  title: string;
  status: string;
  issueType?: number;
  isLongTerm?: boolean;
  sourceSessionId?: string | null;
  createdById?: string | null;
  createdByName?: string | null;
  createdAtSource: string;
  completedAtSource?: string;
}

export function DemandSummaryPage() {
  const { demandOverview, demandLoading, dateRange, setDateRange } = useKpi();
  const [productModuleData, setProductModuleData] = useState<ProductModuleDistribution | null>(null);

  useEffect(() => {
    fetchProductModuleDistribution({
      startDate: dateRange[0].format('YYYY-MM-DD'),
      endDate: dateRange[1].format('YYYY-MM-DD'),
    }).then(setProductModuleData).catch(err => {
      console.error('Failed to load product module distribution:', err);
      setProductModuleData(null);
    });
  }, [dateRange]);

  // 按月汇总数据
  const monthlySummary: MonthlySummaryRow[] = React.useMemo(() => {
    const reqMonthly = demandOverview?.monthlyRequirement ?? [];
    const bugMonthly = demandOverview?.monthlyBug ?? [];
    
    const monthMap = new Map<string, MonthlySummaryRow>();
    
    reqMonthly.forEach((m: MonthlyCompletion) => {
      // 结单率 = (已完成 + 已拒绝) / (总数 - 长期演进) - 与 RequirementDetailPage 一致
      const effectiveTotal = m.created - m.longTermCount;
      const rate = effectiveTotal > 0 ? (m.completed + m.rejectedCount) / effectiveTotal : 0;
      monthMap.set(m.month, { 
        month: m.month, 
        reqCreated: m.created, 
        reqCompleted: m.completed, 
        reqRejected: m.rejectedCount,
        reqLongTerm: m.longTermCount,
        reqRate: rate,
        bugCreated: 0, 
        bugCompleted: 0,
        bugRejected: 0,
        bugLongTerm: 0,
        bugRate: 0
      });
    });
    
    bugMonthly.forEach((m: MonthlyCompletion) => {
      // Bug闭环率使用 completionRate 字段 - 与 BugDetailPage 一致
      const existing = monthMap.get(m.month);
      if (existing) {
        existing.bugCreated = m.created;
        existing.bugCompleted = m.completed;
        existing.bugRejected = m.rejectedCount;
        existing.bugLongTerm = m.longTermCount;
        existing.bugRate = m.completionRate;
      } else {
        monthMap.set(m.month, { 
          month: m.month, 
          reqCreated: 0, 
          reqCompleted: 0, 
          reqRejected: 0,
          reqLongTerm: 0,
          reqRate: 0,
          bugCreated: m.created, 
          bugCompleted: m.completed,
          bugRejected: m.rejectedCount,
          bugLongTerm: m.longTermCount,
          bugRate: m.completionRate
        });
      }
    });
    
    return Array.from(monthMap.values()).sort((a, b) => b.month.localeCompare(a.month));
  }, [demandOverview]);

  const recentRequirements = React.useMemo(() => {
    return (demandOverview?.recentRequirements ?? [])
      .filter((r: RecentItem) => r.issueType !== 1)
      .slice(0, 5);
  }, [demandOverview]);

  const recentBugs = React.useMemo(() => {
    return (demandOverview?.recentRequirements ?? [])
      .filter((r: RecentItem) => r.issueType === 1)
      .slice(0, 5);
  }, [demandOverview]);

  const monthlyColumns = [
    { 
      title: '月份', 
      dataIndex: 'month', 
      key: 'month',
      width: 120,
      sorter: (a: MonthlySummaryRow, b: MonthlySummaryRow) => a.month.localeCompare(b.month),
      defaultSortOrder: 'descend' as const,
    },
    { 
      title: '需求总数', 
      dataIndex: 'reqCreated', 
      key: 'reqCreated',
      width: 120,
      sorter: (a: MonthlySummaryRow, b: MonthlySummaryRow) => a.reqCreated - b.reqCreated,
    },
    { 
      title: '需求闭环数', 
      dataIndex: 'reqCompleted', 
      key: 'reqCompleted',
      width: 140,
      sorter: (a: MonthlySummaryRow, b: MonthlySummaryRow) => a.reqCompleted - b.reqCompleted,
    },
    { 
      title: '需求拒绝', 
      dataIndex: 'reqRejected', 
      key: 'reqRejected',
      width: 120,
      sorter: (a: MonthlySummaryRow, b: MonthlySummaryRow) => a.reqRejected - b.reqRejected,
    },
    { 
      title: '需求长期', 
      dataIndex: 'reqLongTerm', 
      key: 'reqLongTerm',
      width: 120,
      sorter: (a: MonthlySummaryRow, b: MonthlySummaryRow) => a.reqLongTerm - b.reqLongTerm,
    },
    {
      title: '需求闭环率',
      dataIndex: 'reqRate',
      key: 'reqRate',
      width: 140,
      sorter: (a: MonthlySummaryRow, b: MonthlySummaryRow) => a.reqRate - b.reqRate,
      render: (rate: number) => (
        <span style={{ color: rate >= 0.8 ? '#52c41a' : rate >= 0.5 ? '#faad14' : '#ff4d4f' }}>
          {(rate * 100).toFixed(2)}%
        </span>
      )
    },
    { 
      title: 'Bug总数', 
      dataIndex: 'bugCreated', 
      key: 'bugCreated',
      width: 120,
      sorter: (a: MonthlySummaryRow, b: MonthlySummaryRow) => a.bugCreated - b.bugCreated,
    },
    { 
      title: 'Bug闭环数', 
      dataIndex: 'bugCompleted', 
      key: 'bugCompleted',
      width: 140,
      sorter: (a: MonthlySummaryRow, b: MonthlySummaryRow) => a.bugCompleted - b.bugCompleted,
    },
    { 
      title: 'Bug拒绝', 
      dataIndex: 'bugRejected', 
      key: 'bugRejected',
      width: 120,
      sorter: (a: MonthlySummaryRow, b: MonthlySummaryRow) => a.bugRejected - b.bugRejected,
    },
    { 
      title: 'Bug长期', 
      dataIndex: 'bugLongTerm', 
      key: 'bugLongTerm',
      width: 120,
      sorter: (a: MonthlySummaryRow, b: MonthlySummaryRow) => a.bugLongTerm - b.bugLongTerm,
    },
    {
      title: 'Bug闭环率',
      dataIndex: 'bugRate',
      key: 'bugRate',
      width: 140,
      sorter: (a: MonthlySummaryRow, b: MonthlySummaryRow) => a.bugRate - b.bugRate,
      render: (rate: number) => (
        <span style={{ color: rate >= 0.8 ? '#52c41a' : rate >= 0.5 ? '#faad14' : '#ff4d4f' }}>
          {(rate * 100).toFixed(2)}%
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
      sorter: (a: RecentItem, b: RecentItem) => a.id.localeCompare(b.id),
    },
    { 
      title: '标题', 
      dataIndex: 'title', 
      key: 'title',
      width: 300,
      ellipsis: true,
      sorter: (a: RecentItem, b: RecentItem) => a.title.localeCompare(b.title),
      render: (title: string, record: RecentItem) => (
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
      sorter: (a: RecentItem, b: RecentItem) => a.status.localeCompare(b.status),
      render: (status: string) => {
        const colorMap: Record<string, string> = {
          'DONE': 'green',
          'CLOSED': 'green',
          'IN_PROGRESS': 'blue',
          'TODO': 'default',
          'REJECTED': 'red',
        };
        return <Tag color={colorMap[status] || 'default'}>{statusTextMap[status] || status}</Tag>;
      },
    },
    { 
      title: '创建人', 
      dataIndex: 'createdByName', 
      key: 'createdByName', 
      width: 100,
      render: (value?: string | null) => value ?? '-',
    },
    { 
      title: '创建时间', 
      dataIndex: 'createdAtSource', 
      key: 'createdAtSource',
      width: 160,
      sorter: (a: RecentItem, b: RecentItem) => 
        new Date(a.createdAtSource).getTime() - new Date(b.createdAtSource).getTime(),
      render: (v: string) => dayjs(v).format('YYYY-MM-DD HH:mm')
    },
  ];

  return (
    <div style={{ padding: 24, background: '#f5f5f5', minHeight: 'calc(100vh - 64px)' }}>
      <Row justify="space-between" align="middle" style={{ marginBottom: 16 }}>
        <div>
          <Typography.Title level={4} style={{ margin: 0 }}>需求与 Bug 汇总</Typography.Title>
          <Typography.Text type="secondary">跟踪需求和 Bug 的完成情况</Typography.Text>
        </div>
        <Space>
          <span style={{ color: '#666' }}>日期范围：</span>
          <RangePicker
            value={dateRange}
            onChange={(dates) => dates && setDateRange(dates as [dayjs.Dayjs, dayjs.Dayjs])}
            format="YYYY-MM-DD"
          />
        </Space>
      </Row>
      
      {/* 需求统计 - 使用 RequirementDetailPage 的数据字段 */}
      <Row gutter={16}>
        <Col span={4}>
          <Card 
            loading={demandLoading} 
            style={{ height: 120, borderRadius: 8, boxShadow: '0 1px 2px rgba(0,0,0,0.03)' }}
            bodyStyle={{ padding: '20px 16px' }}
          >
            <Statistic 
              title={<span style={{ color: '#666', fontSize: 13 }}>需求总数</span>} 
              value={demandOverview?.totalWithLongTerm ?? 0}
              valueStyle={{ color: '#1890ff' }}
            />
          </Card>
        </Col>
        <Col span={4}>
          <Card 
            loading={demandLoading} 
            style={{ height: 120, borderRadius: 8, boxShadow: '0 1px 2px rgba(0,0,0,0.03)' }}
            bodyStyle={{ padding: '20px 16px' }}
          >
            <Statistic 
              title={<span style={{ color: '#666', fontSize: 13 }}>需求闭环数</span>} 
              value={demandOverview?.completedCount ?? 0}
              valueStyle={{ color: '#52c41a' }}
            />
          </Card>
        </Col>
        <Col span={4}>
          <Card 
            loading={demandLoading} 
            style={{ height: 120, borderRadius: 8, boxShadow: '0 1px 2px rgba(0,0,0,0.03)' }}
            bodyStyle={{ padding: '20px 16px' }}
          >
            <Statistic 
              title={<span style={{ color: '#666', fontSize: 13 }}>已拒绝需求</span>} 
              value={demandOverview?.rejectedCount ?? 0}
              valueStyle={{ color: '#ff4d4f' }}
            />
          </Card>
        </Col>
        <Col span={4}>
          <Card 
            loading={demandLoading} 
            style={{ height: 120, borderRadius: 8, boxShadow: '0 1px 2px rgba(0,0,0,0.03)' }}
            bodyStyle={{ padding: '20px 16px' }}
          >
            <Statistic 
              title={<span style={{ color: '#666', fontSize: 13 }}>需求长期演进</span>} 
              value={demandOverview?.longTermCount ?? 0}
              valueStyle={{ color: '#fa8c16' }}
            />
          </Card>
        </Col>
        <Col span={4} style={{ position: 'relative' }}>
          <Card 
            loading={demandLoading} 
            style={{ height: 120, borderRadius: 8, boxShadow: '0 1px 2px rgba(0,0,0,0.03)' }}
            bodyStyle={{ padding: '20px 16px' }}
          >
            <span style={{ position: 'absolute', top: 8, right: 8, cursor: 'help', color: '#999', zIndex: 1 }}>
              <Tooltip title="状态为待评估 / 已采纳 / 开发中 / 已完成的需求（已剔除长期演进）">
                <svg viewBox="64 64 896 896" focusable="false" style={{ width: 16, height: 16 }} data-icon="exclamation-circle" width="1em" height="1em" fill="currentColor" aria-hidden="true">
                  <path d="M512 64C264.6 64 64 264.6 64 512s200.6 448 448 448 448-200.6 448-448S759.4 64 512 64zm0 820c-205.4 0-372-166.6-372-372s166.6-372 372-372 372 166.6 372 372-166.6 372-372 372z"></path>
                  <path d="M464 688a48 48 0 1096 0 48 48 0 10-96 0zm24-112h48c4.4 0 8-3.6 8-8V296c0-4.4-3.6-8-8-8h-48c-4.4 0-8 3.6-8 8v272c0 4.4 3.6 8 8 8z"></path>
                </svg>
              </Tooltip>
            </span>
            <Statistic
              title={<span style={{ color: '#666', fontSize: 13 }}>跟进中需求</span>}
              value={demandOverview?.followUpCount ?? 0}
              valueStyle={{ color: '#1890ff' }}
            />
          </Card>
        </Col>
        <Col span={4} style={{ position: 'relative' }}>
          <Card 
            loading={demandLoading} 
            style={{ height: 120, borderRadius: 8, boxShadow: '0 1px 2px rgba(0,0,0,0.03)' }}
            bodyStyle={{ padding: '20px 16px' }}
          >
            <span style={{ position: 'absolute', top: 8, right: 8, cursor: 'help', color: '#999', zIndex: 1 }}>
              <Tooltip title="关单率 = (已闭环 + 已拒绝) / (总数 - 长期演进单)">
                <svg viewBox="64 64 896 896" focusable="false" style={{ width: 16, height: 16 }} data-icon="exclamation-circle" width="1em" height="1em" fill="currentColor" aria-hidden="true">
                  <path d="M512 64C264.6 64 64 264.6 64 512s200.6 448 448 448 448-200.6 448-448S759.4 64 512 64zm0 820c-205.4 0-372-166.6-372-372s166.6-372 372-372 372 166.6 372 372-166.6 372-372 372z"></path>
                  <path d="M464 688a48 48 0 1096 0 48 48 0 10-96 0zm24-112h48c4.4 0 8-3.6 8-8V296c0-4.4-3.6-8-8-8h-48c-4.4 0-8 3.6-8 8v272c0 4.4 3.6 8 8 8z"></path>
                </svg>
              </Tooltip>
            </span>
            <Statistic
              title={<span style={{ color: '#666' }}>需求闭环率</span>}
              value={Number(((demandOverview?.completionRate ?? 0) * 100).toFixed(2))}
              suffix="%"
              valueStyle={{ color: '#52c41a' }}
            />
          </Card>
        </Col>
      </Row>

      {/* Bug 统计 - 使用 BugDetailPage 的数据字段 */}
      <Row gutter={16} style={{ marginTop: 16 }}>
        <Col span={4}>
          <Card 
            loading={demandLoading} 
            style={{ height: 120, borderRadius: 8, boxShadow: '0 1px 2px rgba(0,0,0,0.03)' }}
            bodyStyle={{ padding: '20px 16px' }}
          >
            <Statistic 
              title={<span style={{ color: '#666', fontSize: 13 }}>Bug 总数</span>} 
              value={demandOverview?.bugCount ?? 0}
              valueStyle={{ color: '#faad14' }}
            />
          </Card>
        </Col>
        <Col span={4}>
          <Card 
            loading={demandLoading} 
            style={{ height: 120, borderRadius: 8, boxShadow: '0 1px 2px rgba(0,0,0,0.03)' }}
            bodyStyle={{ padding: '20px 16px' }}
          >
            <Statistic 
              title={<span style={{ color: '#666', fontSize: 13 }}>Bug闭环数</span>} 
              value={demandOverview?.bugCompletedCount ?? 0}
              valueStyle={{ color: '#52c41a' }}
            />
          </Card>
        </Col>
        <Col span={4}>
          <Card 
            loading={demandLoading} 
            style={{ height: 120, borderRadius: 8, boxShadow: '0 1px 2px rgba(0,0,0,0.03)' }}
            bodyStyle={{ padding: '20px 16px' }}
          >
            <Statistic 
              title={<span style={{ color: '#666', fontSize: 13 }}>已拒绝 Bug</span>} 
              value={demandOverview?.bugRejectedCount ?? 0}
              valueStyle={{ color: '#ff4d4f' }}
            />
          </Card>
        </Col>
        <Col span={4}>
          <Card 
            loading={demandLoading} 
            style={{ height: 120, borderRadius: 8, boxShadow: '0 1px 2px rgba(0,0,0,0.03)' }}
            bodyStyle={{ padding: '20px 16px' }}
          >
            <Statistic 
              title={<span style={{ color: '#666', fontSize: 13 }}>Bug 长期演进</span>} 
              value={demandOverview?.bugLongTermCount ?? 0}
              valueStyle={{ color: '#722ed1' }}
            />
          </Card>
        </Col>
        <Col span={4} style={{ position: 'relative' }}>
          <Card 
            loading={demandLoading} 
            style={{ height: 120, borderRadius: 8, boxShadow: '0 1px 2px rgba(0,0,0,0.03)' }}
            bodyStyle={{ padding: '20px 16px' }}
          >
            <span style={{ position: 'absolute', top: 8, right: 8, cursor: 'help', color: '#999', zIndex: 1 }}>
              <Tooltip title="状态为待评估 / 已采纳 / 开发中 / 已完成的 Bug（已剔除长期演进）">
                <svg viewBox="64 64 896 896" focusable="false" style={{ width: 16, height: 16 }} data-icon="exclamation-circle" width="1em" height="1em" fill="currentColor" aria-hidden="true">
                  <path d="M512 64C264.6 64 64 264.6 64 512s200.6 448 448 448 448-200.6 448-448S759.4 64 512 64zm0 820c-205.4 0-372-166.6-372-372s166.6-372 372-372 372 166.6 372 372-166.6 372-372 372z"></path>
                  <path d="M464 688a48 48 0 1096 0 48 48 0 10-96 0zm24-112h48c4.4 0 8-3.6 8-8V296c0-4.4-3.6-8-8-8h-48c-4.4 0-8 3.6-8 8v272c0 4.4 3.6 8 8 8z"></path>
                </svg>
              </Tooltip>
            </span>
            <Statistic
              title={<span style={{ color: '#666', fontSize: 13 }}>跟进中 Bug</span>}
              value={demandOverview?.bugFollowUpCount ?? 0}
              valueStyle={{ color: '#faad14' }}
            />
          </Card>
        </Col>
        <Col span={4}>
          <Card 
            loading={demandLoading} 
            style={{ height: 120, borderRadius: 8, boxShadow: '0 1px 2px rgba(0,0,0,0.03)' }}
            bodyStyle={{ padding: '20px 16px' }}
          >
            <span style={{ position: 'absolute', top: 8, right: 8, cursor: 'help', color: '#999', zIndex: 1 }}>
              <Tooltip title="关单率 = (已闭环 + 已拒绝) / (总数 - 长期演进单)">
                <svg viewBox="64 64 896 896" focusable="false" style={{ width: 16, height: 16 }} data-icon="exclamation-circle" width="1em" height="1em" fill="currentColor" aria-hidden="true">
                  <path d="M512 64C264.6 64 64 264.6 64 512s200.6 448 448 448 448-200.6 448-448S759.4 64 512 64zm0 820c-205.4 0-372-166.6-372-372s166.6-372 372-372 372 166.6 372 372-166.6 372-372 372z"></path>
                  <path d="M464 688a48 48 0 1096 0 48 48 0 10-96 0zm24-112h48c4.4 0 8-3.6 8-8V296c0-4.4-3.6-8-8-8h-48c-4.4 0-8 3.6-8 8v272c0 4.4 3.6 8 8 8z"></path>
                </svg>
              </Tooltip>
            </span>
            <Statistic
              title={<span style={{ color: '#666' }}>Bug闭环率</span>}
              value={Number(((demandOverview?.bugCompletionRate ?? 0) * 100).toFixed(2))}
              suffix="%"
              valueStyle={{ color: '#52c41a' }}
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
          scroll={{ x: 1100 }}
        />
      </Card>

      <Card 
        title={<span style={{ fontWeight: 600 }}>最近需求</span>}
        style={{ marginTop: 16, borderRadius: 8, boxShadow: '0 1px 2px rgba(0,0,0,0.03)' }}
        extra={<Link to="/demand/requirements">查看全部 →</Link>}
      >
        <ResizableTable<RecentItem>
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
        <ResizableTable<RecentItem>
          rowKey="id"
          dataSource={recentBugs}
          columns={requirementColumns}
          pagination={false}
          size="middle"
          loading={demandLoading}
        />
      </Card>

      <ProductModuleChart
        data={productModuleData}
        loading={demandLoading}
        title="产品模块分布"
      />
    </div>
  );
}
