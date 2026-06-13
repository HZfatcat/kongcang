import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
  Button,
  Card,
  DatePicker,
  Tabs,
  Spin,
  Skeleton,
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
  Modal,
  Radio,
  InputNumber,
  Statistic,
} from 'antd';
import {
  EditOutlined,
  SaveOutlined,
  SendOutlined,
  SyncOutlined,
  FileTextOutlined,
  UserOutlined,
  TeamOutlined,
  CopyOutlined,
  CodeOutlined,
  EyeOutlined,
  MailOutlined,
  InfoCircleOutlined,
  LeftOutlined,
  RightOutlined,
  SettingOutlined,
  DownloadOutlined,
} from '@ant-design/icons';
import dayjs from 'dayjs';
import { fetchReportData } from '../../api/report';
import { fetchDemandOverview, fetchMonthlySatisfaction, fetchAgentOverview, fetchOverview, clearKpiCache } from '../../api/kpi';
import {
  fetchUdescOverview as fetchUdeskOverview,
  fetchUdescDailyRatingStats as fetchUdeskDailyRatingStats,
  fetchUdescAgentPerformance as fetchUdeskAgentPerformance,
  fetchUdescMetricsSummary as fetchUdeskMetricsSummary,
  fetchUdescMonthlyVoteStats as fetchUdeskMonthlyVoteStats,
  fetchUdescMonthlyMetrics as fetchUdeskMonthlyMetrics,
  fetchUdescVotes as fetchUdeskVotes,
  fetchUdescTicketSummary as fetchUdeskTicketSummary,
  fetchAgents,
  runSync,
  runZouwuSync,
  fetchSyncProgress,
} from '../../api/udesc';
import { fetchOpportunitySummary } from '../../api/opportunity';
import { sendReport } from '../../api/weekly-report';
import type { KpiOverview, DemandOverview, ConsultationFunnelOverview, AgentOverview } from '../../types/kpi';
import type { AgentProfile, UdescMetricsSummary } from '../../types/udesc';
import { fetchTopProblems } from '../../api/udesc';
import { TeamReportView } from './TeamReportView';
import { PersonalReportView } from './PersonalReportView';
import { fetchSmtpConfig, saveSmtpConfig, testSmtpConfig } from '../../api/settings';

const { RangePicker } = DatePicker;
const { Text, Title } = Typography;
const TextArea = Input.TextArea;

// ====== 工具函数 ======
/** 将 Dayjs 对象格式化为 YYYY-MM-DD 字符串，处理 null/undefined */
function formatDate(d: dayjs.Dayjs | null | undefined): string {
  return d ? d.format('YYYY-MM-DD') : '';
}

/**
 * 计算周报统计周期：上周五 ～ 本周四（固定 7 天窗口）
 * @param weekOffset 0=当前周, -1=上一周, 1=下一周, ...
 */
function getWeekRange(weekOffset: number = 0): [dayjs.Dayjs, dayjs.Dayjs] {
  const today = dayjs();
  // 上周五 = 今天往前推到最近一个周五（dayjs: 周日=0, 周五=5）
  const dayOfWeek = today.day();
  let daysSinceFriday = dayOfWeek - 5;
  if (daysSinceFriday < 0) daysSinceFriday += 7; // 周四(4)→6, 周三(3)→5, ...
  const lastFriday = today.subtract(daysSinceFriday, 'day').startOf('day');
  // 加上周偏移
  const startDay = lastFriday.add(weekOffset * 7, 'day');
  const endDay = startDay.add(6, 'day').endOf('day'); // 到下周四
  return [startDay, endDay];
}

/** 将比率 clamp 到 0~1 区间 */
function clampRate(v: number): number {
  return Math.max(0, Math.min(1, v));
}

/** 将小数比率格式化为百分比字符串，如 0.953 → '95.3%' */
function pct(v: number | null | undefined): string {
  if (v == null || isNaN(v as number)) return '—';
  return `${(v * 100).toFixed(1)}%`;
}

/** 将秒格式化为分:秒 或 x分x秒 */
function fmtMinutes(seconds: number | null | undefined): string {
  if (seconds == null || isNaN(seconds)) return '—';
  if (seconds < 60) return `${Math.round(seconds)}秒`;
  const m = Math.floor(seconds / 60);
  const s = Math.round(seconds % 60);
  return s > 0 ? `${m}分${s}秒` : `${m}分`;
}

/** 格式化数字为带千分位的字符串 */
function fmt(n: number | null | undefined): string {
  if (n == null || isNaN(n)) return '—';
  return n.toLocaleString('zh-CN');
}

/** 计算月度关单率（当月口径：每个月独立计算，非累计） */
function computeMonthlyCloseRate(data: Array<{ month: string; created: number; completed: number; rejectedCount?: number; longTermCount?: number }> | undefined): { month: string; value: number }[] {
  if (!data || data.length === 0) return [];
  // 当月口径：每月 = 该月完成数 / 该月(创建 - 长期演进)
  const result: { month: string; value: number }[] = [];
  for (const m of data.sort((a, b) => a.month.localeCompare(b.month))) {
    const numerator = (m.completed ?? 0) + (m.rejectedCount ?? 0);
    const denominator = m.created - (m.longTermCount ?? 0);
    result.push({
      month: m.month,
      value: denominator > 0 ? clampRate(numerator / denominator) : 0,
    });
  }
  return result;
}

/** 生成状态标签（达标/未达标） */
function statusTag(value: number, threshold: number): React.ReactNode {
  if (value == null || isNaN(value)) return <Tag>⏳ 待接入</Tag>;
  return value >= threshold
    ? <Tag color="success">✅ 达标</Tag>
    : <Tag color="error">❌ 未达标</Tag>;
}

interface WeeklyReport {
  id: string;
  weekStart: string;
  weekEnd: string;
  title: string;
  author: string;
  status: 'draft' | 'published';
  createdAt: string;
}

interface EditableSectionProps {
  title: React.ReactNode;
  content: string;
  onChange: (val: string) => void;
  isEditing: boolean;
  onToggleEdit: () => void;
  height?: number;
}

function EditableSection({ title, content, onChange, isEditing, onToggleEdit, height = 6 }: EditableSectionProps) {
  const charCount = content ? content.length : 0;
  return (
    <Card
      size="small"
      title={<Text strong>{title}</Text>}
      extra={
        <Space size="small">
          {isEditing && (
            <Text type="secondary" style={{ fontSize: 11 }}>
              {charCount} 字
            </Text>
          )}
          <Button type="text" icon={isEditing ? <SaveOutlined /> : <EditOutlined />} onClick={onToggleEdit}>
            {isEditing ? '保存' : '编辑'}
          </Button>
        </Space>
      }
      style={{ marginBottom: 12 }}
    >
      {isEditing ? (
        <TextArea
          value={content}
          onChange={(e) => onChange(e.target.value)}
          rows={height}
          style={{ fontFamily: 'inherit', fontSize: 13 }}
          showCount
        />
      ) : (
        <div style={{ whiteSpace: 'pre-wrap', fontSize: 13, lineHeight: 1.8 }}>{content || '（暂无内容）'}</div>
      )}
    </Card>
  );
}

// ====== 指标行组件（核心指标|目标值|本周完成值|状态/进展） ======
interface MetricRowProps {
  label: string;
  target: string;
  indicatorInfo?: string;
  monthlyHistory?: { month: string; value: number }[];
  value: string | number | React.ReactNode;
  status?: React.ReactNode;
  /** 自定义月度趋势弹窗中每行的值格式化，默认按百分比 */
  formatMonthlyValue?: (val: number) => string;
}

function MetricRow({ label, target, indicatorInfo, monthlyHistory, value, status, formatMonthlyValue }: MetricRowProps) {
  const [detailOpen, setDetailOpen] = useState(false);
  return (
    <>
      <div style={{ padding: '8px 0', borderBottom: '1px solid #f0f0f0' }}>
        <Row gutter={8} align="middle">
          <Col span={6}>
            <Text strong>{label}</Text>
            {indicatorInfo ? (
              <Tooltip title={indicatorInfo}>
                <InfoCircleOutlined
                  style={{ marginLeft: 6, color: '#1677ff', cursor: 'pointer', fontSize: 13 }}
                />
              </Tooltip>
            ) : null}
          </Col>
          <Col span={3}>
            <Text type="secondary">{target}</Text>
          </Col>
          <Col span={8}>
            <Space>
              <Text>{value}</Text>
              {monthlyHistory && monthlyHistory.length > 0 && (
                <Button type="link" size="small" onClick={() => setDetailOpen(true)}>
                  查看详情
                </Button>
              )}
            </Space>
          </Col>
          <Col span={7}>{status}</Col>
        </Row>
      </div>
      <Modal
        title={`${label} - 月度累计趋势`}
        open={detailOpen}
        onCancel={() => setDetailOpen(false)}
        footer={null}
        width={400}
      >
        {monthlyHistory && monthlyHistory.length > 0 ? (
          <div style={{ padding: '8px 0' }}>
            {monthlyHistory.map((m) => (
              <div
                key={m.month}
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  padding: '8px 12px',
                  borderBottom: '1px solid #f0f0f0',
                  fontSize: 14,
                }}
              >
                <span>{m.month}</span>
                <span style={{ fontWeight: 600 }}>{formatMonthlyValue ? formatMonthlyValue(m.value) : `${(m.value * 100).toFixed(1)}%`}</span>
              </div>
            ))}
          </div>
        ) : (
          <Text type="secondary">暂无月度数据</Text>
        )}
      </Modal>
    </>
  );
}

// ====== 精装指标行组件（含进度条 + 趋势弹窗 + 状态标签） ======
interface PolishedMetricRowProps {
  label: string;
  value: string | number | React.ReactNode;
  /** 目标阈值（可选），传递数字时自动生成进度条 */
  target?: number;
  indicatorInfo?: string;
  monthlyHistory?: { month: string; value: number }[];
  formatMonthlyValue?: (val: number) => string;
  /** 当前达成率 0~1，用于进度条 */
  rate?: number | null;
  /** 自定义状态区域，默认按 rate vs target 自动生成 */
  statusOverride?: React.ReactNode;
}

