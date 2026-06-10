import React from 'react';
import { Card, Row, Col, Statistic, Typography, DatePicker, Space, Tag, Tooltip, Table, Select, Spin } from 'antd';
import { Link } from 'react-router-dom';
import { useKpi, fetchProductModuleDistribution, fetchAgentOverview } from '../../api/kpi';
import type { MonthlyCompletion, ProductModuleDistribution, AgentOverview } from '../../types/kpi';
import { ResizableTable } from '../../components/ResizableTable';
import { ProductModuleChart } from '../../components/ProductModuleChart';
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
  const { demandOverview, demandLoading, dateRange, setDateRange, agentName, setAgentName } = useKpi();
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

  // ===== 按客服汇总 =====
  const [agentOverview, setAgentOverview] = useState<AgentOverview | null>(null);
  const [agentLoading, setAgentLoading] = useState(false);

  useEffect(() => {
    setAgentLoading(true);
    fetchAgentOverview({
      startDate: dateRange[0].format('YYYY-MM-DD'),
      endDate: dateRange[1].format('YYYY-MM-DD'),
      agentName,
    }).then(setAgentOverview).catch(err => {
      console.error('Failed to load agent overview:', err);
      setAgentOverview(null);
    }).finally(() => setAgentLoading(false));
  }, [dateRange, agentName]);

  const mergedAgentRows = React.useMemo(() => {
    return (agentOverview?.rows ?? []).map(r => ({
      agentName: r.agentName,
      reqCreated: r.reqCreated,
      reqCompleted: r.reqCompleted,
      reqRejected: r.reqRejected,
      reqLongTerm: r.reqLongTerm,
      reqCompletionRate: r.reqCompletionRate,
      bugCreated: r.bugCreated,
      bugCompleted: r.bugCompleted,
      bugRejected: r.bugRejected,
      bugLongTerm: r.bugLongTerm,
      bugCompletionRate: r.bugCompletionRate,
      over7NotAdopted: r.over7NotAdopted,
      over30NotClosedReq: r.over30NotClosedReq,
      over30NotClosedBug: r.over30NotClosedBug,
    }));
  }, [agentOverview]);

  // 提取客服名称列表供筛选
  const agentOptions = React.useMemo(() => {
    const names = Array.from(new Set(mergedAgentRows.map(r => r.agentName))).filter(Boolean);
    return names.sort();
  }, [mergedAgentRows]);

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
      // Bug关单率使用 completionRate 字段 - 与 BugDetailPage 一致
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
      title: '需求关单率',
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
      title: 'Bug关单率',
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

  const pageBg = 'linear-gradient(135deg, #f6f8fc 0%, #eef1f6 100%)';

  const glassCard: React.CSSProperties = {
    borderRadius: 16,
    background: 'rgba(255,255,255,0.85)',
    backdropFilter: 'blur(20px)',
    border: '1px solid rgba(255,255,255,0.4)',
    boxShadow: '0 2px 12px rgba(0,0,0,0.05)',
  };

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

  const subChip: React.CSSProperties = {
    flex: 1,
    padding: '8px 12px',
    borderRadius: 10,
    background: 'rgba(255,255,255,0.5)',
    border: '1px solid rgba(0,0,0,0.04)',
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
            需求关单率
          </Typography.Title>
          <Space size="middle">
            <Space size={4}>
              <span style={{ color: 'rgba(255,255,255,0.65)', fontSize: 13 }}>客服</span>
              <Select allowClear placeholder="全部客服" style={{ width: 140 }} value={agentName} onChange={(value) => setAgentName(value ?? undefined)} options={agentOptions.map(name => ({ label: name, value: name }))} />
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
      {/* 第一行：总览 — 需求 + Bug 合并统计 */}
      <Row gutter={16} style={{ marginBottom: 16 }}>
        <Col span={24}>
          <div style={{ ...cardStyle, display: 'flex', flexDirection: 'column', justifyContent: 'space-between', height: '100%' }}>
            <div style={{ position: 'relative', zIndex: 1 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
                <div>
                  <div style={{ ...metricLabel, fontSize: 13, color: '#6366f1' }}>总览</div>
                  <div style={{ ...metricValue, fontSize: 34 }}>
                    {(demandOverview?.totalWithLongTerm ?? 0) + (demandOverview?.bugCount ?? 0)}
                  </div>
                </div>
              </div>
              <div style={{ display: 'flex', gap: 12, marginTop: 6 }}>
                {[
                  { label: '已闭环', value: (demandOverview?.completedCount ?? 0) + (demandOverview?.bugCompletedCount ?? 0) },
                  { label: '已拒绝', value: (demandOverview?.rejectedCount ?? 0) + (demandOverview?.bugRejectedCount ?? 0) },
                  { label: '长期演进', value: (demandOverview?.longTermCount ?? 0) + (demandOverview?.bugLongTermCount ?? 0) },
                  { label: '跟进中', value: (demandOverview?.followUpCount ?? 0) + (demandOverview?.bugFollowUpCount ?? 0) },
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
                <span style={{ fontSize: 11, color: '#6366f1', fontWeight: 600, letterSpacing: '0.3px' }}>综合关单率</span>
                <span style={{ fontSize: 15, fontWeight: 700, color: '#0f172a' }}>
                  {(() => {
                    const total = (demandOverview?.totalWithLongTerm ?? 0) + (demandOverview?.bugCount ?? 0);
                    const longTerm = (demandOverview?.longTermCount ?? 0) + (demandOverview?.bugLongTermCount ?? 0);
                    const completed = (demandOverview?.completedCount ?? 0) + (demandOverview?.bugCompletedCount ?? 0);
                    const rejected = (demandOverview?.rejectedCount ?? 0) + (demandOverview?.bugRejectedCount ?? 0);
                    const effective = total - longTerm;
                    const rate = effective > 0 ? ((completed + rejected) / effective) : 0;
                    return Number((rate * 100).toFixed(1));
                  })()}<span style={{ fontSize: 11, fontWeight: 400, color: '#94a3b8' }}>%</span>
                </span>
              </div>
              <ProgressBar
                rate={(() => {
                  const total = (demandOverview?.totalWithLongTerm ?? 0) + (demandOverview?.bugCount ?? 0);
                  const longTerm = (demandOverview?.longTermCount ?? 0) + (demandOverview?.bugLongTermCount ?? 0);
                  const completed = (demandOverview?.completedCount ?? 0) + (demandOverview?.bugCompletedCount ?? 0);
                  const rejected = (demandOverview?.rejectedCount ?? 0) + (demandOverview?.bugRejectedCount ?? 0);
                  const effective = total - longTerm;
                  return effective > 0 ? ((completed + rejected) / effective) : 0;
                })()}
                accent="linear-gradient(90deg, #6366f1, #4f46e5)"
              />
            </div>
          </div>
        </Col>
      </Row>

      {/* 第二行：需求 vs Bug */}
      <Row gutter={16} style={{ marginBottom: 16 }}>
        {/* 需求 */}
        <Col span={12}>
          <div style={{ ...cardStyle, display: 'flex', flexDirection: 'column', justifyContent: 'space-between', height: '100%' }}>
            <div style={{ position: 'relative', zIndex: 1 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
                <div>
                  <div style={{ ...metricLabel, color: '#2563eb' }}>需求</div>
                  <div style={{ ...metricValue, fontSize: 32 }}>{demandOverview?.totalWithLongTerm ?? 0}</div>
                </div>
              </div>
              <div style={{ display: 'flex', gap: 10, marginTop: 4 }}>
                {[
                  { label: '已闭环', value: demandOverview?.completedCount ?? 0 },
                  { label: '已拒绝', value: demandOverview?.rejectedCount ?? 0 },
                  { label: '长期演进', value: demandOverview?.longTermCount ?? 0 },
                  { label: '跟进中', value: demandOverview?.followUpCount ?? 0 },
                ].map(item => (
                  <div key={item.label} style={{ flex: 1, padding: '8px 12px', borderRadius: 10, background: 'rgba(255,255,255,0.5)', border: '1px solid rgba(0,0,0,0.04)' }}>
                    <span style={{ fontSize: 11, color: '#94a3b8', fontWeight: 500 }}>{item.label}</span>
                    <div style={{ fontSize: 17, fontWeight: 700, color: '#0f172a' }}>{item.value}</div>
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
              <ProgressBar rate={demandOverview?.completionRate ?? 0} accent="linear-gradient(90deg, #2563eb, #1d4ed8)" />
            </div>
          </div>
        </Col>

        {/* Bug */}
        <Col span={12}>
          <div style={{ ...cardStyle, display: 'flex', flexDirection: 'column', justifyContent: 'space-between', height: '100%' }}>
            <div style={{ position: 'relative', zIndex: 1 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
                <div>
                  <div style={{ ...metricLabel, color: '#e11d48' }}>Bug 总览</div>
                  <div style={{ ...metricValue, fontSize: 32 }}>{demandOverview?.bugCount ?? 0}</div>
                </div>
              </div>
              <div style={{ display: 'flex', gap: 10, marginTop: 4 }}>
                {[
                  { label: '已闭环', value: demandOverview?.bugCompletedCount ?? 0 },
                  { label: '已拒绝', value: demandOverview?.bugRejectedCount ?? 0 },
                  { label: '长期演进', value: demandOverview?.bugLongTermCount ?? 0 },
                  { label: '跟进中', value: demandOverview?.bugFollowUpCount ?? 0 },
                ].map(item => (
                  <div key={item.label} style={{ flex: 1, padding: '8px 12px', borderRadius: 10, background: 'rgba(255,255,255,0.5)', border: '1px solid rgba(0,0,0,0.04)' }}>
                    <span style={{ fontSize: 11, color: '#94a3b8', fontWeight: 500 }}>{item.label}</span>
                    <div style={{ fontSize: 17, fontWeight: 700, color: '#0f172a' }}>{item.value}</div>
                  </div>
                ))}
              </div>
            </div>
            <div style={{ marginTop: 14, paddingTop: 14, borderTop: '1px solid rgba(0,0,0,0.04)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 6 }}>
                <span style={{ fontSize: 11, color: '#e11d48', fontWeight: 600, letterSpacing: '0.3px' }}>关单率</span>
                <span style={{ fontSize: 15, fontWeight: 700, color: '#0f172a' }}>
                  {Number(((demandOverview?.bugCompletionRate ?? 0) * 100).toFixed(1))}<span style={{ fontSize: 11, fontWeight: 400, color: '#94a3b8' }}>%</span>
                </span>
              </div>
              <ProgressBar rate={demandOverview?.bugCompletionRate ?? 0} accent="linear-gradient(90deg, #e11d48, #be123c)" />
            </div>
          </div>
        </Col>
      </Row>
      </Spin>

      {/* 按月汇总 */}
      <Card
        title={
          <Space>
            <span style={{ display: 'inline-block', width: 3, height: 16, background: 'linear-gradient(180deg, #667eea, #764ba2)', borderRadius: 2 }} />
            <span style={{ fontSize: 15, fontWeight: 600, color: '#1a1a2e' }}>按月汇总</span>
          </Space>
        }
        style={{ ...glassCard, marginTop: 0 }}
        bodyStyle={{ padding: '16px 24px' }}
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

      {/* 最近需求 + 最近 Bug 双栏布局 */}
      <Row gutter={16} style={{ marginTop: 16 }}>
        <Col span={12}>
          <Card
            title={
              <Space>
                <span style={{ display: 'inline-block', width: 3, height: 16, background: 'linear-gradient(180deg, #667eea, #764ba2)', borderRadius: 2 }} />
                <span style={{ fontSize: 15, fontWeight: 600, color: '#1a1a2e' }}>最近需求</span>
              </Space>
            }
            style={glassCard}
            bodyStyle={{ padding: '16px 24px' }}
            extra={<Link to="/demand/requirements" style={{ fontSize: 13, color: '#667eea' }}>查看全部 →</Link>}
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
        </Col>
        <Col span={12}>
          <Card
            title={
              <Space>
                <span style={{ display: 'inline-block', width: 3, height: 16, background: 'linear-gradient(180deg, #f093fb, #f5576c)', borderRadius: 2 }} />
                <span style={{ fontSize: 15, fontWeight: 600, color: '#1a1a2e' }}>最近 Bug</span>
              </Space>
            }
            style={glassCard}
            bodyStyle={{ padding: '16px 24px' }}
            extra={<Link to="/demand/bugs" style={{ fontSize: 13, color: '#667eea' }}>查看全部 →</Link>}
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
        </Col>
      </Row>

      {/* 产品模块分布 */}
      <div style={{ marginTop: 16 }}>
        <div style={cardStyle}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 20, paddingBottom: 16, borderBottom: '1px solid rgba(0,0,0,0.04)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <div style={{ width: 3, height: 18, background: 'linear-gradient(180deg, #667eea, #764ba2)', borderRadius: 2 }} />
              <span style={{ fontSize: 15, fontWeight: 600, color: '#1a1a2e', letterSpacing: '0.3px' }}>产品模块分布</span>
            </div>
          </div>
          <ProductModuleChart data={productModuleData} loading={demandLoading} title="" colorScheme="purple" />
        </div>
      </div>
    </div>
  );
}
