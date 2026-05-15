import React from 'react';
import { Card, Row, Col, Statistic, Typography, DatePicker, Space, Tag, Tooltip } from 'antd';
import { useKpi, fetchProductModuleDistribution } from '../api/kpi';
import type { ProductModuleDistribution } from '../types/kpi';
import { ResizableTable } from '../components/ResizableTable';
import { ProductModuleChart } from '../components/ProductModuleChart';
import dayjs from 'dayjs';

const { RangePicker } = DatePicker;

const statusTextMap: Record<string, string> = {
  'OPEN': '待评估',
  'IN_PROGRESS': '已采纳',
  'DONE': '已闭环',
  'CLOSED': '已闭环',
  'REJECTED': '已拒绝',
};

interface BugRow {
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

interface MonthlyRow {
  month: string;
  created: number;
  completed: number;
  rejectedCount: number;
  longTermCount: number;
  completionRate: number;
}

export function BugDetailPage() {
  const { demandOverview, demandLoading, dateRange, setDateRange } = useKpi();
  const [productModuleData, setProductModuleData] = React.useState<ProductModuleDistribution | null>(null);
  const [pageSize, setPageSize] = React.useState(20);

  // 加载产品模块分布数据（Bug = issueType=1）
  React.useEffect(() => {
    let cancelled = false;
    fetchProductModuleDistribution({
      startDate: dateRange[0].format('YYYY-MM-DD'),
      endDate: dateRange[1].format('YYYY-MM-DD'),
      issueType: '1',
    }).then((data) => {
      if (!cancelled) setProductModuleData(data);
    });
    return () => { cancelled = true; };
  }, [dateRange]);

  const bugList: BugRow[] = React.useMemo(() => {
    return (demandOverview?.recentRequirements ?? []).filter(r => r.issueType === 1);
  }, [demandOverview]);

  const columns = [
    { 
      title: 'ID', 
      dataIndex: 'id', 
      key: 'id',
      sorter: (a: BugRow, b: BugRow) => a.id.localeCompare(b.id),
      width: 80,
    },
    {
      title: '标题',
      dataIndex: 'title',
      key: 'title',
      sorter: (a: BugRow, b: BugRow) => a.title.localeCompare(b.title),
      ellipsis: true,
      width: 300,
      render: (title: string, record: BugRow) => (
        <a href={`https://zouwu.gitcode.com/feedback/detail/${record.id}`} target="_blank" rel="noopener noreferrer">
          {title}
        </a>
      ),
    },
    { 
      title: '状态',
      dataIndex: 'status',
      key: 'status',
      sorter: (a: BugRow, b: BugRow) => a.status.localeCompare(b.status),
      filters: [...new Set(bugList.map(r => r.status))].map(s => ({
        text: statusTextMap[s] || s,
        value: s
      })),
      onFilter: (value: unknown, record: BugRow) => record.status === value,
      render: (status: string) => {
        const colorMap: Record<string, string> = {
          'DONE': 'green',
          'CLOSED': 'blue',
          'IN_PROGRESS': 'orange',
          'TODO': 'default',
          'REJECTED': 'red',
        };
        return <Tag color={colorMap[status] || 'default'}>{statusTextMap[status] || status}</Tag>;
      },
      width: 110,
    },
    {
      title: '长期演进',
      dataIndex: 'isLongTerm',
      key: 'isLongTerm',
      sorter: (a: BugRow, b: BugRow) => (a.isLongTerm ? 1 : 0) - (b.isLongTerm ? 1 : 0),
      filters: [
        { text: '是', value: 'true' },
        { text: '否', value: 'false' },
      ],
      onFilter: (value: unknown, record: BugRow) => {
        if (value === 'true') return record.isLongTerm === true;
        return record.isLongTerm !== true;
      },
      render: (value?: boolean) => value ? <Tag color="purple">是</Tag> : <Tag>否</Tag>,
      width: 120,
    },
    {
      title: '创建人',
      dataIndex: 'createdByName',
      key: 'createdByName',
      filters: [...new Set(bugList.map(r => r.createdByName).filter(Boolean))].map(name => ({ text: name as string, value: name as string })),
      onFilter: (value: unknown, record: BugRow) => record.createdByName === value,
      render: (value?: string | null) => value ?? '-',
      width: 100,
    },
    {
      title: '创建时间',
      dataIndex: 'createdAtSource',
      key: 'createdAtSource',
      sorter: (a: BugRow, b: BugRow) => 
        new Date(a.createdAtSource).getTime() - new Date(b.createdAtSource).getTime(),
      render: (value: string) => dayjs(value).format('YYYY-MM-DD HH:mm:ss'),
      width: 170,
    },
    {
      title: '闭环时间',
      dataIndex: 'completedAtSource',
      key: 'completedAtSource',
      sorter: (a: BugRow, b: BugRow) => {
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
      title: 'Bug 总数', 
      dataIndex: 'created', 
      key: 'created',
      sorter: (a: MonthlyRow, b: MonthlyRow) => a.created - b.created,
      width: 100,
    },
    { 
      title: '闭环数', 
      dataIndex: 'completed', 
      key: 'completed',
      sorter: (a: MonthlyRow, b: MonthlyRow) => a.completed - b.completed,
      width: 90,
    },
    { 
      title: '已拒绝', 
      dataIndex: 'rejectedCount', 
      key: 'rejectedCount',
      sorter: (a: MonthlyRow, b: MonthlyRow) => a.rejectedCount - b.rejectedCount,
      width: 80,
    },
    { 
      title: '长期演进', 
      dataIndex: 'longTermCount', 
      key: 'longTermCount',
      sorter: (a: MonthlyRow, b: MonthlyRow) => a.longTermCount - b.longTermCount,
      width: 100,
    },
    {
      title: '闭环率',
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
        <Typography.Title level={4} style={{ margin: 0 }}>Bug 详情</Typography.Title>
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
              title={<span style={{ color: '#666', fontSize: 13 }}>已闭环 Bug 数</span>} 
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
              title={<span style={{ color: '#666', fontSize: 13 }}>已拒绝 Bug 数</span>} 
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
              title={<span style={{ color: '#666', fontSize: 13 }}>长期演进 Bug 数</span>} 
              value={demandOverview?.bugLongTermCount ?? 0}
              valueStyle={{ color: '#722ed1' }}
            />
          </Card>
        </Col>
        <Col span={8}>
          <Card 
            loading={demandLoading} 
            style={{ height: 120, borderRadius: 8, boxShadow: '0 1px 2px rgba(0,0,0,0.03)' }}
            bodyStyle={{ padding: '20px 24px' }}
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
        title={<span style={{ fontWeight: 600 }}>月度数据详情</span>}
        style={{ marginTop: 16, borderRadius: 8, boxShadow: '0 1px 2px rgba(0,0,0,0.03)' }}
      >
        <ResizableTable<MonthlyRow>
          rowKey="month"
          dataSource={(demandOverview?.monthlyBug ?? []).slice().reverse()}
          pagination={false}
          size="middle"
          columns={monthlyColumns}
          loading={demandLoading}
        />
      </Card>

      <Card 
        title={<span style={{ fontWeight: 600 }}>Bug 明细</span>}
        style={{ marginTop: 16, borderRadius: 8, boxShadow: '0 1px 2px rgba(0,0,0,0.03)' }}
      >
        <ResizableTable<BugRow>
          rowKey="id"
          dataSource={bugList}
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
      <ProductModuleChart
        data={productModuleData}
        loading={demandLoading}
        title="产品模块分布"
      />
    </div>
  );
}