function PolishedMetricRow({
  label,
  value,
  target,
  indicatorInfo,
  monthlyHistory,
  formatMonthlyValue,
  rate,
  statusOverride,
}: PolishedMetricRowProps) {
  const [detailOpen, setDetailOpen] = useState(false);
  const passed = rate != null && target != null ? rate >= target : null;
  const pctValue = rate != null ? Math.min(rate * 100, 100) : 0;
  const barColor = passed === true ? '#22c55e' : passed === false ? '#ef4444' : '#94a3b8';

  return (
    <>
      <div style={{
        padding: '10px 12px',
        borderBottom: '1px solid #f0f0f0',
        transition: 'background 0.15s',
      }}
        onMouseEnter={(e) => (e.currentTarget.style.background = '#f8fafc')}
        onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
      >
        <Row gutter={8} align="middle">
          <Col span={5}>
            <Text strong style={{ fontSize: 13 }}>{label}</Text>
            {indicatorInfo ? (
              <Tooltip title={indicatorInfo}>
                <InfoCircleOutlined style={{ marginLeft: 4, color: '#94a3b8', cursor: 'pointer', fontSize: 12 }} />
              </Tooltip>
            ) : null}
          </Col>
          <Col span={3}>
            <Text type="secondary" style={{ fontSize: 12 }}>
              {target != null ? (target >= 0 && target <= 1 ? `≥${(target * 100).toFixed(0)}%` : target) : '—'}
            </Text>
          </Col>
          <Col span={5}>
            <Text strong style={{ fontSize: 14, color: '#0f172a' }}>{value}</Text>
            {monthlyHistory && monthlyHistory.length > 0 && (
              <Button type="link" size="small" style={{ fontSize: 11, padding: '0 4px' }} onClick={() => setDetailOpen(true)}>
                趋势
              </Button>
            )}
          </Col>
          <Col span={5}>
            {rate != null && (
              <Tooltip title={`${pctValue.toFixed(1)}%`}>
                <div style={{
                  width: '100%',
                  height: 6,
                  background: '#e2e8f0',
                  borderRadius: 3,
                  overflow: 'hidden',
                }}>
                  <div style={{
                    width: `${pctValue}%`,
                    height: '100%',
                    background: `linear-gradient(90deg, ${barColor}88, ${barColor})`,
                    borderRadius: 3,
                    transition: 'width 0.4s ease',
                  }} />
                </div>
              </Tooltip>
            )}
          </Col>
          <Col span={6}>
            {statusOverride ?? (
              passed === true ? (
                <Tag color="success" style={{ borderRadius: 12, border: 'none', margin: 0 }}>✅ 达标</Tag>
              ) : passed === false ? (
                <Tag color="error" style={{ borderRadius: 12, border: 'none', margin: 0 }}>❌ 未达标</Tag>
              ) : (
                <Tag style={{ borderRadius: 12, border: 'none', margin: 0 }}>⏳ 待接入</Tag>
              )
            )}
          </Col>
        </Row>
      </div>
      <Modal
        title={`${label} - 月度累计趋势`}
        open={detailOpen}
        onCancel={() => setDetailOpen(false)}
        footer={null}
        width={400}
      >
        {monthlyHistory && monthlyHistory.length > 0 ? (
          <div style={{ padding: '8px 0' }}>
            {monthlyHistory.map((m) => (
              <div
                key={m.month}
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  padding: '8px 12px',
                  borderBottom: '1px solid #f0f0f0',
                  fontSize: 14,
                }}
              >
                <span>{m.month}</span>
                <span style={{ fontWeight: 600 }}>{formatMonthlyValue ? formatMonthlyValue(m.value) : `${(m.value * 100).toFixed(1)}%`}</span>
              </div>
            ))}
          </div>
        ) : (
          <Text type="secondary">暂无月度数据</Text>
        )}
      </Modal>
    </>
  );
}

// ====== 工作量明细行组件 ======
interface WorkloadRowProps {
  category: string;
  item: string;
  value: string | number;
  hours: string | number;
  status: string;
  calcMethod?: string;
}

function WorkloadRow({ category, item, value, hours, status, calcMethod }: WorkloadRowProps) {
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
        <Col span={3}>
          <Text type="secondary">{hours}</Text>
        </Col>
        <Col span={2}>
          <Tag color={statusColor[status] || 'default'}>{status}</Tag>
        </Col>
        <Col span={5}>
          {calcMethod ? <Text type="secondary" style={{ fontSize: 11 }}>{calcMethod}</Text> : <Text type="secondary" style={{ fontSize: 11 }}>—</Text>}
        </Col>
      </Row>
    </div>
  );
}

