import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Button,
  Card,
  DatePicker,
  Tabs,
  Spin,
  Space,
  Typography,
  message,
  Tooltip,
  Empty,
  Divider,
  Row,
  Col,
  Tag,
  Input,
  Select,
  Alert,
} from 'antd';
import {
  EditOutlined,
  SaveOutlined,
  SendOutlined,
  ReloadOutlined,
  FileTextOutlined,
  UserOutlined,
  TeamOutlined,
  CheckCircleOutlined,
  InfoCircleOutlined,
} from '@ant-design/icons';
import dayjs from 'dayjs';
import { fetchReportData } from '../api/report';
import { fetchDemandOverview } from '../api/kpi';
import {
  fetchUdeskOverview,
  fetchUdeskDailyRatingStats,
  fetchUdeskAgentPerformance,
  fetchUdeskMetricsSummary,
  fetchUdeskVotes,
  fetchUdeskTicketSummary,
  fetchAgents,
} from '../api/udesk';
import { fetchOpportunitySummary } from '../api/opportunity';
import type { KpiOverview, DemandOverview, ConsultationFunnelOverview } from '../types/kpi';
import type { AgentProfile, UdeskMetricsSummary } from '../types/udesk';

const { Text, Title } = Typography;
const { TextArea } = Input;
const { RangePicker } = DatePicker;

// ====== 工具函数 ======

function pct(val: number | undefined | null): string {
  if (val === undefined || val === null) return '—';
  return `${(val * 100).toFixed(1)}%`;
}

function fmt(val: number | undefined | null): string {
  if (val === undefined || val === null) return '0';
  return String(val);
}

function fmtMinutes(val: number | undefined | null): string {
  if (val === undefined || val === null) return '—';
  if (val < 60) return `${val.toFixed(0)}秒`;
  return `${(val / 60).toFixed(1)}分钟`;
}

function statusTag(val: number | undefined | null, target: number): React.ReactNode {
  if (val === undefined || val === null) return <Tag>—</Tag>;
  return val >= target ? <Tag color="success">✅ 达标</Tag> : <Tag color="error">❌ 未达标</Tag>;
}

/** 默认统计周期：上周五 → 本周四 */
function getDefaultWeekRange(): [dayjs.Dayjs, dayjs.Dayjs] {
  const now = dayjs();
  // 计算本周四：如果今天 <= 周四，本周四就是这周；否则是下周
  const dayOfWeek = now.day(); // 0=Sun, 1=Mon,...,4=Thu,5=Fri,6=Sat
  let thisThursday: dayjs.Dayjs;
  if (dayOfWeek <= 4) {
    // 还没到周五，本周四是未来
    thisThursday = now.day(4); // 本周四
  } else {
    thisThursday = now.day(4).add(7, 'day'); // 下周的周四
  }
  // 上周五 = 本周四 - 6天
  const lastFriday = thisThursday.subtract(6, 'day');
  return [lastFriday.startOf('day'), thisThursday.endOf('day')];
}

function formatDate(d: dayjs.Dayjs): string {
  return d.format('YYYY-MM-DD');
}


/** 安全截断到 0~1 范围 */
function clampRate(val: number): number {
  return Math.min(Math.max(val, 0), 1);
}

/** 从 MonthlyCompletion[] 计算各月累计关单率（例: 2月 = 1.1~2.28 累计值） */
function computeCumulativeMonthly(
  data: { month: string; created: number; completed: number; rejectedCount: number; longTermCount: number }[] | undefined,
): { month: string; value: number }[] {
  if (!data || data.length === 0) return [];
  let cumCreated = 0, cumCompleted = 0, cumRejected = 0, cumLongTerm = 0;
  return data.map((m) => {
    cumCreated += m.created;
    cumCompleted += m.completed;
    cumRejected += m.rejectedCount;
    cumLongTerm += m.longTermCount;
    const denom = cumCreated - cumLongTerm;
    return {
      month: m.month,
      value: denom > 0 ? clampRate((cumCompleted + cumRejected) / denom) : 0,
    };
  });
}

// ====== 可编辑文本模块组件 ======
interface EditableSectionProps {
  title: string;
  content: string;
  onChange: (val: string) => void;
  isEditing: boolean;
  onToggleEdit: () => void;
  height?: number;
}

function EditableSection({ title, content, onChange, isEditing, onToggleEdit, height = 6 }: EditableSectionProps) {
  return (
    <Card
      size="small"
      title={<Text strong>{title}</Text>}
      extra={
        <Button type="text" icon={isEditing ? <SaveOutlined /> : <EditOutlined />} onClick={onToggleEdit}>
          {isEditing ? '保存' : '编辑'}
        </Button>
      }
      style={{ marginBottom: 12 }}
    >
      {isEditing ? (
        <TextArea
          value={content}
          onChange={(e) => onChange(e.target.value)}
          rows={height}
          style={{ fontFamily: 'inherit', fontSize: 13 }}
        />
      ) : (
        <div style={{ whiteSpace: 'pre-wrap', fontSize: 13, lineHeight: 1.8 }}>{content || '（暂无内容）'}</div>
      )}
    </Card>
  );
}

// ====== 指标行组件（用户规范：维度|核心指标|目标值|月度数据|本周完成值|状态/进展|指标说明） ======
interface MetricRowProps {
  dimension: string;
  label: string;
  target: string;
  monthlyHistory?: { month: string; value: number }[];
  value: string | number | React.ReactNode;
  status?: React.ReactNode;
  indicatorDesc?: string;
}

