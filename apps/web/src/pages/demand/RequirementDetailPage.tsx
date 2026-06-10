import React from 'react';
import { Card, Row, Col, Statistic, Typography, DatePicker, Space, Tag, Tabs, Table, Select, Spin } from 'antd';
import { useKpi, fetchProductModuleDistribution, fetchAgentOverview } from '../api/kpi';
import type { ProductModuleDistribution, AgentOverview } from '../types/kpi';
import { ResizableTable } from '../components/ResizableTable';
import { ProductModuleChart } from '../components/ProductModuleChart';
import dayjs from 'dayjs';

const { RangePicker } = DatePicker;

interface RequirementRow {
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

const statusTextMap: Record<string, string> = {
  'OPEN': '待评估',
  'IN_PROGRESS': '已采纳',
  'DONE': '已闭环',
  'CLOSED': '已闭环',
  'REJECTED': '已拒绝',
};

export function RequirementDetailPage() {
  const { demandOverview, demandLoading, dateRange, setDateRange, agentName, setAgentName } = useKpi();
  const [pageSize, setPageSize] = React.useState(20);
  const [productModuleData, setProductModuleData] = React.useState<ProductModuleDistribution | null>(null);
  const [agentOverview, setAgentOverview] = React.useState<AgentOverview | null>(null);
  const [agentLoading, setAgentLoading] = React.useState(false);

  // 加载产品模块分布数据
  React.useEffect(() => {
    let cancelled = false;
    fetchProductModuleDistribution({
      startDate: dateRange[0].format('YYYY-MM-DD'),
      endDate: dateRange[1].format('YYYY-MM-DD'),
      issueType: '0',
    }).then((data) => {
      if (!cancelled) setProductModuleData(data);
    });
    return () => { cancelled = true; };
  }, [dateRange]);

  // 加载客服汇总数据
  React.useEffect(() => {
    let cancelled = false;
    setAgentLoading(true);
    fetchAgentOverview({
      startDate: dateRange[0].format('YYYY-MM-DD'),
      endDate: dateRange[1].format('YYYY-MM-DD'),
      agentName,
    }).then((data) => {
      if (!cancelled) {
        setAgentOverview(data);
        setAgentLoading(false);
      }
    });
    return () => { cancelled = true; };
  }, [dateRange, agentName]);

  const requirementList: RequirementRow[] = React.useMemo(() => {
    return (demandOverview?.recentRequirements ?? []).filter(r => r.issueType !== 1);
  }, [demandOverview]);

  // 提取客服名称列表供筛选
  const agentOptions = React.useMemo(() => {
    const names = Array.from(new Set((agentOverview?.rows ?? []).map(r => r.agentName))).filter(Boolean);
    return names.sort().map(name => ({ label: name, value: name }));
  }, [agentOverview]);

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
      filters: [...new Set(requirementList.map(r => r.status))].map(s => ({
        text: statusTextMap[s] || s,
        value: s
      })),
      onFilter: (value: unknown, record: RequirementRow) => record.status === value,
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
      width: 110,
    },
    {
      title: '长期演进',
      dataIndex: 'isLongTerm',
      key: 'isLongTerm',
      sorter: (a: RequirementRow, b: RequirementRow) => (a.isLongTerm ? 1 : 0) - (b.isLongTerm ? 1 : 0),
      filters: [
        { text: '是', value: 'true' },
        { text: '否', value: 'false' },
      ],
      onFilter: (value: unknown, record: RequirementRow) => {
        if (value === 'true') return record.isLongTerm === true;
        return record.isLongTerm !== true;
      },
      render: (isLongTerm: boolean) => (
        <Tag color={isLongTerm ? 'orange' : 'default'}>{isLongTerm ? '是' : '否'}</Tag>
      ),
      width: 120,
    },
    {
      title: '创建人',
      dataIndex: 'createdByName',
      key: 'createdByName',
      filters: [...new Set(requirementList.map(r => r.createdByName).filter(Boolean))].map(name => ({ text: name as string, value: name as string })),
      onFilter: (value: unknown, record: RequirementRow) => record.createdByName === value,
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
      title: '闭环时间',
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
      title: '需求总数', 
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
      width: 90,
    },
    {
      title: '关单率',
      key: 'completionRate',
      sorter: (a: MonthlyRow, b: MonthlyRow) => {
        const aRate = a.created - a.longTermCount > 0 ? (a.completed + a.rejectedCount) / (a.created - a.longTermCount) : 0;
        const bRate = b.created - b.longTermCount > 0 ? (b.completed + b.rejectedCount) / (b.created - b.longTermCount) : 0;
        return aRate - bRate;
      },
      render: (_: unknown, record: MonthlyRow) => {
        const effectiveTotal = record.created - record.longTermCount;
        if (effectiveTotal <= 0) return '0.00%';
        const rate = (record.completed + record.rejectedCount) / effectiveTotal;
        return `${(rate * 100).toFixed(2)}%`;
      },
      width: 90,
    },
  ];

  const pageBg = 'linear-gradient(135deg, #f6f8fc 0%, #eef1f6 100%)';

  const cardStyle: React.CSSProperties = {
    borderRadius: 16,
    padding: '24px 28px',
    background: 'rgba(255,255,255,0.78)',
    backdropFilter: 'blur(24px)',
    WebkitBackdropFilter: 'blur(24px)',
    border: '1px solid rgba(255,255,255,0.5)',
    boxShadow: '0 4px 20px rgba(0,0,0,0.05), inset 0 1px 0 rgba(255,255,255,0.9)',
    position: 'relative',
    overflow: 'hidden',
  };

  const glassCard: React.CSSProperties = {
    borderRadius: 16,
    background: 'rgba(255,255,255,0.85)',
    backdropFilter: 'blur(20px)',
    border: '1px solid rgba(255,255,255,0.4)',
    boxShadow: '0 2px 12px rgba(0,0,0,0.05)',
  };

  const metricLabel: React.CSSProperties = {
    fontSize: 11,
    fontWeight: 600,
    letterSpacing: '0.8px',
    textTransform: 'uppercase',
  };

  const metricValue: React.CSSProperties = {
    fontSize: 22,
    fontWeight: 700,
    color: '#0f172a',
    lineHeight: 1.1,
    letterSpacing: '-0.4px',
  };

  const ProgressBar = ({ rate, accent }: { rate: number; accent?: string }) => (
    <div style={{ marginTop: 14 }}>
      <div style={{ height: 5, borderRadius: 3, background: 'rgba(0,0,0,0.06)', overflow: 'hidden' }}>
        <div style={{
          height: '100%',
          borderRadius: 3,
          background: accent || 'linear-gradient(90deg, #667eea, #764ba2)',
          width: `${Math.min(rate * 100, 100)}%`,
          transition: 'width 1s cubic-bezier(0.4, 0, 0.2, 1)',
        }} />
      </div>
    </div>
  );

  return (
    <div style={{ padding: 24, background: pageBg, minHeight: 'calc(100vh - 64px)' }}>
      {/* 头部筛选栏 */}
      <div style={{ marginBottom: 24, padding: '16px 24px', borderRadius: 16, background: 'linear-gradient(135deg, #1a1a2e 0%, #16213e 100%)', boxShadow: '0 8px 32px rgba(26,26,46,0.15)' }}>
        <Row justify="space-between" align="middle">
          <Typography.Title level={4} style={{ margin: 0, fontSize: 18, fontWeight: 700, color: '#fff', letterSpacing: '1px' }}>
            <span style={{ background: 'linear-gradient(90deg, #667eea, #764ba2)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', marginRight: 8 }}>◆</span>
            需求详情
          </Typography.Title>
          <Space size="middle">
            <Space size={4}>
              <span style={{ color: 'rgba(255,255,255,0.65)', fontSize: 13 }}>客服</span>
              <Select allowClear placeholder="全部客服" style={{ width: 140 }} value={agentName} onChange={(value) => setAgentName(value ?? undefined)} options={agentOptions} />
            </Space>
            <Space size={4}>
              <span style={{ color: 'rgba(255,255,255,0.65)', fontSize: 13 }}>日期</span>
              <RangePicker value={dateRange} onChange={(dates) => dates && setDateRange(dates as [dayjs.Dayjs, dayjs.Dayjs])} format="YYYY-MM-DD" />
            </Space>
          </Space>
        </Row>
      </div>

      {/* 核心指标卡片 */}
      <Spin spinning={demandLoading} size="large">
      <Row gutter={16} style={{ marginBottom: 16 }}>
        <Col span={24}>
          <div style={{ ...cardStyle, display: 'flex', flexDirection: 'column', justifyContent: 'space-between', height: '100%' }}>
            <div style={{ position: 'relative', zIndex: 1 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
                <div>
                  <div style={{ ...metricLabel, fontSize: 13, color: '#2563eb' }}>需求总览</div>
                  <div style={{ ...metricValue, fontSize: 34 }}>
                    {demandOverview?.totalWithLongTerm ?? 0}
                  </div>
                </div>
              </div>
              <div style={{ display: 'flex', gap: 12, marginTop: 6 }}>
                {[
                  { label: '已闭环', value: demandOverview?.completedCount ?? 0 },
                  { label: '已拒绝', value: demandOverview?.rejectedCount ?? 0 },
                  { label: '长期演进', value: demandOverview?.longTermCount ?? 0 },
                  { label: '跟进中', value: demandOverview?.followUpCount ?? 0 },
                ].map(item => (
                  <div key={item.label} style={{ flex: 1, padding: '10px 16px', borderRadius: 10, background: 'rgba(0,0,0,0.02)', border: '1px solid rgba(0,0,0,0.04)' }}>
                    <span style={{ fontSize: 11, color: '#94a3b8', fontWeight: 500 }}>{item.label}</span>
                    <div style={{ fontSize: 20, fontWeight: 700, color: '#0f172a' }}>{item.value}</div>
                  </div>
                ))}
              </div>
            </div>
            <div style={{ marginTop: 14, paddingTop: 14, borderTop: '1px solid rgba(0,0,0,0.04)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 6 }}>
                <span style={{ fontSize: 11, color: '#2563eb', fontWeight: 600, letterSpacing: '0.3px' }}>关单率</span>
                <span style={{ fontSize: 15, fontWeight: 700, color: '#0f172a' }}>
                  {Number(((demandOverview?.completionRate ?? 0) * 100).toFixed(1))}<span style={{ fontSize: 11, fontWeight: 400, color: '#94a3b8' }}>%</span>
                </span>
              </div>
              <ProgressBar
                rate={demandOverview?.completionRate ?? 0}
                accent="linear-gradient(90deg, #2563eb, #1d4ed8)"
              />
            </div>
          </div>
        </Col>
      </Row>
      </Spin>

      {/* 汇总数据 */}
      <Card
        title={
          <Space>
            <span style={{ display: 'inline-block', width: 3, height: 16, background: 'linear-gradient(180deg, #667eea, #764ba2)', borderRadius: 2 }} />
            <span style={{ fontSize: 15, fontWeight: 600, color: '#1a1a2e' }}>汇总数据</span>
          </Space>
        }
        extra={<Tag color="blue">已剔除长期演进</Tag>}
        style={{ marginTop: 16, ...glassCard }}
        bodyStyle={{ padding: '16px 24px' }}
      >
        <Tabs defaultActiveKey="monthly" items={[
          {
            key: 'monthly',
            label: '按月汇总',
            children: (
              <ResizableTable<MonthlyRow>
                rowKey="month"
                dataSource={(demandOverview?.monthlyRequirement ?? []).slice().reverse()}
                pagination={false}
                size="middle"
                columns={monthlyColumns}
                loading={demandLoading}
              />
            ),
          },
        ]} />
      </Card>

      {/* 需求明细 */}
      <Card
        title={
          <Space>
            <span style={{ display: 'inline-block', width: 3, height: 16, background: 'linear-gradient(180deg, #667eea, #764ba2)', borderRadius: 2 }} />
            <span style={{ fontSize: 15, fontWeight: 600, color: '#1a1a2e' }}>需求明细</span>
          </Space>
        }
        style={{ marginTop: 16, ...glassCard }}
        bodyStyle={{ padding: '16px 24px' }}
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

      {/* 产品模块分布 */}
      <div style={{ marginTop: 16 }}>
        <div style={cardStyle}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 20, paddingBottom: 16, borderBottom: '1px solid rgba(0,0,0,0.04)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <div style={{ width: 3, height: 18, background: 'linear-gradient(180deg, #667eea, #764ba2)', borderRadius: 2 }} />
              <span style={{ fontSize: 15, fontWeight: 600, color: '#1a1a2e', letterSpacing: '0.3px' }}>产品模块分布</span>
            </div>
          </div>
          <ProductModuleChart
            data={productModuleData}
            loading={demandLoading}
            title=""
            colorScheme="blue"
          />
        </div>
      </div>
    </div>
  );
}