// ====== 高频问题TOP5组件 ======
const rankColors = ['#f5222d', '#fa8c16', '#fadb14', '#52c41a', '#1677ff'];
function TopQuestionsSection({ questions }: { questions: { name: string; count: number; pct: number }[] }) {
  const top5 = questions.slice(0, 5);
  return (
    <Card
      size="small"
      title={<Text strong id="section-topquestions">🔥 四、高频问题 TOP5</Text>}
      style={{ marginBottom: 12 }}
    >
      {top5.length === 0 ? (
        <Text type="secondary">暂无数据</Text>
      ) : (
        <div>
          {top5.map((q, i) => (
            <div
              key={i}
              style={{
                display: 'flex',
                alignItems: 'center',
                padding: '8px 0',
                borderBottom: i < top5.length - 1 ? '1px solid #f0f0f0' : 'none',
              }}
            >
              <div
                style={{
                  width: 22,
                  height: 22,
                  borderRadius: '50%',
                  background: rankColors[i] || '#1677ff',
                  color: '#fff',
                  fontSize: 11,
                  fontWeight: 700,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  marginRight: 10,
                  flexShrink: 0,
                }}
              >
                {i + 1}
              </div>
              <div style={{ flex: 1, fontSize: 13, color: '#1e293b' }}>{q.name}</div>
              <div style={{ fontSize: 12, color: '#64748b', whiteSpace: 'nowrap', marginLeft: 8 }}>
                {q.count} 次
              </div>
              <Tag
                style={{ marginLeft: 6, fontSize: 11, lineHeight: '18px' }}
                color={q.pct >= 30 ? 'red' : q.pct >= 10 ? 'orange' : 'default'}
              >
                {q.pct}%
              </Tag>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}

// ====== 周报数据类型 ======
export interface WeeklyMetrics {
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
  avgFirstResponseTimeMonthly: { month: string; value: number }[];
  avgResponseTimeMonthly: { month: string; value: number }[];
  // 2. 业务承接
  consultationCount: number;
  returnVisitCount: number | null;
  huaweiCloudUnbind: number | null;
  newDemands: number;
  newBugs: number;
  closedDemands: number;
  closedBugs: number;
  agentCount: number;
  activeAgentCount: number;
  totalSessions: number;
  totalMessages: number;
  avgSessionDuration: number | null; // 平均对话时长(秒)，用于工时计算
  // 3. 商务转化
  opportunityCount: number;
  opportunityWon: number;
  // 4. 人效评估
  teamEfficiency: number; // 团队人效 = (咨询量 + 新增提单*2.5 + 回访*0.25) / (40*出勤人数)
}

// ====== 环比对比缓存 ======
const CACHE_KEY_PREFIX = 'weekly_report_cache_';
interface CachedMetrics {
  weekStart: string;
  weekEnd: string;
  totalCloseRate: number;
  satisfactionRate: number;
  problemResolutionRate: number;
  avgFirstResponseTime: number | null;
  avgResponseTime: number | null;
  consultationCount: number;
}

// ====== 主页面 ======
export function WeeklyReportPage() {
  const [reports, setReports] = useState<WeeklyReport[]>([]);
  const [loading, setLoading] = useState(false);
  const [syncLoading, setSyncLoading] = useState(false);

  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);
  // 组件卸载时清理轮询
  useEffect(() => {
    return () => {
      if (pollingRef.current) {
        clearInterval(pollingRef.current);
      }
    };
  }, []);
  // 固定周期：上周五 ～ 本周四
  const defaultWeek = useMemo(() => getWeekRange(0), []);
  const [dateRange, setDateRange] = useState<[dayjs.Dayjs, dayjs.Dayjs] | null>(defaultWeek);
  const [weekOffset, setWeekOffset] = useState(0); // 周次偏移：0=当前周, -1=上一周, ...
  const [reportTab, setReportTab] = useState<'team' | 'personal'>('team');

  // 团队数据
  const [kpiOverview, setKpiOverview] = useState<KpiOverview | null>(null);
  const [demandOverview, setDemandOverview] = useState<DemandOverview | null>(null);
  const [annualDemandOverview, setAnnualDemandOverview] = useState<DemandOverview | null>(null);
  const [annualKpiOverview, setAnnualKpiOverview] = useState<KpiOverview | null>(null);
  const [funnel, setFunnel] = useState<ConsultationFunnelOverview | null>(null);
  const [udescOverview, setUdeskOverview] = useState<Awaited<ReturnType<typeof fetchUdeskOverview>> | null>(null);
  const [dailyRatingStats, setDailyRatingStats] = useState<Awaited<ReturnType<typeof fetchUdeskDailyRatingStats>> | null>(null);
  const [teamMetricsSummary, setTeamMetricsSummary] = useState<UdescMetricsSummary | null>(null);
  const [weeklyVotes, setWeeklyVotes] = useState<Awaited<ReturnType<typeof fetchUdeskVotes>> | null>(null);
  const [teamTicketSummary, setTeamTicketSummary] = useState<Awaited<ReturnType<typeof fetchUdeskTicketSummary>> | null>(null);
  const [opportunitySummary, setOpportunitySummary] = useState<Awaited<ReturnType<typeof fetchOpportunitySummary>> | null>(null);
  const [monthlyVoteStats, setMonthlyVoteStats] = useState<Awaited<ReturnType<typeof fetchUdeskMonthlyVoteStats>> | null>(null);
  const [monthlyMetrics, setMonthlyMetrics] = useState<Awaited<ReturnType<typeof fetchUdeskMonthlyMetrics>> | null>(null);
  const [monthlySatisfaction, setMonthlySatisfaction] = useState<Awaited<ReturnType<typeof fetchMonthlySatisfaction>> | null>(null);
  const [agentOverview, setAgentOverview] = useState<AgentOverview | null>(null);
  // 手动录入：申请解绑华为云数量
  const [huaweiCloudUnbindInput, setHuaweiCloudUnbindInput] = useState<number | null>(null);
  // 手动录入：商机转化
  const [manualOpportunityInput, setManualOpportunityInput] = useState<number | null>(null);

  // 个人数据
  const [agents, setAgents] = useState<AgentProfile[]>([]);
  const [selectedAgentId, setSelectedAgentId] = useState<string | undefined>(undefined);
  const [agentPerformance, setAgentPerformance] = useState<Awaited<ReturnType<typeof fetchUdeskAgentPerformance>> | null>(null);
  const [agentMetricsSummary, setAgentMetricsSummary] = useState<UdescMetricsSummary | null>(null);
  // 个人年度累计需求统计（同团队关单率计算口径）
  const [personalDemandOverview, setPersonalDemandOverview] = useState<DemandOverview | null>(null);
  // 个人年度累计满意度 & 问题解决率（同团队口径）
  const [personalKpiOverview, setPersonalKpiOverview] = useState<KpiOverview | null>(null);

  // 可编辑模块内容
  const [teamSections, setTeamSections] = useState<Record<string, string>>({ otherWork: '', nextPlan: '' });
  const [teamEditing, setTeamEditing] = useState<Record<string, boolean>>({});
  const [personalSections, setPersonalSections] = useState<Record<string, string>>({ otherWork: '', nextPlan: '' });
  const [personalEditing, setPersonalEditing] = useState<Record<string, boolean>>({});

  // 新增编辑字段 — topQuestions 自动从数据源获取
  const [teamEditable, setTeamEditable] = useState({
    topQuestions: [] as { name: string; count: number; pct: number }[],
    risks: ['需求闭环滞后 — 当前部分需求因排期紧张未能及时关闭'],
    suggestions: ['优化平台自助帮助中心，引导用户自助解决常见问题'],
  });
  const [personalEditable, setPersonalEditable] = useState({
    topQuestions: [] as { name: string; count: number; pct: number }[],
    risks: [] as string[],
    suggestions: [] as string[],
  });
  const editableState = reportTab === 'personal' ? personalEditable : teamEditable;
  const setEditableState = reportTab === 'personal' ? setPersonalEditable : setTeamEditable;

  // 服务器端 SMTP 发送
  const [smtpSending, setSmtpSending] = useState(false);
  const [smtpEmail, setSmtpEmail] = useState('');
  
  // SMTP 配置弹窗
  const [smtpModalOpen, setSmtpModalOpen] = useState(false);
  const [smtpConfig, setSmtpConfig] = useState({ host: '', port: 465, user: '', pass: '', from: '' });
  const [smtpTestTo, setSmtpTestTo] = useState('');
  const [smtpTestLoading, setSmtpTestLoading] = useState(false);
  const [smtpSaveLoading, setSmtpSaveLoading] = useState(false);

  // 视图模式：数据视图 / 报告视图（邮件发送以此为准）
  const [beautifulView, setBeautifulView] = useState(false);

  // 环比对比（与上周对比）
  const [prevMetrics, setPrevMetrics] = useState<CachedMetrics | null>(null);
  const [comparison, setComparison] = useState<{
    totalCloseRate: number | null;
    satisfactionRate: number | null;
    avgFirstResponseTime: number | null;
    consultationCount: number | null;
  }>({ totalCloseRate: null, satisfactionRate: null, avgFirstResponseTime: null, consultationCount: null });

  // 保存当前周数据到 localStorage 用于下周环比
  const saveMetricsToCache = useCallback((metrics: WeeklyMetrics, start: string, end: string) => {
    try {
      const cache: CachedMetrics = {
        weekStart: start,
        weekEnd: end,
        totalCloseRate: metrics.totalCloseRate,
        satisfactionRate: metrics.satisfactionRate,
        problemResolutionRate: metrics.problemResolutionRate,
        avgFirstResponseTime: metrics.avgFirstResponseTime,
        avgResponseTime: metrics.avgResponseTime,
        consultationCount: metrics.consultationCount,
      };
      localStorage.setItem(`${CACHE_KEY_PREFIX}${start}`, JSON.stringify(cache));
    } catch { /* ignore */ }
  }, []);

  // 从 localStorage 读取上周缓存
  const loadPrevCache = useCallback((start: string) => {
    try {
      const prevWeekStart = dayjs(start).subtract(7, 'day').format('YYYY-MM-DD');
      const raw = localStorage.getItem(`${CACHE_KEY_PREFIX}${prevWeekStart}`);
      if (raw) {
        const parsed = JSON.parse(raw) as CachedMetrics;
        setPrevMetrics(parsed);
      }
    } catch { /* ignore */ }
  }, []);

  // 计算环比
  const calcComparison = useCallback((current: WeeklyMetrics) => {
    if (!prevMetrics) return;
    const diff = <T extends number | null>(cur: T, prev: T): number | null => {
      if (cur == null || prev == null || prev === 0) return null;
      return ((cur as number) - (prev as number)) / (prev as number);
    };
    setComparison({
      totalCloseRate: diff(current.totalCloseRate, prevMetrics.totalCloseRate),
      satisfactionRate: diff(current.satisfactionRate, prevMetrics.satisfactionRate),
      avgFirstResponseTime: diff(current.avgFirstResponseTime, prevMetrics.avgFirstResponseTime),
      consultationCount: diff(current.consultationCount, prevMetrics.consultationCount),
    });
  }, [prevMetrics]);

  // 当前登录用户

  // 当前登录用户
  const loginUserStr = useMemo(() => {
    try {
      const raw = localStorage.getItem('loginUser');
      if (raw) return JSON.parse(raw);
    } catch { /* ignore */ }
    return null;
  }, []);

  // localStorage 草稿键名
  const draftKey = useMemo(() => {
    const tab = reportTab;
    const agent = reportTab === 'personal' ? selectedAgentId : 'team';
    return `weekly_report_draft_${tab}_${agent}`;
  }, [reportTab, selectedAgentId]);

  // 加载草稿
  useEffect(() => {
    try {
      const raw = localStorage.getItem(draftKey);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed.otherWork !== undefined || parsed.nextPlan !== undefined) {
          if (reportTab === 'team') {
            setTeamSections((prev) => ({ ...prev, ...parsed }));
          } else {
            setPersonalSections((prev) => ({ ...prev, ...parsed }));
          }
        }
      }
    } catch { /* ignore */ }
  }, [draftKey]);

  // 自动保存草稿（防抖 1s）
  useEffect(() => {
    if (!teamSections.otherWork && !teamSections.nextPlan && !personalSections.otherWork && !personalSections.nextPlan) return;
    const timer = setTimeout(() => {
      try {
        const sections = reportTab === 'team' ? teamSections : personalSections;
        localStorage.setItem(draftKey, JSON.stringify(sections));
      } catch { /* ignore */ }
    }, 1000);
    return () => clearTimeout(timer);
  }, [teamSections, personalSections, draftKey, reportTab]);

  // 加载客服列表
  useEffect(() => {
    fetchAgents().then((list) => {
      if (list && list.length > 0) {
        // 检查是否有真实的人名（vs 纯数字 ID）
        const hasRealNames = list.some(a => isNaN(Number(a.displayName)));
        if (hasRealNames) {
          const targetList = list.filter(a => ['段嘉雯', '覃晓阳', '潘芳'].includes(a.displayName));
          if (targetList.length > 0) {
            setAgents(targetList);
            if (!selectedAgentId) setSelectedAgentId(targetList[0].agentId);
            return;
          }
        }
        // 数值 ID 模式或不在已知名字列表：取前 3 个活跃客服映射到已知名字
        const KNOWN_NAMES = ['段嘉雯', '覃晓阳', '潘芳'];
        const mappedAgents: AgentProfile[] = list
          .filter((_, i) => i < KNOWN_NAMES.length) // 只取前 3 个
          .map((a, i) => ({
            ...a,
            displayName: KNOWN_NAMES[i], // 覆盖为已知中文名
          }));
        setAgents(mappedAgents);
        if (!selectedAgentId && mappedAgents.length > 0) {
          setSelectedAgentId(mappedAgents[0].agentId);
        }
      } else {
        useFallbackAgents();
      }
    }).catch(() => {
      useFallbackAgents();
    });
    function useFallbackAgents() {
      const fallbackAgents: AgentProfile[] = [
        { agentId: '71186', displayName: '段嘉雯', enabled: true, createdAt: '', updatedAt: '' },
        { agentId: '71192', displayName: '覃晓阳', enabled: true, createdAt: '', updatedAt: '' },
        { agentId: '71196', displayName: '潘芳', enabled: true, createdAt: '', updatedAt: '' },
      ];
      setAgents(fallbackAgents);
      if (!selectedAgentId) {
        setSelectedAgentId(fallbackAgents[0].agentId);
      }
    }
  }, []);

  // === 加载团队数据 ===
  const loadTeamData = useCallback(async () => {
    if (!dateRange || !dateRange[0] || !dateRange[1]) return;
    const start = formatDate(dateRange[0]);
    const end = formatDate(dateRange[1]);
    const annualStart = `${new Date().getFullYear()}-01-01`;
    try {
      const [report, udeskOv, ratingStats, annualDemand, annualKpi, metricsSum, votes, ticketSummary, oppSummary, monthlyVotes, monthlyMets, monthlySat, agentCompletion] = await Promise.all([
        fetchReportData(start, end).catch(() => null),
        fetchUdeskOverview({ startDate: start, endDate: end }).catch(() => null),
        fetchUdeskDailyRatingStats({ startDate: start, endDate: end }).catch(() => null),
        fetchDemandOverview({ startDate: annualStart, endDate: end }).catch(() => null),
        fetchOverview({ startDate: annualStart, endDate: end }).catch(() => null),
        fetchUdeskMetricsSummary({ startDate: start, endDate: end }).catch(() => null),
        fetchUdeskVotes({ startDate: start, endDate: end, pageSize: 1 }).catch(() => null),
        fetchUdeskTicketSummary({ startDate: start, endDate: end }).catch(() => null),
        fetchOpportunitySummary({ startDate: start, endDate: end }).catch(() => null),
        fetchUdeskMonthlyVoteStats({ startDate: annualStart, endDate: end }).catch(() => null),
        fetchUdeskMonthlyMetrics({ startDate: annualStart, endDate: end }).catch(() => null),
        fetchMonthlySatisfaction({ startDate: annualStart, endDate: end }).catch(() => null),
        fetchAgentOverview({ startDate: start, endDate: end }).catch(() => null),
      ]);
      setKpiOverview(report?.kpiOverview ?? null);
      setDemandOverview(report?.demandOverview ?? null);
      setAnnualDemandOverview(annualDemand);
      setAnnualKpiOverview(annualKpi);
      setFunnel(report?.funnel ?? null);
      setUdeskOverview(udeskOv);
      setDailyRatingStats(ratingStats);
      setTeamMetricsSummary(metricsSum);
      setWeeklyVotes(votes);
      setTeamTicketSummary(ticketSummary);
      setOpportunitySummary(oppSummary);
      setMonthlyVoteStats(monthlyVotes);
      setMonthlyMetrics(monthlyMets);
      setMonthlySatisfaction(monthlySat);
      setAgentOverview(agentCompletion);
    } catch (err) {
      console.error('获取周报失败:', err);
    } finally {
      setLoading(false);
    }
  }, [dateRange, formatDate]);

  // === 加载个人数据 ===
  const loadPersonalData = useCallback(async () => {
    if (!selectedAgentId || !dateRange || !dateRange[0] || !dateRange[1]) return;
    const start = formatDate(dateRange[0]);
    const end = formatDate(dateRange[1]);
    const annualStart = `${new Date().getFullYear()}-01-01`;
    const agentName = agents.find(a => a.agentId === selectedAgentId)?.displayName;
    try {
      const [perf, metricsSum, personalDemand, personalKpi] = await Promise.all([
        fetchUdeskAgentPerformance(selectedAgentId, { startDate: start, endDate: end, agentName }).catch(() => null),
        fetchUdeskMetricsSummary({ startDate: start, endDate: end, agentId: selectedAgentId }).catch(() => null),
        // 个人年度累计需求统计（同团队关单率计算口径）
        agentName
          ? fetchDemandOverview({ startDate: annualStart, endDate: end, agentName }).catch(() => null)
          : Promise.resolve(null),
        // 个人年度累计满意度 & 问题解决率（同团队口径）
        fetchOverview({ startDate: annualStart, endDate: end, agentId: selectedAgentId }).catch(() => null),
      ]);
      setAgentPerformance(perf);
      setAgentMetricsSummary(metricsSum);
      setPersonalDemandOverview(personalDemand);
      setPersonalKpiOverview(personalKpi);
    } catch (err) {
      console.error('拉取个人数据失败:', err);
    }
  }, [selectedAgentId, dateRange, agents]);

  // 全量刷新
  const handleRefresh = useCallback(async () => {
    setLoading(true);
    await Promise.all([loadTeamData(), loadPersonalData()]);
    setLoading(false);
  }, [loadTeamData, loadPersonalData]);

  // 加载团队数据（日期或Tab变更时触发）
  useEffect(() => {
    setLoading(true);
    loadTeamData().finally(() => setLoading(false));
  }, [dateRange, reportTab]);

  // 切换人员时只重新拉取个人数据，不重刷团队数据
  useEffect(() => {
    if (!selectedAgentId || !dateRange || agents.length === 0) return;
    loadPersonalData();
  }, [selectedAgentId, agents]);

  // 自动加载高频问题TOP5
  useEffect(() => {
    if (!dateRange || !dateRange[0] || !dateRange[1]) return;
    const start = formatDate(dateRange[0]);
    const end = formatDate(dateRange[1]);
    fetchTopProblems({ startDate: start, endDate: end })
      .then((data) => {
        setTeamEditable((prev) => ({ ...prev, topQuestions: data.topQuestions }));
      })
      .catch((err) => {
        console.warn('获取高频问题TOP5失败:', err);
      });
  }, [dateRange]);

  // 同步 + 刷新（合并为一个按钮）
  const handleSync = useCallback(async () => {
    // 清理旧轮询
    if (pollingRef.current) {
      clearInterval(pollingRef.current);
      pollingRef.current = null;
    }
    setSyncLoading(true);
    try {
      // 清除缓存确保下次加载最新数据
      clearKpiCache().catch(() => {});
      // 1. 触发同步（后台运行）
      const udescResp = await runSync();
      if (udescResp.accepted) {
        message.success('Udesk 同步任务已触发（后台运行）');
      } else {
        message.info('Udesk 同步被跳过（可能正在运行中）');
      }
      const zouwuResp = await runZouwuSync();
      if (zouwuResp.accepted) {
        message.success('驺吾同步任务已触发（后台运行）');
      } else {
        message.info(`驺吾同步: ${zouwuResp.reason || '跳过'}`);
      }

      // 2. 立即刷新一次页面数据
      await handleRefresh();

      // 3. 轮询等待同步完成，完成后自动再刷新一次
      const startTime = Date.now();
      const MAX_POLL_MS = 120_000; // 最多等 2 分钟
      pollingRef.current = setInterval(async () => {
        try {
          const progress = await fetchSyncProgress();
          const isRunning = progress?.isRunning ?? false;
          const timedOut = Date.now() - startTime > MAX_POLL_MS;

          if (!isRunning || timedOut) {
            if (pollingRef.current) {
              clearInterval(pollingRef.current);
              pollingRef.current = null;
            }
            if (timedOut) {
              message.info('同步仍在运行，数据可能未完全更新，可稍后手动刷新');
            }
            // 最终刷新一次
            await handleRefresh();
            setSyncLoading(false);
          }
        } catch {
          // 单次轮询失败不中断，继续等待
        }
      }, 5000); // 每 5 秒检查一次
    } catch (err) {
      message.error('同步失败，请稍后重试');
      console.error('同步异常:', err);
      setSyncLoading(false);
    }
  }, [handleRefresh]);
  useEffect(() => {
    if (!dateRange || !dateRange[0]) return;
    const start = formatDate(dateRange[0]);
    loadPrevCache(start);
  }, [dateRange]);

  // 周次偏移变化时更新 dateRange（历史周报导航）
  useEffect(() => {
    setDateRange(getWeekRange(weekOffset));
  }, [weekOffset]);

  // === 计算团队指标 ===
  const teamMetrics = useMemo((): WeeklyMetrics => {
    const s = kpiOverview;
    const w = demandOverview;
    // 年度累计数据（当年 1 月 1 日至周期结束，用于本周完成值 和 月度趋势）
    const ad = annualDemandOverview;
    const ak = annualKpiOverview; // 年度 KPI 概览（满意度等）
    const f = funnel;
    const u = udescOverview;
    const ms = teamMetricsSummary;
    const mvs = monthlyVoteStats; // 月度投票统计
    const mm = monthlyMetrics; // 月度响应指标

    // === 本周完成值 = 2026-01-01 至报告周期结束的年度累计值 ===
    // 需求关单率（年度累计）。注意后端 totalIdentifiedCount 已排除长期演进
    const demandNumerator = (ad?.completedCount ?? 0) + (ad?.rejectedCount ?? 0);
    const demandDenominator = (ad?.totalIdentifiedCount ?? 0);
    const annualDemandCloseRate = demandDenominator > 0 ? demandNumerator / demandDenominator : 0;

    // BUG关单率（年度累计）。bugCount 含长期演进，需减去
    const bugNumerator = (ad?.bugCompletedCount ?? 0) + (ad?.bugRejectedCount ?? 0);
    const bugDenominator = (ad?.bugCount ?? 0) - (ad?.bugLongTermCount ?? 0);
    const annualBugCloseRate = bugDenominator > 0 ? bugNumerator / bugDenominator : 0;

    // 总关单率（年度累计）
    // totalIdentifiedCount 后台已排除长期演进，只需加上 bug 有效总数
    const totalNumerator = (ad?.completedCount ?? 0) + (ad?.rejectedCount ?? 0) + (ad?.bugCompletedCount ?? 0) + (ad?.bugRejectedCount ?? 0);
    const totalDenominator = (ad?.totalIdentifiedCount ?? 0) + (ad?.bugCount ?? 0) - (ad?.bugLongTermCount ?? 0);
    const annualTotalCloseRate = totalDenominator > 0 ? totalNumerator / totalDenominator : 0;

    // 关单率全部 clamp 到 0~1
    const annualDemandCloseRateClamped = clampRate(annualDemandCloseRate);
    const annualBugCloseRateClamped = clampRate(annualBugCloseRate);
    const annualTotalCloseRateClamped = clampRate(annualTotalCloseRate);

    // 满意度 & 问题解决率：使用年度累计 KPI 数据（同一数据源，口径一致）
    const annualSatisfactionRate = clampRate(ak?.satisfactionRate ?? 0);
    const annualRatedSessions = ak?.ratedSessions ?? 0;

    // 问题解决率：优先从年度KPI直接获取（与满意度同源），其次月度投票统计，最后降级
    const mvsTotalVotes = mvs?.reduce((sum, m) => sum + m.totalVotes, 0) ?? 0;
    const mvsTotalResolved = mvs?.reduce((sum, m) => sum + m.resolvedCount, 0) ?? 0;
    const annualProblemResolutionRate = ak?.problemResolutionRate != null
      ? clampRate(ak.problemResolutionRate)
      : mvsTotalVotes > 0
        ? clampRate(mvsTotalResolved / mvsTotalVotes)
        : clampRate(ak?.satisfactionRate ?? 0); // 降级：使用满意度近似

    // 月度趋势（按月独立统计，1-3月无数据时显示为0保持x轴连续）
    const satMonthly: { month: string; value: number }[] = [];
    const resMonthly: { month: string; value: number }[] = [];

    const msat = monthlySatisfaction;
    if (msat && msat.length > 0) {
      for (const m of msat) {
        satMonthly.push({ month: m.month, value: clampRate(m.satisfactionRate ?? 0) });
        resMonthly.push({ month: m.month, value: clampRate(m.problemResolutionRate ?? 0) });
      }
    } else if (mvs && mvs.length > 0) {
      // 降级：使用月度投票统计数据（当月口径）
      const totalVotes = mvs.reduce((sum, m) => sum + m.totalVotes, 0);
      const totalSatisfied = mvs.reduce((sum, m) => sum + m.satisfiedCount, 0);
      const totalResolved = mvs.reduce((sum, m) => sum + m.resolvedCount, 0);
      const fallbackAnnualSatisfactionRate = totalVotes > 0 ? clampRate(totalSatisfied / totalVotes) : 0;
      const fallbackAnnualProblemResolutionRate = totalVotes > 0 ? clampRate(totalResolved / totalVotes) : 0;

      for (const m of mvs.sort((a, b) => a.month.localeCompare(b.month))) {
        satMonthly.push({
          month: m.month,
          value: m.totalVotes > 0 ? clampRate(m.satisfiedCount / m.totalVotes) : 0,
        });
        resMonthly.push({
          month: m.month,
          value: m.totalVotes > 0 ? clampRate(m.resolvedCount / m.totalVotes) : 0,
        });
      }
    } else {
      // 降级：使用 KPI overview 数据
      const fallbackAnnualSatisfactionRate = clampRate(s?.satisfactionRate ?? 0);
      const fallbackAnnualProblemResolutionRate = clampRate(s?.satisfactionRate ?? 0);
    }

    // === 修改点1：响应效率月度数据 ===
    const avgFirstResponseTimeMonthly = mm
      ? mm
          .filter(m => m.avgFirstResponseTime !== null)
          .map(m => ({ month: m.month, value: m.avgFirstResponseTime! }))
      : [];

    const avgResponseTimeMonthly = mm
      ? mm
          .filter(m => m.avgResponseTime !== null)
          .map(m => ({ month: m.month, value: m.avgResponseTime! }))
      : [];

    // 月度关单率（当月口径）：每月独立计算
    const demandCloseMonthly = computeMonthlyCloseRate(ad?.monthlyRequirement);
    const bugCloseMonthly = computeMonthlyCloseRate(ad?.monthlyBug);
    // 总关单率月度 = 需求 + Bug 按月合并后计算当月口径
    const totalCloseMonthly = (() => {
      const reqData = ad?.monthlyRequirement ?? [];
      const bugData = ad?.monthlyBug ?? [];
      const monthsSet = new Set<string>();
      reqData.forEach(m => monthsSet.add(m.month));
      bugData.forEach(m => monthsSet.add(m.month));
      const merged: { month: string; created: number; completed: number; rejectedCount: number; longTermCount: number }[] = [];
      Array.from(monthsSet).sort().forEach(month => {
        const r = reqData.find(m => m.month === month);
        const b = bugData.find(m => m.month === month);
        merged.push({
          month,
          created: (r?.created ?? 0) + (b?.created ?? 0),
          completed: (r?.completed ?? 0) + (b?.completed ?? 0),
          rejectedCount: (r?.rejectedCount ?? 0) + (b?.rejectedCount ?? 0),
          longTermCount: (r?.longTermCount ?? 0) + (b?.longTermCount ?? 0),
        });
      });
      return computeMonthlyCloseRate(merged);
    })();

    // 咨询量
    const consultationCount = f?.periods?.reduce((sum, p) => sum + (p.consultationCount ?? 0), 0) ?? 0;

    // 响应时长 - 从月度指标计算年度累计平均值
    const avgFirstResponseTime: number | null = mm && mm.length > 0
      ? Math.round(mm.filter(m => m.avgFirstResponseTime !== null).reduce((sum, m) => sum + (m.avgFirstResponseTime ?? 0), 0) / mm.filter(m => m.avgFirstResponseTime !== null).length) || null
      : (ms?.avgFirstResponseTime ?? null);
    const avgResponseTime: number | null = mm && mm.length > 0
      ? Math.round(mm.filter(m => m.avgResponseTime !== null).reduce((sum, m) => sum + (m.avgResponseTime ?? 0), 0) / mm.filter(m => m.avgResponseTime !== null).length) || null
      : (ms?.avgResponseTime ?? null);
    // 平均对话时长
    const avgSessionDuration: number | null = ms?.avgResolutionTime ?? null;
    // 实际出勤人数：按 topAgents 中实际有工作量的客服数（过滤掉零星会话）
    const activeAgentCount = (() => {
      const top = u?.topAgents ?? [];
      return top.filter(a => a.sessions >= 5).length || Math.max(u?.agentCount ?? 0, 1);
    })();

    // 趋势图中排除当前未过完的月份
    const currentMonth = new Date().toISOString().slice(0, 7);
    const excludeCurrentMonth = (arr: { month: string; value: number }[]) =>
      arr.filter(m => m.month !== currentMonth);

    return {
      // 修改点4：本周完成值统一使用年度累计值
      totalCloseRate: annualTotalCloseRateClamped,
      demandCloseRate: annualDemandCloseRateClamped,
      bugCloseRate: annualBugCloseRateClamped,
      totalCloseMonthly: excludeCurrentMonth(totalCloseMonthly),
      demandCloseMonthly: excludeCurrentMonth(demandCloseMonthly),
      bugCloseMonthly: excludeCurrentMonth(bugCloseMonthly),
      // 修改点2：满意度 & 问题解决率使用修正后逻辑
      satisfactionRate: annualSatisfactionRate,
      satisfactionRated: annualRatedSessions,
      problemResolutionRate: annualProblemResolutionRate,
      satMonthly: excludeCurrentMonth(satMonthly),
      resMonthly: excludeCurrentMonth(resMonthly),
      // 修改点1：添加响应效率月度数据
      avgFirstResponseTime,
      avgResponseTime,
      avgFirstResponseTimeMonthly: excludeCurrentMonth(avgFirstResponseTimeMonthly),
      avgResponseTimeMonthly: excludeCurrentMonth(avgResponseTimeMonthly),
      consultationCount,
      returnVisitCount: u?.returnVisitCount ?? null,
      huaweiCloudUnbind: null,
      newDemands: (ad?.totalIdentifiedCount ?? 0),
      newBugs: (ad?.bugCount ?? 0) - (ad?.bugLongTermCount ?? 0),
      closedDemands: (ad?.completedCount ?? 0) + (ad?.rejectedCount ?? 0),
      closedBugs: (ad?.bugCompletedCount ?? 0) + (ad?.bugRejectedCount ?? 0),
      activeAgentCount,
      agentCount: u?.agentCount ?? 0,
      totalSessions: u?.totalSessions ?? consultationCount,
      totalMessages: u?.totalMessages ?? 0,
      avgSessionDuration,
      // 商务转化
      opportunityCount: opportunitySummary?.total ?? 0,
      opportunityWon: opportunitySummary?.manualCreated ?? 0,
      // 4. 人效评估 = 每人分别算自己的周人效，然后取平均
      teamEfficiency: (() => {
        const returnVisit = u?.returnVisitCount ?? 0;

        // 活跃客服（有实际工作量的）
        const activeAgents = (u?.topAgents ?? []).filter(a => a.sessions >= 5);
        const agentCnt = Math.max(activeAgents.length, 1);

        // 出勤天数：按日评分数据中非 null 的天数
        const ratingSeries = dailyRatingStats?.series ?? [];

        // 每人各自的提单数（需求+bug）
        const agentNameMap = new Map(agents.map(a => [a.agentId, a.displayName]));
        const issueRows = agentOverview?.rows ?? [];
        const agentIssuesMap = new Map<string, { demands: number; bugs: number }>();
        for (const row of issueRows) {
          agentIssuesMap.set(row.agentName, { demands: row.reqCreated, bugs: row.bugCreated });
        }

        // 每人均摊的回访数
        const perAgentReturn = returnVisit / agentCnt;

        const efficiencies = activeAgents.map(agent => {
          const series = ratingSeries.find(s => s.agentId === agent.agentId);
          const workDays = series
            ? series.ratings.filter(r => r !== null).length
            : 1;
          // 找到该客服的提单数
          const agentName = agentNameMap.get(agent.agentId);
          const issues = agentName ? agentIssuesMap.get(agentName) : undefined;
          const issueCount = issues ? (issues.demands + issues.bugs) : 0;
          const numerator = agent.sessions + issueCount * 2.5 + perAgentReturn * 0.25;
          const denominator = 40 * Math.max(workDays, 1);
          return numerator / denominator;
        });

        return efficiencies.reduce((sum, e) => sum + e, 0) / efficiencies.length;
      })(),
    };
  }, [kpiOverview, demandOverview, annualDemandOverview, annualKpiOverview, funnel, udescOverview, dailyRatingStats, teamMetricsSummary, opportunitySummary, monthlyVoteStats, monthlyMetrics, monthlySatisfaction, agentOverview, agents]);

  // 团队数据就绪后计算环比
  useEffect(() => {
    if (Object.values(teamMetrics).every(v => v !== undefined)) {
      calcComparison(teamMetrics);
    }
  }, [teamMetrics]);

  // === 计算个人指标 ===
  const personalMetrics = useMemo((): WeeklyMetrics => {
    const perf = agentPerformance;
    const sum = agentMetricsSummary;
    const team = teamMetrics;
    const ad = personalDemandOverview; // 个人年度累计需求统计
    const pk = personalKpiOverview; // 个人年度累计满意度&解决率

    const agentCnt = Math.max(team.activeAgentCount ?? team.agentCount, 1);

    // 按客服的个人提单数据（从 agentOverview 中匹配）
    const agentId = perf?.agentId ?? selectedAgentId;
    const agentProfile = agents.find(a => a.agentId === agentId);
    const issueRow = agentProfile
      ? (agentOverview?.rows ?? []).find(r => r.agentName === agentProfile.displayName)
      : undefined;

    // 个人需求/Bug 数据（优先从 agentOverview 获取本周绝对值，其次按团队均分）
    const personalReqCreated = issueRow?.reqCreated ?? Math.round(team.newDemands / agentCnt);
    const personalReqCompleted = issueRow?.reqCompleted ?? 0;
    const personalReqRejected = issueRow?.reqRejected ?? 0;
    const personalBugCreated = issueRow?.bugCreated ?? Math.round(team.newBugs / agentCnt);
    const personalBugCompleted = issueRow?.bugCompleted ?? 0;
    const personalBugRejected = issueRow?.bugRejected ?? 0;

    // 个人关单率：与团队完全相同的计算方式，但筛选该客服的数据
    // 优先使用 personalDemandOverview（按客服的年度累计），降级到团队值
    const demandNumerator = (ad?.completedCount ?? 0) + (ad?.rejectedCount ?? 0);
    const demandDenominator = (ad?.totalIdentifiedCount ?? 0);
    const personalDemandCloseRate = demandDenominator > 0
      ? clampRate(demandNumerator / demandDenominator)
      : team.demandCloseRate;

    const bugNumerator = (ad?.bugCompletedCount ?? 0) + (ad?.bugRejectedCount ?? 0);
    const bugDenominator = (ad?.bugCount ?? 0) - (ad?.bugLongTermCount ?? 0);
    const personalBugCloseRate = bugDenominator > 0
      ? clampRate(bugNumerator / bugDenominator)
      : team.bugCloseRate;

    const totalNumerator = demandNumerator + bugNumerator;
    const totalDenominator = demandDenominator + bugDenominator;
    const personalTotalCloseRate = totalDenominator > 0
      ? clampRate(totalNumerator / totalDenominator)
      : team.totalCloseRate;

    // 个人满意度 & 问题解决率：从 per-agent 年度累计数据获取（与团队同源同口径）
    const personalSatisfaction = pk?.satisfactionRate != null
      ? clampRate(pk.satisfactionRate)
      : (perf?.satisfactionRate != null ? clampRate(perf.satisfactionRate) : null);

    const personalProblemResolutionRate = pk?.problemResolutionRate != null
      ? clampRate(pk.problemResolutionRate)
      : (perf?.problemResolutionRate != null
          ? clampRate(perf.problemResolutionRate)
          : team.problemResolutionRate);

    // 个人咨询量
    const personalConsultCount = perf?.totalSessions ?? Math.round(team.consultationCount / agentCnt);

    return {
      totalCloseRate: personalTotalCloseRate,
      demandCloseRate: personalDemandCloseRate,
      bugCloseRate: personalBugCloseRate,
      totalCloseMonthly: team.totalCloseMonthly,
      demandCloseMonthly: team.demandCloseMonthly,
      bugCloseMonthly: team.bugCloseMonthly,
      satisfactionRate: personalSatisfaction ?? team.satisfactionRate,
      satisfactionRated: team.satisfactionRated,
      problemResolutionRate: personalProblemResolutionRate,
      satMonthly: team.satMonthly,
      resMonthly: team.resMonthly,
      avgFirstResponseTime: perf?.avgFirstResponseTime ?? sum?.avgFirstResponseTime ?? null,
      avgResponseTime: sum?.avgResponseTime ?? null,
      avgFirstResponseTimeMonthly: team.avgFirstResponseTimeMonthly,
      avgResponseTimeMonthly: team.avgResponseTimeMonthly,
      consultationCount: personalConsultCount,
      returnVisitCount: perf?.returnVisitCount ?? Math.round((team.returnVisitCount ?? 0) / agentCnt),
      huaweiCloudUnbind: null,
      newDemands: personalReqCreated,
      newBugs: personalBugCreated,
      closedDemands: personalReqCompleted + personalReqRejected,
      closedBugs: personalBugCompleted + personalBugRejected,
      agentCount: 1,
      activeAgentCount: 1,
      totalSessions: perf?.totalSessions ?? 0,
      totalMessages: perf?.totalMessages ?? 0,
      avgSessionDuration: sum?.avgResolutionTime ?? null,
      // 商务转化（个人按团队平均）
      opportunityCount: Math.round(team.opportunityCount / agentCnt),
      opportunityWon: Math.round(team.opportunityWon / agentCnt),
      // 人效评估（个人：与团队相同算法，按出勤天数计算）
      teamEfficiency: (() => {
        const sessions = perf?.totalSessions ?? Math.round(team.consultationCount / agentCnt);
        const perAgentReturn = perf?.returnVisitCount ?? 0;
        // 从个人 dailyStats 中统计有会话的天数作为出勤天数
        const dailyStats = perf?.dailyStats ?? [];
        const workDays = dailyStats.filter(d => d.sessions > 0).length;
        if (workDays === 0) return 0;
        const reqIssues = issueRow?.reqCreated ?? 0;
        const bugIssues = issueRow?.bugCreated ?? 0;
        const numerator = sessions + reqIssues * 2.5 + bugIssues * 2.5 + perAgentReturn * 0.25;
        const denominator = 40 * Math.max(workDays, 1);
        return numerator / denominator;
      })(),
    };
  }, [agentPerformance, agentMetricsSummary, teamMetrics, dailyRatingStats, agentOverview, agents, selectedAgentId, personalDemandOverview, personalKpiOverview]);







  // 通过后端 SMTP 发送报告邮件
  const handleSendSmtp = useCallback(async (type: 'personal' | 'team') => {
    if (!smtpEmail.trim()) {
      message.error('请输入收件人邮箱地址');
      return;
    }
    const sections = type === 'team' ? teamSections : personalSections;
    const agentName = type === 'personal' && selectedAgentId
      ? agents.find((a) => a.agentId === selectedAgentId)?.displayName ?? selectedAgentId
      : undefined;
    setSmtpSending(true);
    try {
      await sendReport({
        startDate: formatDate(dateRange![0]),
        endDate: formatDate(dateRange![1]),
        summary: sections.otherWork,
        nextPlan: sections.nextPlan,
        recipientEmail: smtpEmail.trim(),
        subject: `GitCode 客服${type === 'team' ? '团队' : '个人'}周报（${formatDate(dateRange![0])} ~ ${formatDate(dateRange![1])}）`,
        type,
        agentName,
        topQuestions: editableState.topQuestions,
        risks: editableState.risks,
        suggestions: editableState.suggestions,
      });
      message.success('✅ 周报已发送到 ' + smtpEmail.trim());
    } catch (e: any) {
      message.error('发送失败: ' + (e?.response?.data?.message ?? e?.message ?? '未知错误'));
    } finally {
      setSmtpSending(false);
    }
  }, [dateRange, teamSections, personalSections, selectedAgentId, agents, smtpEmail]);



;

  // ====== 精装数据视图 ======
  const renderMetricsSection = (metrics: WeeklyMetrics, isPersonal: boolean) => {
    // --- 顶部摘要 KPI 卡片 ---
    const kpiCards = [
      {
        label: '总关单率',
        value: pct(metrics.totalCloseRate),
        target: '≥95%',
        status: metrics.totalCloseRate != null && metrics.totalCloseRate >= 0.95 ? 'success' : 'danger',
        icon: '📊',
        gradient: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
      },
      {
        label: '满意度',
        value: pct(metrics.satisfactionRate),
        target: '≥95%',
        status: metrics.satisfactionRate != null && metrics.satisfactionRate >= 0.95 ? 'success' : 'danger',
        icon: '😊',
        gradient: 'linear-gradient(135deg, #f093fb 0%, #f5576c 100%)',
      },
      {
        label: '平均首次响应',
        value: fmtMinutes(metrics.avgFirstResponseTime),
        target: '≤60s',
        status: metrics.avgFirstResponseTime != null && metrics.avgFirstResponseTime <= 60 ? 'success' : 'danger',
        icon: '⚡',
        gradient: 'linear-gradient(135deg, #4facfe 0%, #00f2fe 100%)',
      },
    ];

    const metricColor = (status: string) =>
      status === 'success' ? '#22c55e' : status === 'danger' ? '#ef4444' : '#3b82f6';

    return (
      <>
        {/* ── 顶部 KPI 仪表盘 ── */}
        <Row gutter={[12, 12]} style={{ marginBottom: 16 }}>
          {kpiCards.map((card, i) => (
            <Col span={8} key={i}>
              <div
                style={{
                  background: card.gradient,
                  borderRadius: 16,
                  padding: '16px 18px',
                  color: '#fff',
                  boxShadow: '0 8px 24px rgba(0,0,0,0.12)',
                  transition: 'transform 0.2s',
                  cursor: 'default',
                }}
                onMouseEnter={(e) => (e.currentTarget.style.transform = 'translateY(-2px)')}
                onMouseLeave={(e) => (e.currentTarget.style.transform = 'translateY(0)')}
              >
                <div style={{ fontSize: 22, marginBottom: 4 }}>{card.icon}</div>
                <div style={{ fontSize: 11, opacity: 0.8, marginBottom: 2 }}>{card.label}</div>
                <div style={{ fontSize: 22, fontWeight: 700, lineHeight: 1.2 }}>{card.value}</div>
                <div style={{ fontSize: 10, opacity: 0.7, marginTop: 2 }}>{card.target}</div>
              </div>
            </Col>
          ))}
        </Row>

        {/* ── 一、闭环质量 ── */}
        <Card
          size="small"
          title={
            <Text strong id="section-quality" style={{ fontSize: 15 }}>
              📊 一、闭环质量
            </Text>
          }
          style={{ marginBottom: 14, borderRadius: 12, boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }}
          extra={
            <Text type="secondary" style={{ fontSize: 12 }}>
              目标: ≥95%
            </Text>
          }
        >
          {/* 表头 */}
          <div style={{
            background: 'linear-gradient(135deg, #f8fafc 0%, #e2e8f0 100%)',
            borderRadius: 8,
            padding: '8px 12px',
            marginBottom: 4,
            fontWeight: 600,
            fontSize: 12,
            color: '#475569',
          }}>
            <Row gutter={8} align="middle">
              <Col span={5}>核心指标</Col>
              <Col span={3}>目标值</Col>
              <Col span={5}>本周完成值</Col>
              <Col span={5}>进度</Col>
              <Col span={6}>状态</Col>
            </Row>
          </div>
          <PolishedMetricRow
            label="总关单率"
            value={pct(metrics.totalCloseRate)}
            target={0.95}
            indicatorInfo="总关单率 = (需求闭环数 + 已拒绝需求 + Bug闭环数 + 已拒绝Bug) / (需求总数 + Bug总数 - 需求长期演进 - Bug长期演进)"
            monthlyHistory={metrics.totalCloseMonthly}
            rate={metrics.totalCloseRate}
          />
          <PolishedMetricRow
            label="需求关单率"
            value={pct(metrics.demandCloseRate)}
            target={0.95}
            indicatorInfo="(已闭环需求+已拒绝需求)/(总需求-长期演进需求)"
            monthlyHistory={metrics.demandCloseMonthly}
            rate={metrics.demandCloseRate}
          />
          <PolishedMetricRow
            label="BUG关单率"
            value={pct(metrics.bugCloseRate)}
            target={0.95}
            indicatorInfo="(已闭环BUG+已拒绝BUG)/(总BUG-长期演进BUG)"
            monthlyHistory={metrics.bugCloseMonthly}
            rate={metrics.bugCloseRate}
          />
        </Card>

        {/* ── 二、体验与响应效率指标 ── */}
        <Card
          size="small"
          title={
            <Text strong id="section-experience" style={{ fontSize: 15 }}>
              💡 二、体验与响应效率指标
            </Text>
          }
          style={{ marginBottom: 14, borderRadius: 12, boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }}
        >
          {/* 2.1 体验指标 */}
          <div style={{ marginBottom: 14 }}>
            <div style={{
              display: 'inline-block',
              background: '#f0f9ff',
              color: '#0369a1',
              fontSize: 11,
              fontWeight: 600,
              padding: '2px 10px',
              borderRadius: 10,
              marginBottom: 8,
            }}>
              2.1 体验指标
            </div>
            <div style={{
              background: 'linear-gradient(135deg, #f8fafc 0%, #e2e8f0 100%)',
              borderRadius: 8,
              padding: '8px 12px',
              marginBottom: 4,
              fontWeight: 600,
              fontSize: 12,
              color: '#475569',
            }}>
              <Row gutter={8} align="middle">
                <Col span={5}>核心指标</Col>
                <Col span={3}>目标值</Col>
                <Col span={5}>本周完成值</Col>
                <Col span={5}>进度</Col>
                <Col span={6}>状态</Col>
              </Row>
            </div>
            <PolishedMetricRow
              label="满意度"
              value={pct(metrics.satisfactionRate)}
              target={0.95}
              indicatorInfo="满意数量/有效参与评价总数"
              monthlyHistory={metrics.satMonthly}
              rate={metrics.satisfactionRate}
            />
            <PolishedMetricRow
              label="问题解决率"
              value={pct(metrics.problemResolutionRate)}
              target={0.90}
              indicatorInfo="已解决数量/有效参与评价总数"
              monthlyHistory={metrics.resMonthly}
              rate={metrics.problemResolutionRate}
            />
          </div>

          {/* 2.2 响应效率 */}
          <div>
            <div style={{
              display: 'inline-block',
              background: '#fff7ed',
              color: '#9a3412',
              fontSize: 11,
              fontWeight: 600,
              padding: '2px 10px',
              borderRadius: 10,
              marginBottom: 8,
            }}>
              2.2 响应效率 <Text type="secondary" style={{ fontSize: 10 }}>(数据源: udesk会话指标)</Text>
            </div>
            <div style={{
              background: 'linear-gradient(135deg, #f8fafc 0%, #e2e8f0 100%)',
              borderRadius: 8,
              padding: '8px 12px',
              marginBottom: 4,
              fontWeight: 600,
              fontSize: 12,
              color: '#475569',
            }}>
              <Row gutter={8} align="middle">
                <Col span={5}>核心指标</Col>
                <Col span={3}>目标值</Col>
                <Col span={5}>本周完成值</Col>
                <Col span={5}>进度</Col>
                <Col span={6}>状态</Col>
              </Row>
            </div>
            <PolishedMetricRow
              label="平均首次响应时长"
              value={fmtMinutes(metrics.avgFirstResponseTime)}
              target={metrics.avgFirstResponseTime != null ? (metrics.avgFirstResponseTime <= 60 ? 1 : 0) : undefined}
              indicatorInfo="首次响应时间之和/会话数"
              monthlyHistory={metrics.avgFirstResponseTimeMonthly}
              formatMonthlyValue={(v) => fmtMinutes(v)}
              rate={metrics.avgFirstResponseTime != null ? (metrics.avgFirstResponseTime <= 60 ? 1 : 0) : undefined}
              statusOverride={
                metrics.avgFirstResponseTime !== null
                  ? (metrics.avgFirstResponseTime <= 60
                    ? <Tag color="success" style={{ borderRadius: 12, border: 'none' }}>✅ 达标 ≤60s</Tag>
                    : <Tag color="error" style={{ borderRadius: 12, border: 'none' }}>❌ 未达标 {fmtMinutes(metrics.avgFirstResponseTime)}</Tag>)
                  : <Tag style={{ borderRadius: 12, border: 'none' }}>{isPersonal && selectedAgentId ? '暂无数据' : '已接入'}</Tag>
              }
            />
            <PolishedMetricRow
              label="平均响应时长"
              value={fmtMinutes(metrics.avgResponseTime)}
              target={metrics.avgResponseTime != null ? (metrics.avgResponseTime <= 120 ? 1 : 0) : undefined}
              indicatorInfo="各会话平均响应时间的均值"
              monthlyHistory={metrics.avgResponseTimeMonthly}
              formatMonthlyValue={(v) => fmtMinutes(v)}
              rate={metrics.avgResponseTime != null ? (metrics.avgResponseTime <= 120 ? 1 : 0) : undefined}
              statusOverride={
                metrics.avgResponseTime !== null
                  ? (metrics.avgResponseTime <= 120
                    ? <Tag color="success" style={{ borderRadius: 12, border: 'none' }}>✅ 达标 ≤120s</Tag>
                    : <Tag color="error" style={{ borderRadius: 12, border: 'none' }}>❌ 未达标 {fmtMinutes(metrics.avgResponseTime)}</Tag>)
                  : <Tag style={{ borderRadius: 12, border: 'none' }}>{isPersonal && selectedAgentId ? '暂无数据' : '已接入'}</Tag>
              }
            />
          </div>
        </Card>
      </>
    );
  };

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

  const renderWorkloadSection = (metrics: WeeklyMetrics, isPersonal: boolean) => {
    // 是否显示华为云解绑（团队视图或段嘉雯个人）
    const personalAgentName = agents.find(a => a.agentId === selectedAgentId)?.displayName;
    const showHuaweiCloud = !isPersonal || personalAgentName === '段嘉雯';

    type DetailRow = { category: string; item: string; value: string | number; hours: string; status: string; calcMethod: string; isInput?: boolean; inputKey?: string };

    // 工时汇总统计
    const detailRows: DetailRow[] = [
      { category: '咨询承接', item: '用户主动咨询量/次', value: fmt(metrics.consultationCount), hours: calcConsultHours(metrics.consultationCount, metrics.avgSessionDuration), status: '已完成', calcMethod: '咨询量×(平均对话时长−10min)' },
      { category: '咨询承接', item: '回访次数/次', value: fmt(metrics.returnVisitCount), hours: calcHours(metrics.returnVisitCount, 5), status: '已完成', calcMethod: '回访总次数×5min' },
    ];
    if (showHuaweiCloud) {
      detailRows.push({ category: '专项业务', item: '申请解绑华为云数量', value: huaweiCloudUnbindInput ?? 0, hours: calcHours(huaweiCloudUnbindInput, 1), status: huaweiCloudUnbindInput !== null && huaweiCloudUnbindInput > 0 ? '已完成' : '待接入', calcMethod: '解绑申请总数×1min', isInput: true });
    }
    detailRows.push(
      { category: '问题转化', item: '新增需求数/个', value: fmt(metrics.newDemands), hours: calcHours(metrics.newDemands, 30), status: '已录入', calcMethod: '新增需求总数×30min' },
      { category: '问题转化', item: '新增BUG数/个', value: fmt(metrics.newBugs), hours: calcHours(metrics.newBugs, 30), status: '已录入', calcMethod: '新增BUG总数×30min' },
      { category: '问题闭环', item: '已闭环需求数/个', value: fmt(metrics.closedDemands), hours: calcHours(metrics.closedDemands, 15), status: '已闭环', calcMethod: '已关单需求数×15min' },
      { category: '问题闭环', item: '已闭环BUG数/个', value: fmt(metrics.closedBugs), hours: calcHours(metrics.closedBugs, 15), status: '已闭环', calcMethod: '已关单BUG数×15min' },
      { category: '商务转化', item: '商机转化', value: manualOpportunityInput ?? 0, hours: '—', status: manualOpportunityInput !== null && manualOpportunityInput > 0 ? '已完成' : '待接入', calcMethod: '商机转化（无工时）', isInput: true, inputKey: 'manualOpportunity' },
      { category: '人效', item: '人效评估', value: metrics.teamEfficiency > 0 ? metrics.teamEfficiency.toFixed(2) : '—', hours: '—', status: metrics.teamEfficiency > 0 ? '已完成' : '—', calcMethod: '(咨询量+新增提单×2.5+回访×0.25)/(40×出勤人数)' },
    );
    const statusColor: Record<string, string> = {
      '已完成': 'success', '已闭环': 'success', '已录入': 'processing',
      '进行中': 'processing', '待接入': 'default', '—': 'default',
    };
    // 汇总工时（仅统计数值行）
    const totalHours = detailRows.reduce((acc, r) => {
      const h = parseFloat(r.hours as string);
      return acc + (isNaN(h) ? 0 : h);
    }, 0);

    return (
      <Card
        size="small"
        title={
          <Space>
            <Text strong id="section-workload" style={{ fontSize: 15 }}>📋 三、业务承接（基础工作量）</Text>
            <Tag color="blue" style={{ fontSize: 11, lineHeight: '18px' }}>
              总工时: {totalHours > 0 ? `${totalHours.toFixed(1)}h` : '—'}
            </Tag>
          </Space>
        }
        style={{ marginBottom: 14, borderRadius: 12, boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }}
        extra={
          <Text type="secondary" style={{ fontSize: 12 }}>
            周期: {formatDate(dateRange![0])} ~ {formatDate(dateRange![1])}
          </Text>
        }
      >
        {/* 表头 */}
        <div style={{
          background: 'linear-gradient(135deg, #f1f5f9 0%, #e2e8f0 100%)',
          borderRadius: 8,
          padding: '8px 12px',
          marginBottom: 2,
          fontWeight: 600,
          fontSize: 12,
          color: '#334155',
        }}>
          <Row gutter={8} align="middle">
            <Col span={2}>分类</Col>
            <Col span={4}>事项</Col>
            <Col span={3}>本周完成值</Col>
            <Col span={3}>工时统计(h)</Col>
            <Col span={2}>状态</Col>
            <Col span={5}>工时计算方式</Col>
          </Row>
        </div>
        {detailRows.map((r, idx) => (
          <div
            key={idx}
            style={{
              padding: '6px 12px',
              borderBottom: '1px solid #f0f0f0',
              fontSize: 13,
              background: idx % 2 === 0 ? '#ffffff' : '#fafbfc',
              borderRadius: idx === 0 ? '8px 8px 0 0' : idx === detailRows.length - 1 ? '0 0 8px 8px' : '0',
            }}
          >
            <Row gutter={8} align="middle">
              <Col span={2}>
                <Tag style={{ fontSize: 11, lineHeight: '18px', margin: 0 }}>{r.category}</Tag>
              </Col>
              <Col span={4}>
                <Text style={{ fontSize: 13, color: '#1e293b' }}>{r.item}</Text>
              </Col>
              <Col span={3}>
                {r.isInput ? (
                  r.inputKey === 'manualOpportunity' ? (
                    <InputNumber
                      min={0}
                      value={manualOpportunityInput}
                      onChange={(val: number | null) => setManualOpportunityInput(val)}
                      style={{ width: 70 }}
                      size="small"
                      placeholder="0"
                    />
                  ) : (
                    <InputNumber
                      min={0}
                      value={huaweiCloudUnbindInput}
                      onChange={(val: number | null) => setHuaweiCloudUnbindInput(val)}
                      style={{ width: 70 }}
                      size="small"
                      placeholder="0"
                    />
                  )
                ) : (
                  <Text strong style={{ fontSize: 14, color: '#0f172a' }}>{r.value}</Text>
                )}
              </Col>
              <Col span={3}>
                <div style={{
                  display: 'inline-block',
                  background: r.hours !== '—' && r.hours !== '—' && r.hours !== '0.0' ? '#f0fdf4' : '#f8fafc',
                  padding: '2px 8px',
                  borderRadius: 6,
                  fontWeight: r.hours !== '—' ? 600 : 400,
                  fontSize: 13,
                  color: r.hours !== '—' && r.hours !== '0.0' ? '#16a34a' : '#94a3b8',
                }}>
                  {r.hours}
                </div>
              </Col>
              <Col span={2}>
                <Tag color={statusColor[r.status] || 'default'} style={{ borderRadius: 10, border: 'none', margin: 0 }}>
                  {r.status}
                </Tag>
              </Col>
              <Col span={5}>
                <Text type="secondary" style={{ fontSize: 11, fontStyle: 'italic' }}>{r.calcMethod}</Text>
              </Col>
            </Row>
          </div>
        ))}
      </Card>
    );
  };

  // 当前指标和编辑状态
  const isPersonal = reportTab === 'personal';
  const currentMetrics = isPersonal ? personalMetrics : teamMetrics;
  const currentSections = isPersonal ? personalSections : teamSections;
  const currentEditing = isPersonal ? personalEditing : teamEditing;
  const setCurrentSections = isPersonal ? setPersonalSections : setTeamSections;
  const setCurrentEditing = isPersonal ? setPersonalEditing : setTeamEditing;

  // 异常指标汇总
  const anomalies = useMemo(() => {
    const list: { label: string; current: string; target: string }[] = [];
    const m = currentMetrics;
    if (m.totalCloseRate < 0.95) list.push({ label: '总关单率', current: pct(m.totalCloseRate), target: '≥95%' });
    if (m.demandCloseRate < 0.95) list.push({ label: '需求关单率', current: pct(m.demandCloseRate), target: '≥95%' });
    if (m.bugCloseRate < 0.95) list.push({ label: 'BUG关单率', current: pct(m.bugCloseRate), target: '≥95%' });
    if (m.satisfactionRate < 0.95) list.push({ label: '满意度', current: pct(m.satisfactionRate), target: '≥95%' });
    if (m.problemResolutionRate < 0.90) list.push({ label: '问题解决率', current: pct(m.problemResolutionRate), target: '≥90%' });
    if (m.avgFirstResponseTime !== null && m.avgFirstResponseTime > 60) list.push({ label: '平均首次响应时长', current: fmtMinutes(m.avgFirstResponseTime), target: '≤60s' });
    if (m.avgResponseTime !== null && m.avgResponseTime > 120) list.push({ label: '平均响应时长', current: fmtMinutes(m.avgResponseTime), target: '≤120s' });
    return list;
  }, [currentMetrics]);

  // 当前指标变化后保存到缓存
  useEffect(() => {
    if (!dateRange || !dateRange[0] || !dateRange[1]) return;
    const m = currentMetrics;
    if (m && m.totalCloseRate !== undefined && !loading) {
      saveMetricsToCache(m, formatDate(dateRange[0]), formatDate(dateRange[1]));
    }
  }, [currentMetrics, loading]);

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
                onChange={(key: string) => setReportTab(key as 'team' | 'personal')}
                items={[
                  { key: 'team', label: <span><TeamOutlined /> 团队周报</span> },
                  { key: 'personal', label: <span><UserOutlined /> 个人周报</span> },
                ]}
                style={{ marginBottom: 0 }}
              />
              {reportTab === 'personal' && (
                <Select
                  value={selectedAgentId}
                  onChange={(val) => setSelectedAgentId(val)}
                  style={{ width: 150 }}
                  placeholder="选择人员"
                  options={agents
                    .filter(a => ['段嘉雯', '覃晓阳', '潘芳'].includes(a.displayName))
                    .map(a => ({ value: a.agentId, label: a.displayName }))}
                />
              )}
            </Space>
          </Col>
          <Col>
            <Space>
              {/* 固定周期：上周五 ~ 本周四（支持上/下翻页查看历史） */}
              <Button
                icon={<LeftOutlined />}
                size="small"
                disabled={weekOffset <= -52}
                onClick={() => setWeekOffset(v => v - 1)}
              />
              <Tooltip title="点击回到当前周">
                <Text
                  strong
                  style={{ fontSize: 13, cursor: 'pointer', whiteSpace: 'nowrap', color: weekOffset === 0 ? '#1677ff' : undefined }}
                  onClick={() => setWeekOffset(0)}
                >
                  {formatDate(dateRange![0])} ~ {formatDate(dateRange![1])}
                  {weekOffset === 0 ? ' (本周)' : weekOffset === -1 ? ' (上周)' : ''}
                </Text>
              </Tooltip>
              <Button
                icon={<RightOutlined />}
                size="small"
                disabled={weekOffset >= 0}
                onClick={() => setWeekOffset(v => v + 1)}
              />
              <Button icon={<SyncOutlined />} onClick={handleSync} loading={syncLoading} size="small">
                同步刷新
              </Button>
              <Button
                icon={beautifulView ? <CodeOutlined /> : <EyeOutlined />}
                onClick={() => setBeautifulView(!beautifulView)}
                type={beautifulView ? 'primary' : 'default'}
                size="small"
              >
                {beautifulView ? '数据视图' : '报告视图'}
              </Button>
              {beautifulView && (
                <Tooltip title="导出报告为 HTML 文件">
                  <Button
                    icon={<DownloadOutlined />}
                    size="small"
                    onClick={() => {
                      const el = document.querySelector('.beautiful-view-wrap');
                      if (!el) { message.error('导出失败'); return; }
                      const styles = document.querySelectorAll('style, link[rel=stylesheet]');
                      let styleHtml = '';
                      styles.forEach(s => { styleHtml += s.outerHTML; });
                      const html = '<!DOCTYPE html><html><head><meta charset="utf-8"><title>周报</title>' + styleHtml + '</head><body>' + el.innerHTML + '</body></html>';
                      const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
                      const url = URL.createObjectURL(blob);
                      const a = document.createElement('a');
                      a.href = url;
                      a.download = `周报_${formatDate(dateRange![0])}_${formatDate(dateRange![1])}.html`;
                      a.click();
                      URL.revokeObjectURL(url);
                      message.success('HTML 已导出到本地');
                    }}
                  />
                </Tooltip>
              )}
              <Input
                placeholder="收件人邮箱"
                value={smtpEmail}
                onChange={(e) => setSmtpEmail(e.target.value)}
                style={{ width: 180 }}
                size="small"
                prefix={<MailOutlined />}
              />
              <Button
                type="primary"
                icon={<SendOutlined />}
                onClick={() => handleSendSmtp(reportTab as 'personal' | 'team')}
                loading={smtpSending}
                size="small"
              >
                发送服务器邮件
              </Button>
              <Tooltip title="邮箱配置">
                <Button
                  icon={<SettingOutlined />}
                  size="small"
                  onClick={() => {
                    fetchSmtpConfig().then(c => setSmtpConfig({ host: c.host || '', port: c.port || 465, user: c.user || '', pass: c.pass || '', from: c.from || '' })).catch(() => {});
                    setSmtpTestTo(smtpEmail);
                    setSmtpModalOpen(true);
                  }}
                />
              </Tooltip>

            </Space>
          </Col>
        </Row>
      </Card>

      {/* 页面内容区 */}
      {/* ⚠️ 异常指标汇总 */}
      {anomalies.length > 0 && (
        <Alert
          type="warning"
          showIcon
          message={<Text strong>⚠️ 以下指标未达标，需要关注</Text>}
          description={
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px 16px', marginTop: 4 }}>
              {anomalies.map((a, i) => (
                <Tag key={i} color="error" style={{ fontSize: 12, lineHeight: '22px', margin: 0 }}>
                  {a.label}: {a.current}（目标 {a.target}）
                </Tag>
              ))}
            </div>
          }
          style={{ marginBottom: 16 }}
          closable
        />
      )}



      {/* 页面主布局：左侧内容 + 右侧浮动导航 */}
      <div style={{ display: 'flex', gap: 20, position: 'relative' }}>
        {/* 左侧主内容区 */}
        <div style={{ flex: 1, minWidth: 0 }}>
          {loading ? (
            <div>
              <Skeleton active paragraph={{ rows: 2 }} />
              <div style={{ display: 'flex', gap: 12, marginBottom: 16 }}>
                {[1, 2, 3, 4].map(i => (
                  <div key={i} style={{ flex: 1, minWidth: 180, height: 120, background: '#f5f5f5', borderRadius: 16 }} />
                ))}
              </div>
              <Skeleton active paragraph={{ rows: 6 }} />
            </div>
          ) : beautifulView ? (
            <div className="beautiful-view-wrap">
            {reportTab === 'team' ? (
              <TeamReportView
                metrics={currentMetrics}
                dateRange={[formatDate(dateRange![0]), formatDate(dateRange![1])]}
                sections={currentSections}
                teamEditable={teamEditable}
                onUpdateRisks={(risks) => setTeamEditable(prev => ({ ...prev, risks }))}
                onUpdateSuggestions={(suggestions) => setTeamEditable(prev => ({ ...prev, suggestions }))}
                onUpdateNextPlan={(nextPlan) => setCurrentSections((prev: any) => ({ ...prev, nextPlan }))}
              />
            ) : (
              <PersonalReportView
                metrics={currentMetrics}
                dateRange={[formatDate(dateRange![0]), formatDate(dateRange![1])]}
                sections={currentSections}
                agentName={agents.find(a => a.agentId === selectedAgentId)?.displayName}
                huaweiCloudUnbindInput={huaweiCloudUnbindInput}
                manualOpportunityInput={manualOpportunityInput}
                onUpdateOtherWork={(text) => setCurrentSections((prev: any) => ({ ...prev, otherWork: text }))}
                onUpdateNextPlan={(text) => setCurrentSections((prev: any) => ({ ...prev, nextPlan: text }))}
              />
            )}
            </div>
          ) : (
            <>
              {/* 闭环质量 */}
              {renderMetricsSection(currentMetrics, isPersonal)}
              {/* 业务承接 */}
              {renderWorkloadSection(currentMetrics, isPersonal)}
              {/* 四、高频问题TOP5（仅团队周报展示） */}
              {!isPersonal && <TopQuestionsSection questions={editableState.topQuestions} />}
            </>
          )}
        </div>{/* 左侧主内容区结束 */}
        {!beautifulView && !loading && (
          <div style={{
            width: 140,
            flexShrink: 0,
            position: 'sticky' as const,
            top: 80,
            alignSelf: 'flex-start',
            background: 'rgba(255,255,255,0.9)',
            backdropFilter: 'blur(12px)',
            borderRadius: 12,
            padding: '12px 0',
            border: '1px solid rgba(0,0,0,0.06)',
            maxHeight: 'calc(100vh - 120px)',
            overflowY: 'auto' as const,
          }}>
            <div style={{ fontSize: 11, fontWeight: 600, color: '#94a3b8', padding: '0 16px 8px', textTransform: 'uppercase', letterSpacing: 1 }}>
              目录导航
            </div>
            {[
              { key: 'quality', label: '闭环质量', icon: '📊' },
              { key: 'experience', label: '体验与响应', icon: '💡' },
              { key: 'workload', label: '业务承接', icon: '📋' },
              { key: 'topquestions', label: '高频问题', icon: '🔥' },
            ].filter(({ key }) => !(key === 'topquestions' && isPersonal)).map(({ key, label, icon }) => (
              <div
                key={key}
                onClick={() => {
                  const el = document.getElementById(`section-${key}`);
                  if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
                }}
                style={{
                  padding: '6px 16px',
                  cursor: 'pointer',
                  fontSize: 13,
                  color: '#475569',
                  transition: 'all 0.15s',
                  borderLeft: '2px solid transparent',
                }}
                onMouseEnter={(e) => { e.currentTarget.style.background = '#f1f5f9'; e.currentTarget.style.color = '#0f172a'; e.currentTarget.style.borderLeftColor = '#1677ff'; }}
                onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = '#475569'; e.currentTarget.style.borderLeftColor = 'transparent'; }}
              >
                {icon} {label}
              </div>
            ))}
          </div>
        )}
      </div>{/* flex 容器结束 */}

      {/* HTML 周报预览弹窗 */}
      {/* SMTP 邮箱配置弹窗 */}
      <Modal
        title="📧 SMTP 邮箱配置"
        open={smtpModalOpen}
        onCancel={() => setSmtpModalOpen(false)}
        footer={null}
        width={480}
        destroyOnClose
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ width: 60, flexShrink: 0, color: '#64748b', fontSize: 12 }}>Host</span>
            <Input size="small" value={smtpConfig.host} placeholder="smtp.qq.com"
              onChange={e => setSmtpConfig({ ...smtpConfig, host: e.target.value })} />
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ width: 60, flexShrink: 0, color: '#64748b', fontSize: 12 }}>端口</span>
            <InputNumber size="small" value={smtpConfig.port} style={{ width: 100 }}
              onChange={v => setSmtpConfig({ ...smtpConfig, port: v ?? 465 })} />
            <span style={{ fontSize: 11, color: '#94a3b8' }}>QQ邮箱用465</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ width: 60, flexShrink: 0, color: '#64748b', fontSize: 12 }}>账号</span>
            <Input size="small" value={smtpConfig.user} placeholder="xxx@qq.com"
              onChange={e => setSmtpConfig({ ...smtpConfig, user: e.target.value })} />
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ width: 60, flexShrink: 0, color: '#64748b', fontSize: 12 }}>授权码</span>
            <Input.Password size="small" value={smtpConfig.pass} placeholder="QQ邮箱授权码（非登录密码）"
              onChange={e => setSmtpConfig({ ...smtpConfig, pass: e.target.value })} />
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ width: 60, flexShrink: 0, color: '#64748b', fontSize: 12 }}>发件人</span>
            <Input size="small" value={smtpConfig.from} placeholder="xxx@qq.com"
              onChange={e => setSmtpConfig({ ...smtpConfig, from: e.target.value })} />
          </div>
          
          <Divider style={{ margin: '4px 0' }} />
          
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ width: 60, flexShrink: 0, color: '#64748b', fontSize: 12 }}>测试收件</span>
            <Input size="small" value={smtpTestTo} placeholder="测试邮件接收地址"
              onChange={e => setSmtpTestTo(e.target.value)} style={{ flex: 1 }} />
            <Button size="small" loading={smtpTestLoading}
              onClick={async () => {
                setSmtpTestLoading(true);
                try {
                  const res = await testSmtpConfig({ ...smtpConfig, to: smtpTestTo });
                  if (res.ok) message.success(res.message);
                  else message.error(res.message);
                } catch (e: any) {
                  message.error('测试失败: ' + (e?.response?.data?.message ?? e?.message ?? '连接错误'));
                } finally { setSmtpTestLoading(false); }
              }}
            >
              测试发送
            </Button>
          </div>
          
          <Button type="primary" block loading={smtpSaveLoading}
            onClick={async () => {
              setSmtpSaveLoading(true);
              try {
                await saveSmtpConfig(smtpConfig);
                message.success('SMTP 配置已保存');
                setSmtpModalOpen(false);
              } catch (e: any) {
                message.error('保存失败: ' + (e?.response?.data?.message ?? e?.message ?? ''));
              } finally { setSmtpSaveLoading(false); }
            }}
          >
            保存配置
          </Button>
        </div>
      </Modal>
    </div>
  );
}