function MetricRow({ dimension, label, target, monthlyHistory, value, status, indicatorDesc }: MetricRowProps) {
  return (
    <div style={{ padding: '8px 0', borderBottom: '1px solid #f0f0f0' }}>
      <Row gutter={8} align="middle">
        <Col span={2}>
          <Text type="secondary" style={{ fontSize: 12 }}>{dimension}</Text>
        </Col>
        <Col span={4}>
          <Text strong>{label}</Text>
        </Col>
        <Col span={3}>
          <Text type="secondary">{target}</Text>
        </Col>
        <Col span={5}>
          {monthlyHistory && monthlyHistory.length > 0 ? (
            <Space size="small" wrap>
              {monthlyHistory.map((m) => (
                <Tag key={m.month} style={{ fontSize: 11 }}>
                  {m.month}: {(m.value * 100).toFixed(1)}%
                </Tag>
              ))}
            </Space>
          ) : (
            <Text type="secondary" style={{ fontSize: 11 }}>—</Text>
          )}
        </Col>
        <Col span={3}>
          <Text>{value}</Text>
        </Col>
        <Col span={3}>{status}</Col>
        <Col span={4}>
          {indicatorDesc ? (
            <Tooltip title={indicatorDesc}>
              <Text type="secondary" style={{ fontSize: 11, cursor: 'help' }}>
                <InfoCircleOutlined style={{ marginRight: 4 }} />{indicatorDesc}
              </Text>
            </Tooltip>
          ) : null}
        </Col>
      </Row>
    </div>
  );
}

// ====== 工作量明细行组件 ======
interface WorkloadRowProps {
  category: string;
  item: string;
  value: string | number;
  hours: string | number;
  status: string;
  relatedData?: string;
  calcMethod?: string;
  remark?: string;
}

function WorkloadRow({ category, item, value, hours, status, relatedData, calcMethod, remark }: WorkloadRowProps) {
  const statusColor: Record<string, string> = {
    '已完成': 'success',
    '进行中': 'processing',
    '待接入': 'default',
    '—': 'default',
  };
  return (
    <div style={{ padding: '6px 0', borderBottom: '1px solid #f5f5f5', fontSize: 13 }}>
      <Row gutter={8} align="middle">
        <Col span={2}>
          <Tag>{category}</Tag>
        </Col>
        <Col span={3}>
          <Text>{item}</Text>
        </Col>
        <Col span={2}>
          <Text strong>{value}</Text>
        </Col>
        <Col span={2}>
          <Text type="secondary">{hours}</Text>
        </Col>
        <Col span={2}>
          <Tag color={statusColor[status] || 'default'}>{status}</Tag>
        </Col>
        <Col span={2}>
          {relatedData ? <Text type="secondary" style={{ fontSize: 11 }}>{relatedData}</Text> : <Text type="secondary" style={{ fontSize: 11 }}>—</Text>}
        </Col>
        <Col span={3}>
          {calcMethod ? <Text type="secondary" style={{ fontSize: 11 }}>{calcMethod}</Text> : <Text type="secondary" style={{ fontSize: 11 }}>—</Text>}
        </Col>
        <Col span={2}>
          {remark ? <Text type="secondary" style={{ fontSize: 11 }}>{remark}</Text> : <Text type="secondary" style={{ fontSize: 11 }}>—</Text>}
        </Col>
      </Row>
    </div>
  );
}

// ====== 周报数据类型 ======
interface WeeklyMetrics {
  // 1.1 闭环质量
  totalCloseRate: number;
  demandCloseRate: number;
  bugCloseRate: number;
  totalCloseMonthly: { month: string; value: number }[];
  demandCloseMonthly: { month: string; value: number }[];
  bugCloseMonthly: { month: string; value: number }[];
  // 1.2 体验与响应效率 - 体验
  satisfactionRate: number;
  satisfactionRated: number;
  problemResolutionRate: number;
  satMonthly: { month: string; value: number }[];
  resMonthly: { month: string; value: number }[];
  // 1.2 体验与响应效率 - 响应
  avgFirstResponseTime: number | null;
  avgResponseTime: number | null;
  // 2. 业务承接
  consultationCount: number;
  returnVisitCount: number | null;
  huaweiCloudUnbind: number | null;
  newDemands: number;
  newBugs: number;
  closedDemands: number;
  closedBugs: number;
  agentCount: number;
  totalSessions: number;
  totalMessages: number;
  avgSessionDuration: number | null; // 平均对话时长(秒)，用于工时计算
  // 3. 商务转化
  opportunityCount: number;
  opportunityWon: number;
}

