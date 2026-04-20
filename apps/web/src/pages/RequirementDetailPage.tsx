import React from 'react';
import { Card, Row, Col, Statistic, Typography, DatePicker, Space, Tag } from 'antd';
import { useKpi } from '../api/kpi';
import { ResizableTable } from '../components/ResizableTable';
import dayjs from 'dayjs';

const { RangePicker } = DatePicker;

interface RequirementRow {
  id: string;
  title: string;
  status: string;
  issueType?: number;
  sourceSessionId?: string | null;
  createdById?: string | null;
  createdByName?: string | null;
  createdAtSource: string;
  completedAtSource?: string;
}

interface MonthlyRow {
  month: string;
  created: number;
  completed: number;
  completionRate: number;
}

export function RequirementDetailPage() {
  const { demandOverview, demandLoading, dateRange, setDateRange } = useKpi();
  const [pageSize, setPageSize] = React.useState(20);

  const requirementList: RequirementRow[] = React.useMemo(() => {
    return (demandOverview?.recentRequirements ?? []).filter(r => r.issueType !== 1);
  }, [demandOverview]);

  const columns = [
    { 
      title: 'ID', 
      dataIndex: 'id', 
      key: 'id',
      sorter: (a: RequirementRow, b: RequirementRow) => a.id.localeCompare(b.id),
      width: 80,
    },
    {
      title: '标题',
      dataIndex: 'title',
      key: 'title',
      sorter: (a: RequirementRow, b: RequirementRow) => a.title.localeCompare(b.title),
      ellipsis: true,
      width: 300,
      render: (title: string, record: RequirementRow) => (
        <a href={`https://zouwu.gitcode.com/feedback/detail/${record.id}`} target="_blank" rel="noopener noreferrer">
          {title}
        </a>
      ),
    },
    { 
      title: '状态', 
      dataIndex: 'status', 
      key: 'status',
      sorter: (a: RequirementRow, b: RequirementRow) => a.status.localeCompare(b.status),
      filters: [...new Set(requirementList.map(r => r.status))].map(s => ({ text: s, value: s })),
      onFilter: (value: unknown, record: RequirementRow) => record.status === value,
      render: (status: string) => {
        const colorMap: Record<string, string> = {
          'DONE': 'green',
          'CLOSED': 'green',
          'IN_PROGRESS': 'blue',
          'TODO': 'default',
          'REJECTED': 'red',
        };
        return <Tag color={colorMap[status] || 'default'}>{status}</Tag>;
      },
      width: 110,
    },
    {
      title: '来源会话',
      dataIndex: 'sourceSessionId',
      key: 'sourceSessionId',
      render: (value?: string | null) => value ?? '-',
      width: 120,
    },
    {
      title: '创建人',
      dataIndex: 'createdByName',
      key: 'createdByName',
      render: (value?: string | null) => value ?? '-',
      width: 100,
    },
    {
      title: '创建时间',
      dataIndex: 'createdAtSource',
      key: 'createdAtSource',
      sorter: (a: RequirementRow, b: RequirementRow) => 
        new Date(a.createdAtSource).getTime() - new Date(b.createdAtSource).getTime(),
      render: (value: string) => dayjs(value).format('YYYY-MM-DD HH:mm:ss'),
      width: 170,
    },
    {
      title: '完成时间',
      dataIndex: 'completedAtSource',
      key: 'completedAtSource',
      sorter: (a: RequirementRow, b: RequirementRow) => {
        const aTime = a.completedAtSource ? new Date(a.completedAtSource).getTime() : 0;
        const bTime = b.completedAtSource ? new Date(b.completedAtSource).getTime() : 0;
        return aTime - bTime;
      },
      render: (value?: string) => (value ? dayjs(value).format('YYYY-MM-DD HH:mm:ss') : '-'),
      width: 170,
    },
  ];

  const monthlyColumns = [
    { 
      title: '月份', 
      dataIndex: 'month', 
      key: 'month', 
      sorter: (a: MonthlyRow, b: MonthlyRow) => a.month.localeCompare(b.month),
      width: 100,
    },
    { 
      title: '识别需求数', 
      dataIndex: 'created', 
      key: 'created', 
      sorter: (a: MonthlyRow, b: MonthlyRow) => a.created - b.created,
      width: 120,
    },
    { 
      title: '完成需求数', 
      dataIndex: 'completed', 
      key: 'completed', 
      sorter: (a: MonthlyRow, b: MonthlyRow) => a.completed - b.completed,
      width: 120,
    },
    {
      title: '完成率',
      dataIndex: 'completionRate',
      key: 'completionRate',
      sorter: (a: MonthlyRow, b: MonthlyRow) => a.completionRate - b.completionRate,
      render: (value: number) => `${(value * 100).toFixed(2)}%`,
      width: 100,
    },
  ];

  return (
    <div style={{ padding: 24, background: '#f5f5f5', minHeight: 'calc(100vh - 64px)' }}>
      <Row justify="space-between" align="middle" style={{ marginBottom: 16 }}>
        <Typography.Title level={4} style={{ margin: 0 }}>需求详情</Typography.Title>
        <Space>
          <span style={{ color: '#666' }}>日期范围：</span>
          <RangePicker
            value={dateRange}
            onChange={(dates) => dates && setDateRange(dates as [dayjs.Dayjs, dayjs.Dayjs])}
            format="YYYY-MM-DD"
          />
        </Space>
      </Row>

      <Row gutter={16}>
        <Col span={8}>
          <Card 
            loading={demandLoading} 
            style={{ height: 120, borderRadius: 8, boxShadow: '0 1px 2px rgba(0,0,0,0.03)' }}
            bodyStyle={{ padding: '20px 24px' }}
          >
            <Statistic 
              title={<span style={{ color: '#666' }}>识别需求总数</span>} 
              value={demandOverview?.totalIdentifiedCount ?? 0}
              valueStyle={{ color: '#1890ff' }}
            />
          </Card>
        </Col>
        <Col span={8}>
          <Card 
            loading={demandLoading} 
            style={{ height: 120, borderRadius: 8, boxShadow: '0 1px 2px rgba(0,0,0,0.03)' }}
            bodyStyle={{ padding: '20px 24px' }}
          >
            <Statistic 
              title={<span style={{ color: '#666' }}>已结单需求数</span>} 
              value={demandOverview?.completedCount ?? 0}
              valueStyle={{ color: '#52c41a' }}
            />
          </Card>
        </Col>
        <Col span={8}>
          <Card 
            loading={demandLoading} 
            style={{ height: 120, borderRadius: 8, boxShadow: '0 1px 2px rgba(0,0,0,0.03)' }}
            bodyStyle={{ padding: '20px 24px' }}
          >
            <Statistic
              title={<span style={{ color: '#666' }}>需求结单率</span>}
              value={Number(((demandOverview?.completionRate ?? 0) * 100).toFixed(2))}
              suffix="%"
              valueStyle={{ color: '#52c41a' }}
            />
          </Card>
        </Col>
      </Row>

      <Card 
        title={<span style={{ fontWeight: 600 }}>按月需求结单率</span>} 
        style={{ marginTop: 16, borderRadius: 8, boxShadow: '0 1px 2px rgba(0,0,0,0.03)' }}
      >
        <ResizableTable<MonthlyRow>
          rowKey="month"
          dataSource={(demandOverview?.monthlyRequirement ?? []).slice().reverse()}
          pagination={false}
          size="middle"
          columns={monthlyColumns}
          loading={demandLoading}
        />
      </Card>

      <Card 
        title={<span style={{ fontWeight: 600 }}>需求明细</span>} 
        style={{ marginTop: 16, borderRadius: 8, boxShadow: '0 1px 2px rgba(0,0,0,0.03)' }}
      >
        <ResizableTable<RequirementRow>
          rowKey="id"
          dataSource={requirementList}
          columns={columns}
          pagination={{ 
            pageSize, 
            showSizeChanger: true, 
            pageSizeOptions: ['10', '20', '50', '100'],
            onShowSizeChange: (_, size) => setPageSize(size),
            showTotal: (total) => `共 ${total} 条` 
          }}
          size="middle"
          scroll={{ x: 1000 }}
          loading={demandLoading}
        />
      </Card>
    </div>
  );
}