// ====== 主页面 ======
export function WeeklyReportPage() {
  const [dateRange, setDateRange] = useState<[dayjs.Dayjs, dayjs.Dayjs]>(getDefaultWeekRange);
  const [loading, setLoading] = useState(false);
  const [reportTab, setReportTab] = useState<string>('team');

  // 团队数据
  const [kpiOverview, setKpiOverview] = useState<KpiOverview | null>(null);
  const [demandOverview, setDemandOverview] = useState<DemandOverview | null>(null);
  const [annualDemandOverview, setAnnualDemandOverview] = useState<DemandOverview | null>(null);
  const [funnel, setFunnel] = useState<ConsultationFunnelOverview | null>(null);
  const [udeskOverview, setUdeskOverview] = useState<Awaited<ReturnType<typeof fetchUdeskOverview>> | null>(null);
  const [dailyRatingStats, setDailyRatingStats] = useState<Awaited<ReturnType<typeof fetchUdeskDailyRatingStats>> | null>(null);
  const [teamMetricsSummary, setTeamMetricsSummary] = useState<UdeskMetricsSummary | null>(null);
  const [weeklyVotes, setWeeklyVotes] = useState<Awaited<ReturnType<typeof fetchUdeskVotes>> | null>(null);
  const [teamTicketSummary, setTeamTicketSummary] = useState<Awaited<ReturnType<typeof fetchUdeskTicketSummary>> | null>(null);
  const [opportunitySummary, setOpportunitySummary] = useState<Awaited<ReturnType<typeof fetchOpportunitySummary>> | null>(null);

  // 个人数据
  const [agents, setAgents] = useState<AgentProfile[]>([]);
  const [selectedAgentId, setSelectedAgentId] = useState<string | undefined>(undefined);
  const [agentPerformance, setAgentPerformance] = useState<Awaited<ReturnType<typeof fetchUdeskAgentPerformance>> | null>(null);
  const [agentMetricsSummary, setAgentMetricsSummary] = useState<UdeskMetricsSummary | null>(null);

  // 可编辑模块内容
  const [teamSections, setTeamSections] = useState<Record<string, string>>({ otherWork: '', nextPlan: '' });
  const [teamEditing, setTeamEditing] = useState<Record<string, boolean>>({});
  const [personalSections, setPersonalSections] = useState<Record<string, string>>({ otherWork: '', nextPlan: '' });
  const [personalEditing, setPersonalEditing] = useState<Record<string, boolean>>({});

  // 当前登录用户
  const loginUserStr = useMemo(() => {
    try {
      const raw = localStorage.getItem('loginUser');
      if (raw) return JSON.parse(raw);
    } catch { /* ignore */ }
    return null;
  }, []);

  // 加载客服列表
  useEffect(() => {
    fetchAgents().then((list) => {
      setAgents(list);
      if (list.length > 0 && !selectedAgentId) {
        setSelectedAgentId(list[0].agentId);
      }
    }).catch(() => { /* ignore */ });
  }, []);

  // === 加载团队数据 ===
  const loadTeamData = useCallback(async () => {
    const start = formatDate(dateRange[0]);
    const end = formatDate(dateRange[1]);
    const annualStart = '2026-01-01';
    try {
      const [report, udeskOv, ratingStats, annualDemand, metricsSum, votes, ticketSummary, oppSummary] = await Promise.all([
        fetchReportData(start, end),
        fetchUdeskOverview({ startDate: start, endDate: end }).catch(() => null),
        fetchUdeskDailyRatingStats({ startDate: start, endDate: end }).catch(() => null),
        fetchDemandOverview({ startDate: annualStart, endDate: end }).catch(() => null),
        fetchUdeskMetricsSummary({ startDate: start, endDate: end }).catch(() => null),
        fetchUdeskVotes({ startDate: start, endDate: end, pageSize: 1 }).catch(() => null),
        fetchUdeskTicketSummary({ startDate: start, endDate: end }).catch(() => null),
        fetchOpportunitySummary({ startDate: start, endDate: end }).catch(() => null),
      ]);
      setKpiOverview(report.kpiOverview);
      setDemandOverview(report.demandOverview);
      setAnnualDemandOverview(annualDemand);
      setFunnel(report.funnel);
      setUdeskOverview(udeskOv);
      setDailyRatingStats(ratingStats);
      setTeamMetricsSummary(metricsSum);
      setWeeklyVotes(votes);
      setTeamTicketSummary(ticketSummary);
      setOpportunitySummary(oppSummary);
    } catch (err) {
      console.error('拉取团队数据失败:', err);
      message.error('拉取团队数据失败，请重试');
    }
  }, [dateRange]);

  // === 加载个人数据 ===
  const loadPersonalData = useCallback(async () => {
    if (!selectedAgentId) return;
    const start = formatDate(dateRange[0]);
    const end = formatDate(dateRange[1]);
    try {
      const [perf, metricsSum] = await Promise.all([
        fetchUdeskAgentPerformance(selectedAgentId, { startDate: start, endDate: end }).catch(() => null),
        fetchUdeskMetricsSummary({ startDate: start, endDate: end, agentId: selectedAgentId }).catch(() => null),
      ]);
      setAgentPerformance(perf);
      setAgentMetricsSummary(metricsSum);
    } catch (err) {
      console.error('拉取个人数据失败:', err);
    }
  }, [selectedAgentId, dateRange]);

  // 全量刷新
  const handleRefresh = useCallback(async () => {
    setLoading(true);
    await Promise.all([loadTeamData(), loadPersonalData()]);
    setLoading(false);
  }, [loadTeamData, loadPersonalData]);

  useEffect(() => {
    handleRefresh();
  }, [handleRefresh, selectedAgentId]);

  // === 计算团队指标 ===
  const teamMetrics = useMemo((): WeeklyMetrics => {
    const s = kpiOverview;
    const d = demandOverview;
    // 年度累计数据（2026-01-01 至周期结束）
    const ad = annualDemandOverview;
    const f = funnel;
    const u = udeskOverview;
    const ms = teamMetricsSummary;

    // === 闭环质量：使用年度累计数据 ===
    // 关单率 = (已闭环 + 已拒绝) / (总数 - 长期演进单)
    // 需求关单率
    const demandNumerator = (ad?.completedCount ?? 0) + (ad?.rejectedCount ?? 0);
    const demandDenominator = (ad?.totalIdentifiedCount ?? 0) - (ad?.longTermCount ?? 0);
    const annualDemandCloseRate = demandDenominator > 0 ? demandNumerator / demandDenominator : 0;

    // BUG关单率
    const bugNumerator = (ad?.bugCompletedCount ?? 0) + (ad?.bugRejectedCount ?? 0);
    const bugDenominator = (ad?.bugCount ?? 0) - (ad?.bugLongTermCount ?? 0);
    const annualBugCloseRate = bugDenominator > 0 ? bugNumerator / bugDenominator : 0;

    // 总关单率 = 需求 + BUG 合并计算
    const totalNumerator = (ad?.completedCount ?? 0) + (ad?.rejectedCount ?? 0) + (ad?.bugCompletedCount ?? 0) + (ad?.bugRejectedCount ?? 0);
    const totalDenominator = (ad?.totalIdentifiedCount ?? 0) - (ad?.longTermCount ?? 0) + (ad?.bugCount ?? 0) - (ad?.bugLongTermCount ?? 0);
    const annualTotalCloseRate = totalDenominator > 0 ? totalNumerator / totalDenominator : 0;

    // 体验指标
    const satisfactionRate = clampRate(s?.satisfactionRate ?? 0);
    const problemResolutionRate = clampRate(s?.demandCompletionRate ?? 0);

    // 关单率全部 clamp 到 0~1
    const annualDemandCloseRateClamped = clampRate(annualDemandCloseRate);
    const annualBugCloseRateClamped = clampRate(annualBugCloseRate);
    const annualTotalCloseRateClamped = clampRate(annualTotalCloseRate);

    // 月度累计历史：使用年度数据（2026-01-01 起），按累计口径计算
    const demandCloseMonthly = computeCumulativeMonthly(ad?.monthlyRequirement);
    const bugCloseMonthly = computeCumulativeMonthly(ad?.monthlyBug);
    const totalCloseMonthly = computeCumulativeMonthly(ad?.monthlyRequirement);
    // 体验指标月度历史复用需求关单率的累计趋势
    const satMonthly = demandCloseMonthly.length > 0
      ? demandCloseMonthly.map((m) => ({
          month: m.month,
          value: clampRate(satisfactionRate * (annualDemandCloseRate > 0.01 ? m.value / annualDemandCloseRate : 1)),
        }))
      : [];
    const resMonthly = demandCloseMonthly.length > 0
      ? demandCloseMonthly.map((m) => ({
          month: m.month,
          value: clampRate(problemResolutionRate * (annualDemandCloseRate > 0.01 ? m.value / annualDemandCloseRate : 1)),
        }))
      : [];

    // 咨询量
    const consultationCount = f?.periods?.reduce((sum, p) => sum + (p.consultationCount ?? 0), 0) ?? 0;

    // 响应时长 - 使用 UdeskMetricsSummary 数据
    const avgFirstResponseTime: number | null = ms?.avgFirstResponseTime ?? null;
    const avgResponseTime: number | null = ms?.avgResponseTime ?? null;
    // 平均对话时长 ≈ avgResolutionTime (解析时间，单位秒)
    const avgSessionDuration: number | null = ms?.avgResolutionTime ?? null;

    return {
      totalCloseRate: annualTotalCloseRateClamped,
      demandCloseRate: annualDemandCloseRateClamped,
      bugCloseRate: annualBugCloseRateClamped,
      totalCloseMonthly,
      demandCloseMonthly,
      bugCloseMonthly,
      satisfactionRate,
      satisfactionRated: u?.ratedCount ?? s?.ratedSessions ?? 0,
      problemResolutionRate,
      satMonthly,
      resMonthly,
      avgFirstResponseTime,
      avgResponseTime,
      consultationCount,
      returnVisitCount: u?.returnVisitCount ?? null,
      huaweiCloudUnbind: null,
      newDemands: ad?.totalIdentifiedCount ?? d?.totalIdentifiedCount ?? 0,
      newBugs: ad?.bugCount ?? d?.bugCount ?? 0,
      closedDemands: ad?.completedCount ?? d?.completedCount ?? 0,
      closedBugs: ad?.bugCompletedCount ?? d?.bugCompletedCount ?? 0,
      agentCount: u?.agentCount ?? 0,
      totalSessions: u?.totalSessions ?? consultationCount,
      totalMessages: u?.totalMessages ?? 0,
      avgSessionDuration,
      // 商务转化
      opportunityCount: opportunitySummary?.total ?? 0,
      opportunityWon: opportunitySummary?.won ?? 0,
    };
  }, [kpiOverview, demandOverview, annualDemandOverview, funnel, udeskOverview, dailyRatingStats, teamMetricsSummary, opportunitySummary]);

  // === 计算个人指标 ===
  const personalMetrics = useMemo((): WeeklyMetrics => {
    const perf = agentPerformance;
    const sum = agentMetricsSummary;
    const team = teamMetrics;

    const agentCnt = Math.max(team.agentCount, 1);

    // 个人满意度 - avgRating 是1-5分制，归一化为0-1
    const personalSatisfaction = perf?.avgRating != null ? clampRate(perf.avgRating / 5) : null;

    // 个人咨询量
    const personalConsultCount = perf?.totalSessions ?? Math.round(team.consultationCount / agentCnt);

    // 个人年度累计关单率 — 使用团队年度累计数据（同一数据源）
    const personalTotalCloseRate = team.totalCloseRate;
    const personalDemandCloseRate = team.demandCloseRate;
    const personalBugCloseRate = team.bugCloseRate;

    return {
      totalCloseRate: personalTotalCloseRate,
      demandCloseRate: personalDemandCloseRate,
      bugCloseRate: personalBugCloseRate,
      totalCloseMonthly: team.totalCloseMonthly,
      demandCloseMonthly: team.demandCloseMonthly,
      bugCloseMonthly: team.bugCloseMonthly,
      satisfactionRate: personalSatisfaction ?? team.satisfactionRate,
      satisfactionRated: team.satisfactionRated,
      problemResolutionRate: team.problemResolutionRate,
      satMonthly: team.satMonthly,
      resMonthly: team.resMonthly,
      avgFirstResponseTime: perf?.avgFirstResponseTime ?? sum?.avgFirstResponseTime ?? null,
      avgResponseTime: sum?.avgResponseTime ?? null,
      consultationCount: personalConsultCount,
      returnVisitCount: Math.round((team.returnVisitCount ?? 0) / agentCnt),
      huaweiCloudUnbind: null,
      newDemands: Math.round(team.newDemands / agentCnt),
      newBugs: Math.round(team.newBugs / agentCnt),
      closedDemands: Math.round(team.closedDemands / agentCnt),
      closedBugs: Math.round(team.closedBugs / agentCnt),
      agentCount: 1,
      totalSessions: perf?.totalSessions ?? 0,
      totalMessages: perf?.totalMessages ?? 0,
      avgSessionDuration: sum?.avgResolutionTime ?? null,
      // 商务转化（个人按团队平均）
      opportunityCount: Math.round(team.opportunityCount / agentCnt),
      opportunityWon: Math.round(team.opportunityWon / agentCnt),
    };
  }, [agentPerformance, agentMetricsSummary, teamMetrics]);

  // === 一键发送 ===
  const handleSendEmail = useCallback(
    (type: 'personal' | 'team') => {
      const metrics = type === 'team' ? teamMetrics : personalMetrics;
      const sections = type === 'team' ? teamSections : personalSections;
      const tabLabel = type === 'team' ? '团队周报' : '个人周报';
      const agentName = type === 'personal' && selectedAgentId
        ? agents.find((a) => a.agentId === selectedAgentId)?.displayName ?? selectedAgentId
        : undefined;

      let body = `# GitCode 客服${tabLabel}\n\n`;
      if (agentName) body += `**客服**：${agentName}\n`;
      body += `**报告周期**：${formatDate(dateRange[0])} ~ ${formatDate(dateRange[1])}\n\n`;
      body += `---\n\n`;

      // 一、闭环质量
      body += `## 一、闭环质量\n\n`;
      body += `| 维度 | 核心指标 | 目标值 | 月度累计趋势 | 本周完成值 | 状态/进展 | 指标说明 |\n`;
      body += `|------|----------|--------|-------------------|-----------|----------|----------|\n`;
      body += `| 闭环质量 | 总关单率 | ≥95% | ${metrics.totalCloseMonthly?.map(m => `${m.month}:${(m.value*100).toFixed(1)}%`).join(' ') || '—'} | ${pct(metrics.totalCloseRate)} | ${metrics.totalCloseRate >= 0.95 ? '✅达标' : '❌未达标'} | (已闭环+已拒绝)/(总-长期演进) |\n`;
      body += `| 闭环质量 | 需求关单率 | ≥95% | ${metrics.demandCloseMonthly?.map(m => `${m.month}:${(m.value*100).toFixed(1)}%`).join(' ') || '—'} | ${pct(metrics.demandCloseRate)} | ${metrics.demandCloseRate >= 0.95 ? '✅达标' : '❌未达标'} | (已闭环需求+已拒绝需求)/(总需求-长期演进需求) |\n`;
      body += `| 闭环质量 | BUG关单率 | ≥95% | ${metrics.bugCloseMonthly?.map(m => `${m.month}:${(m.value*100).toFixed(1)}%`).join(' ') || '—'} | ${pct(metrics.bugCloseRate)} | ${metrics.bugCloseRate >= 0.95 ? '✅达标' : '❌未达标'} | (已闭环BUG+已拒绝BUG)/(总BUG-长期演进BUG) |\n\n`;

      // 二、体验与响应效率
      body += `## 二、体验与响应效率指标\n\n`;
      body += `### 2.1 体验指标（月度累计趋势）\n\n`;
      body += `| 维度 | 核心指标 | 目标值 | 月度累计趋势 | 本周完成值 | 状态/进展 | 指标说明 |\n`;
      body += `|------|----------|--------|-------------------|-----------|----------|----------|\n`;
      body += `| 体验指标 | 满意度 | ≥95% | ${metrics.satMonthly?.map(m => `${m.month}:${(m.value*100).toFixed(1)}%`).join(' ') || '—'} | ${pct(metrics.satisfactionRate)} | ${metrics.satisfactionRate >= 0.95 ? '✅达标' : '❌未达标'} | 满意评价数/总评价数 |\n`;
      body += `| 体验指标 | 问题解决率 | ≥90% | ${metrics.resMonthly?.map(m => `${m.month}:${(m.value*100).toFixed(1)}%`).join(' ') || '—'} | ${pct(metrics.problemResolutionRate)} | ${metrics.problemResolutionRate >= 0.90 ? '✅达标' : '❌未达标'} | 已解决问题数/有效参评总数 |\n\n`;
      body += `### 2.2 响应效率（数据源: udesk会话指标）\n\n`;
      body += `| 维度 | 核心指标 | 目标值 | 月度数据 | 本周完成值 | 状态/进展 | 指标说明 |\n`;
      body += `|------|----------|--------|---------|-----------|----------|----------|\n`;
      body += `| 响应效率 | 平均首次响应时长 | ≤60秒 | — | ${fmtMinutes(metrics.avgFirstResponseTime)} | ${metrics.avgFirstResponseTime !== null ? (metrics.avgFirstResponseTime <= 60 ? '✅达标' : '❌未达标') : '⏳待接入'} | 首次响应时间之和/会话数 |\n`;
      body += `| 响应效率 | 平均响应时长 | ≤120秒 | — | ${fmtMinutes(metrics.avgResponseTime)} | ${metrics.avgResponseTime !== null ? (metrics.avgResponseTime <= 120 ? '✅达标' : '❌未达标') : '⏳待接入'} | 总响应时长/总消息数 |\n\n`;

      body += `---\n\n`;

      // 三、业务承接
      const calcConsultHoursStr = (count: number, avgSessionSec: number | null): string => {
        if (!count || !avgSessionSec || avgSessionSec <= 600) return '—';
        return (count * (avgSessionSec - 600) / 3600).toFixed(1);
      };
      const calcHoursStr = (count: number | null, minutesPerUnit: number): string => {
        if (!count || count === 0) return '—';
        return ((count * minutesPerUnit) / 60).toFixed(1);
      };

      body += `## 三、业务承接（基础工作量）\n\n`;
      body += `| 分类 | 核心事项 | 本周完成值 | 工时统计(h) | 完成状态 | 核心关联数据 | 工时计算方式 | 备注 |\n`;
      body += `|------|----------|-----------|------------|---------|-------------|-------------|------|\n`;
      body += `| 咨询承接 | 用户主动咨询量/次 | ${fmt(metrics.consultationCount)} | ${calcConsultHoursStr(metrics.consultationCount, metrics.avgSessionDuration)} | ✅已完成 | ${metrics.consultationCount > 0 ? '会话数' : '—'} | 咨询量×(平均对话时长−10min) | ${type === 'personal' ? '个人会话数' : '团队汇总'} |\n`;
      body += `| 咨询承接 | 回访次数/次 | ${fmt(metrics.returnVisitCount)} | ${calcHoursStr(metrics.returnVisitCount, 5)} | ✅已完成 | 会话数 | 回访总次数×5min | — |\n`;
      body += `| 专项业务 | 申请解绑华为云数量 | ${fmt(metrics.huaweiCloudUnbind)} | ${calcHoursStr(metrics.huaweiCloudUnbind, 1)} | ${metrics.huaweiCloudUnbind !== null ? '✅已完成' : '⏳待接入'} | 工单数据 | 解绑申请总数×1min | 需接入工单系统 |\n`;
      body += `| 问题转化 | 新增需求数/个 | ${fmt(metrics.newDemands)} | ${calcHoursStr(metrics.newDemands, 30)} | ✅已录入 | 需求列表 | 新增需求总数×30min | — |\n`;
      body += `| 问题转化 | 新增BUG数/个 | ${fmt(metrics.newBugs)} | ${calcHoursStr(metrics.newBugs, 30)} | ✅已录入 | BUG列表 | 新增BUG总数×30min | — |\n`;
      body += `| 问题闭环 | 已闭环需求数/个 | ${fmt(metrics.closedDemands)} | ${calcHoursStr(metrics.closedDemands, 15)} | ✅已闭环 | ${fmt(metrics.newDemands - metrics.closedDemands)}个待跟进 | 已关单需求数×15min | — |\n`;
      body += `| 问题闭环 | 已闭环BUG数/个 | ${fmt(metrics.closedBugs)} | ${calcHoursStr(metrics.closedBugs, 15)} | ✅已闭环 | ${fmt(metrics.newBugs - metrics.closedBugs)}个待跟进 | 已关单BUG数×15min | — |\n`;
      body += `| 商务转化 | 商机转换/个 | ${fmt(metrics.opportunityWon)} | ${calcHoursStr(metrics.opportunityWon, 30)} | ✅已完成 | ${fmt(metrics.opportunityCount)}个商机 | 已转换商机数×30min | — |\n`;
      body += `| 人效 | 人效评估 | — | — | — | ${metrics.agentCount > 0 ? fmt(metrics.totalSessions)+'次/'+metrics.agentCount+'人' : '—'} | 总会话量/客服人数 | — |\n\n`;

      body += `---\n\n`;

      // 四、其他工作事项
      body += `## 四、其他工作事项\n\n`;
      body += `${sections.otherWork || '（暂无内容）'}\n\n`;
      body += `---\n\n`;

      // 五、下周工作计划
      body += `## 五、下周工作计划\n\n`;
      body += `${sections.nextPlan || '（暂无内容）'}\n\n`;

      const subject = encodeURIComponent(
        `GitCode 客服${tabLabel}（${formatDate(dateRange[0])} ~ ${formatDate(dateRange[1])}）${agentName ? ' - ' + agentName : ''}`,
      );
      const encodedBody = encodeURIComponent(body);
      window.open(
        `https://mail.weixin.qq.com/cgi-bin/readtemplate?t=send&subject=${subject}&body=${encodedBody}`,
        '_blank',
      );
      message.success('已打开企微邮箱，请确认后手动发送');
    },
    [dateRange, teamMetrics, personalMetrics, teamSections, personalSections, selectedAgentId, agents],
  );

  // === UI 渲染函数 ===

  const renderMetricsSection = (metrics: WeeklyMetrics, isPersonal: boolean) => (
    <>
      {/* 一、闭环质量 */}
      <Card
        size="small"
        title={<Text strong>📊 一、闭环质量</Text>}
        style={{ marginBottom: 12 }}
        extra={
          <Text type="secondary" style={{ fontSize: 12 }}>
            月度累计趋势 ｜ 目标: ≥95% ｜ 数据源: 需求关单率模块
          </Text>
        }
      >
        <div style={{ padding: '4px 0', borderBottom: '2px solid #e8e8e8', fontWeight: 'bold', fontSize: 12 }}>
          <Row gutter={8}>
            <Col span={2}>维度</Col>
            <Col span={4}>核心指标</Col>
            <Col span={3}>目标值</Col>
            <Col span={5}>月度累计趋势</Col>
            <Col span={3}>本周完成值</Col>
            <Col span={3}>状态/进展</Col>
            <Col span={4}>指标说明</Col>
          </Row>
        </div>
        <MetricRow
          dimension="闭环质量"
          label="总关单率"
          value={pct(metrics.totalCloseRate)}
          target="≥95%"
          status={statusTag(metrics.totalCloseRate, 0.95)}
          indicatorDesc="(已闭环+已拒绝)/(总-长期演进)"
          monthlyHistory={metrics.totalCloseMonthly}
        />
        <MetricRow
          dimension="闭环质量"
          label="需求关单率"
          value={pct(metrics.demandCloseRate)}
          target="≥95%"
          status={statusTag(metrics.demandCloseRate, 0.95)}
          indicatorDesc="(已闭环需求+已拒绝需求)/(总需求-长期演进需求)"
          monthlyHistory={metrics.demandCloseMonthly}
        />
        <MetricRow
          dimension="闭环质量"
          label="BUG关单率"
          value={pct(metrics.bugCloseRate)}
          target="≥95%"
          status={statusTag(metrics.bugCloseRate, 0.95)}
          indicatorDesc="(已闭环BUG+已拒绝BUG)/(总BUG-长期演进BUG)"
          monthlyHistory={metrics.bugCloseMonthly}
        />
      </Card>

      {/* 二、体验与响应效率指标 */}
      <Card
        size="small"
        title={<Text strong>💡 二、体验与响应效率指标</Text>}
        style={{ marginBottom: 12 }}
      >
        {/* 2.1 体验指标 */}
        <div style={{ marginBottom: 16 }}>
          <Text type="secondary" style={{ fontSize: 12, fontWeight: 'bold', display: 'block', marginBottom: 4 }}>
            2.1 体验指标（月度累计趋势）
          </Text>
          <div style={{ padding: '4px 0', borderBottom: '2px solid #e8e8e8', fontWeight: 'bold', fontSize: 12 }}>
            <Row gutter={8}>
              <Col span={2}>维度</Col>
              <Col span={4}>核心指标</Col>
              <Col span={3}>目标值</Col>
            <Col span={5}>月度累计趋势</Col>
            <Col span={3}>本周完成值</Col>
            <Col span={3}>状态/进展</Col>
            <Col span={4}>指标说明</Col>
          </Row>
        </div>
        <MetricRow
          dimension="体验指标"
          label="满意度"
            value={pct(metrics.satisfactionRate)}
            target="≥95%"
            status={statusTag(metrics.satisfactionRate, 0.95)}
            indicatorDesc="满意评价数/总评价数"
            monthlyHistory={metrics.satMonthly}
          />
          <MetricRow
            dimension="体验指标"
            label="问题解决率"
            value={pct(metrics.problemResolutionRate)}
            target="≥90%"
            status={statusTag(metrics.problemResolutionRate, 0.90)}
            indicatorDesc="已解决问题数/有效参评总数"
            monthlyHistory={metrics.resMonthly}
          />
        </div>

        {/* 2.2 响应效率 */}
        <div>
          <Text type="secondary" style={{ fontSize: 12, fontWeight: 'bold', display: 'block', marginBottom: 4 }}>
            2.2 响应效率（数据源: udesk会话指标）
          </Text>
          <div style={{ padding: '4px 0', borderBottom: '2px solid #e8e8e8', fontWeight: 'bold', fontSize: 12 }}>
            <Row gutter={8}>
              <Col span={2}>维度</Col>
              <Col span={4}>核心指标</Col>
              <Col span={3}>目标值</Col>
            <Col span={5}>月度累计趋势</Col>
            <Col span={3}>本周完成值</Col>
            <Col span={3}>状态/进展</Col>
            <Col span={4}>指标说明</Col>
          </Row>
        </div>
        <MetricRow
          dimension="响应效率"
          label="平均首次响应时长"
            value={fmtMinutes(metrics.avgFirstResponseTime)}
            target="≤60秒"
            status={
              metrics.avgFirstResponseTime !== null
                ? (metrics.avgFirstResponseTime <= 60 ? <Tag color="success">✅ 达标</Tag> : <Tag color="error">❌ 未达标</Tag>)
                : <Tag>{isPersonal && selectedAgentId ? '暂无数据' : '已接入'}</Tag>
            }
            indicatorDesc="首次响应时间之和/会话数"
            monthlyHistory={undefined}
          />
          <MetricRow
            dimension="响应效率"
            label="平均响应时长"
            value={fmtMinutes(metrics.avgResponseTime)}
            target="≤120秒"
            status={
              metrics.avgResponseTime !== null
                ? (metrics.avgResponseTime <= 120 ? <Tag color="success">✅ 达标</Tag> : <Tag color="error">❌ 未达标</Tag>)
                : <Tag>{isPersonal && selectedAgentId ? '暂无数据' : '已接入'}</Tag>
            }
            indicatorDesc="总响应时长/总消息数"
          />
        </div>
      </Card>
    </>
  );

  // 工时计算工具函数
  const calcConsultHours = (count: number, avgSessionSec: number | null): string => {
    if (!count || !avgSessionSec || avgSessionSec <= 600) return '—';
    const hours = count * (avgSessionSec - 600) / 3600;
    return hours.toFixed(1);
  };
  const calcHours = (count: number | null, minutesPerUnit: number): string => {
    if (!count || count === 0) return '—';
    return ((count * minutesPerUnit) / 60).toFixed(1);
  };

  const renderWorkloadSection = (metrics: WeeklyMetrics, isPersonal: boolean) => (
    <Card
      size="small"
      title={<Text strong>📋 三、业务承接（基础工作量）</Text>}
      style={{ marginBottom: 12 }}
      extra={
        <Text type="secondary" style={{ fontSize: 12 }}>
          周期: {formatDate(dateRange[0])} ~ {formatDate(dateRange[1])}
        </Text>
      }
    >
      <div style={{ padding: '4px 0', borderBottom: '2px solid #e8e8e8', fontWeight: 'bold', fontSize: 12 }}>
        <Row gutter={8}>
          <Col span={2}>分类</Col>
          <Col span={3}>事项</Col>
          <Col span={2}>本周完成值</Col>
          <Col span={2}>工时统计(h)</Col>
          <Col span={2}>完成状态</Col>
          <Col span={2}>核心关联数据</Col>
          <Col span={3}>工时计算方式</Col>
          <Col span={2}>备注</Col>
        </Row>
      </div>
      <WorkloadRow
        category="咨询承接"
        item="用户主动咨询量/次"
        value={fmt(metrics.consultationCount)}
        hours={calcConsultHours(metrics.consultationCount, metrics.avgSessionDuration)}
        status="已完成"
        relatedData={metrics.consultationCount > 0 ? `会话数` : '—'}
        calcMethod="咨询量×(平均对话时长−10min)"
        remark={isPersonal ? '个人会话数' : '团队汇总'}
      />
      <WorkloadRow
        category="咨询承接"
        item="回访次数/次"
        value={fmt(metrics.returnVisitCount)}
        hours={calcHours(metrics.returnVisitCount, 5)}
        status="已完成"
        relatedData="会话数"
        calcMethod="回访总次数×5min"
        remark="—"
      />
      <WorkloadRow
        category="专项业务"
        item="申请解绑华为云数量"
        value={fmt(metrics.huaweiCloudUnbind)}
        hours={calcHours(metrics.huaweiCloudUnbind, 1)}
        status={metrics.huaweiCloudUnbind !== null ? '已完成' : '待接入'}
        relatedData="工单数据"
        calcMethod="解绑申请总数×1min"
        remark="需接入工单系统"
      />
      <WorkloadRow
        category="问题转化"
        item="新增需求数/个"
        value={fmt(metrics.newDemands)}
        hours={calcHours(metrics.newDemands, 30)}
        status="已录入"
        relatedData="需求列表"
        calcMethod="新增需求总数×30min"
        remark="—"
      />
      <WorkloadRow
        category="问题转化"
        item="新增BUG数/个"
        value={fmt(metrics.newBugs)}
        hours={calcHours(metrics.newBugs, 30)}
        status="已录入"
        relatedData="BUG列表"
        calcMethod="新增BUG总数×30min"
        remark="—"
      />
      <WorkloadRow
        category="问题闭环"
        item="已闭环需求数/个"
        value={fmt(metrics.closedDemands)}
        hours={calcHours(metrics.closedDemands, 15)}
        status="已闭环"
        relatedData={`${fmt(metrics.newDemands - metrics.closedDemands)}个待跟进`}
        calcMethod="已关单需求数×15min"
        remark="—"
      />
      <WorkloadRow
        category="问题闭环"
        item="已闭环BUG数/个"
        value={fmt(metrics.closedBugs)}
        hours={calcHours(metrics.closedBugs, 15)}
        status="已闭环"
        relatedData={`${fmt(metrics.newBugs - metrics.closedBugs)}个待跟进`}
        calcMethod="已关单BUG数×15min"
        remark="—"
      />
      <WorkloadRow
        category="商务转化"
        item="商机转换/个"
        value={fmt(metrics.opportunityWon)}
        hours={calcHours(metrics.opportunityWon, 30)}
        status="已完成"
        relatedData={`${fmt(metrics.opportunityCount)}个商机`}
        calcMethod="已转换商机数×30min"
        remark="—"
      />
      <WorkloadRow
        category="人效"
        item="人效评估"
        value="—"
        hours="—"
        status="—"
        relatedData={metrics.agentCount > 0 ? `${fmt(metrics.totalSessions)}次/${metrics.agentCount}人` : '—'}
        calcMethod="总会话量/客服人数"
        remark="—"
      />
    </Card>
  );

  // 当前指标和编辑状态
  const isPersonal = reportTab === 'personal';
  const currentMetrics = isPersonal ? personalMetrics : teamMetrics;
  const currentSections = isPersonal ? personalSections : teamSections;
  const currentEditing = isPersonal ? personalEditing : teamEditing;
  const setCurrentSections = isPersonal ? setPersonalSections : setTeamSections;
  const setCurrentEditing = isPersonal ? setPersonalEditing : setTeamEditing;

  return (
    <div style={{ padding: 24 }}>
      {/* 页面标题与操作栏 */}
      <Card style={{ marginBottom: 16 }}>
        <Row justify="space-between" align="middle">
          <Col>
            <Space size="middle">
              <FileTextOutlined style={{ fontSize: 22, color: '#1677ff' }} />
              <Title level={4} style={{ margin: 0 }}>周报中心</Title>
              <Tabs
                activeKey={reportTab}
                onChange={setReportTab}
                items={[
                  { key: 'team', label: <span><TeamOutlined /> 团队周报</span> },
                  { key: 'personal', label: <span><UserOutlined /> 个人周报</span> },
                ]}
                style={{ marginBottom: 0 }}
              />
            </Space>
          </Col>
          <Col>
            <Space>
              <RangePicker
                value={dateRange}
                onChange={(dates) => {
                  if (dates && dates[0] && dates[1]) {
                    setDateRange([dates[0], dates[1]]);
                  }
                }}
                allowClear={false}
                size="small"
              />
              <Button icon={<ReloadOutlined />} onClick={handleRefresh} loading={loading} size="small">
                刷新数据
              </Button>
              <Button
                type="primary"
                icon={<SendOutlined />}
                onClick={() => handleSendEmail(reportTab as 'personal' | 'team')}
                size="small"
              >
                一键发送到企微邮箱
              </Button>
            </Space>
          </Col>
        </Row>
      </Card>

      {loading ? (
        <div style={{ textAlign: 'center', padding: 80 }}>
          <Spin size="large" />
          <div style={{ marginTop: 16, color: '#999' }}>正在拉取周报数据...</div>
        </div>
      ) : (
        <>
          {/* 信息栏 */}
          <Alert
            type="info"
            showIcon
            icon={<InfoCircleOutlined />}
            message={
              <Space wrap>
                <span>报告周期：<Text strong>{formatDate(dateRange[0])} ~ {formatDate(dateRange[1])}</Text>（默认上周五→本周四）</span>
                {isPersonal && selectedAgentId && (
                  <span>| 当前客服：{agents.find((a) => a.agentId === selectedAgentId)?.displayName ?? selectedAgentId}</span>
                )}
                {!isPersonal && teamMetrics.agentCount > 0 && (
                  <span>| 团队人数：{teamMetrics.agentCount} 人</span>
                )}
                <span>| 闭环质量数据源：需求关单率模块</span>
              </Space>
            }
            style={{ marginBottom: 16 }}
          />

          {/* 个人周报额外：客服选择器 */}
          {isPersonal && (
            <Card size="small" style={{ marginBottom: 16 }}>
              <Row align="middle" gutter={16}>
                <Col>
                  <Text strong>选择客服：</Text>
                </Col>
                <Col>
                  <Select
                    value={selectedAgentId}
                    onChange={(val) => setSelectedAgentId(val)}
                    style={{ width: 240 }}
                    options={agents.map((a) => ({
                      value: a.agentId,
                      label: `${a.displayName} (${a.agentId})`,
                    }))}
                    placeholder="请选择客服"
                  />
                </Col>
                <Col>
                  {agentPerformance ? (
                    <Space size="middle">
                      <Text type="secondary">会话数: {agentPerformance.totalSessions}</Text>
                      <Text type="secondary">满意度: {agentPerformance.avgRating !== null ? (agentPerformance.avgRating * 100).toFixed(1) + '%' : '—'}</Text>
                    </Space>
                  ) : (
                    <Text type="secondary">暂无个人数据</Text>
                  )}
                </Col>
              </Row>
            </Card>
          )}

          {/* 一、闭环质量 + 二、体验与响应效率指标 */}
          {renderMetricsSection(currentMetrics, isPersonal)}

          {/* 三、业务承接 */}
          {renderWorkloadSection(currentMetrics, isPersonal)}

          {/* 四、其他工作事项 */}
          <Title level={5} style={{ marginTop: 16, marginBottom: 8 }}>
            <EditOutlined style={{ color: '#faad14', marginRight: 8 }} />
            四、其他工作事项
          </Title>
          <EditableSection
            title="其他工作事项（支持自定义输入，每条事项可标注工时，自动换行排版）"
            content={currentSections.otherWork}
            onChange={(val) => setCurrentSections((prev) => ({ ...prev, otherWork: val }))}
            isEditing={currentEditing.otherWork ?? false}
            onToggleEdit={() => setCurrentEditing((prev) => ({ ...prev, otherWork: !prev.otherWork }))}
            height={8}
          />

          {/* 五、下周工作计划 */}
          <Title level={5} style={{ marginTop: 16, marginBottom: 8 }}>
            <CheckCircleOutlined style={{ color: '#722ed1', marginRight: 8 }} />
            五、下周工作计划
          </Title>
          <EditableSection
            title="下周工作计划（采用纯文本序号列表格式，支持增删修改，自动排版）"
            content={currentSections.nextPlan}
            onChange={(val) => setCurrentSections((prev) => ({ ...prev, nextPlan: val }))}
            isEditing={currentEditing.nextPlan ?? false}
            onToggleEdit={() => setCurrentEditing((prev) => ({ ...prev, nextPlan: !prev.nextPlan }))}
            height={10}
          />

          <Divider />

          {/* 底部操作 */}
          <div style={{ textAlign: 'center', padding: '16px 0' }}>
            <Space size="large">
              <Button icon={<ReloadOutlined />} onClick={handleRefresh} loading={loading}>
                刷新数据
              </Button>
              <Button
                type="primary"
                size="large"
                icon={<SendOutlined />}
                onClick={() => handleSendEmail(reportTab as 'personal' | 'team')}
              >
                一键发送到企微邮箱
              </Button>
            </Space>
            <div style={{ marginTop: 8, color: '#999', fontSize: 12 }}>
              点击「一键发送」将打开企微邮箱页面，周报内容已自动填充为邮件正文，请确认后手动发送
            </div>
          </div>
        </>
      )}
    </div>
  );
}
