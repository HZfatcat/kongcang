import { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  AutoComplete,
  Button,
  Card,
  Checkbox,
  Col,
  DatePicker,
  Form,
  Input,
  InputNumber,
  Layout,
  Modal,
  Row,
  Segmented,
  Space,
  Spin,
  Statistic,
  Table,
  Tabs,
  Menu,
  Popconfirm,
  Tag,
  Progress,
  Select,
  Switch,
  Tree,
  Typography,
  message,
} from 'antd';
import type { DataNode } from 'antd/es/tree';
import dayjs from 'dayjs';
import ReactECharts from 'echarts-for-react';
import { fetchConsultationFunnel, fetchDemandOverview } from '../api/kpi';
import {
  deleteOpportunity,
  fetchOpportunityList,
  fetchOpportunitySummary,
  updateOpportunityStatus,
  upsertOpportunity,
} from '../api/opportunity';
import {
  deleteAgent,
  fetchZouwuFeedbackStats,
  fetchAgents,
  fetchSyncConfig,
  fetchSyncIssues,
  fetchSyncProgress,
  fetchSyncRuns,
  fetchSyncSummary,
  fetchUdescDailyAgentStats,
  fetchUdescAgentIds,
  fetchUdescOverview,
  fetchUdescSessions,
  fetchUdescTree,
  retrySyncIssues,
  runSync,
  runZouwuSync,
  updateSyncConfig,
  updateZouwuSyncConfig,
  fetchZouwuSyncConfig,
  upsertAgent,
  fetchWecomEmployees,
  upsertWecomEmployee,
  deleteWecomEmployee,
} from '../api/udesc';
import type {
  AgentProfile,
  WecomEmployee,
  SyncConfig,
  SyncIssue,
  SyncProgress,
  SyncRun,
  SyncSummary,
  UdescDailyAgentStats,
  UdescOverview,
  UdescSessionRecord,
  UdescTreeNode,
  ZouwuFeedbackStatistics,
} from '../types/udesc';
import type { ConsultationFunnelOverview, DemandOverview } from '../types/kpi';
import type { OpportunityRecord, OpportunitySourceType, OpportunityStatus, OpportunitySummary } from '../types/opportunity';
import { clearSession, getLoginUser } from '../auth/session';

const { RangePicker } = DatePicker;

function normalizeMessageContent(raw?: string) {
  if (!raw) {
    return '-';
  }
  try {
    const parsed = JSON.parse(raw) as { data?: { content?: string } };
    if (parsed?.data?.content) {
      return parsed.data.content;
    }
  } catch {
    return raw;
  }
  return raw;
}

function createPresetRange(start: dayjs.Dayjs, end: dayjs.Dayjs): [dayjs.Dayjs, dayjs.Dayjs] {
  return [start.startOf('day'), end.endOf('day')];
}

export function DashboardPage() {
  const disableAuth = import.meta.env.VITE_DISABLE_AUTH === 'true';
  const loginUser = getLoginUser();
  const [activeMenuKey, setActiveMenuKey] = useState<
    'satisfaction' | 'demand' | 'opportunity' | 'sync-udesc' | 'sync-zouwu' | 'agents'
  >('satisfaction');
  const [agentForm] = Form.useForm();
  const [opportunityForm] = Form.useForm();
  const [loading, setLoading] = useState(false);
  const [syncLoading, setSyncLoading] = useState(false);
  const [overview, setOverview] = useState<UdescOverview | null>(null);
  const [demandOverview, setDemandOverview] = useState<DemandOverview | null>(null);
  const [funnelGranularity, setFunnelGranularity] = useState<'day' | 'week' | 'month'>('day');
  const [consultationFunnel, setConsultationFunnel] = useState<ConsultationFunnelOverview | null>(null);
  const [dailyStats, setDailyStats] = useState<UdescDailyAgentStats | null>(null);
  const [selectedAgents, setSelectedAgents] = useState<string[]>(['__summary__']);
  const [selectedMetrics, setSelectedMetrics] = useState<Array<'sessions' | 'messages'>>([
    'sessions',
    'messages',
  ]);
  const [treeData, setTreeData] = useState<UdescTreeNode[]>([]);
  const [sessions, setSessions] = useState<UdescSessionRecord[]>([]);
  const [sessionAgentFilters, setSessionAgentFilters] = useState<string[]>([]);
  const [opportunityLoading, setOpportunityLoading] = useState(false);
  const [opportunitySummary, setOpportunitySummary] = useState<OpportunitySummary | null>(null);
  const [opportunities, setOpportunities] = useState<OpportunityRecord[]>([]);
  const [opportunityTotal, setOpportunityTotal] = useState(0);
  const [opportunityPage, setOpportunityPage] = useState(1);
  const [opportunityPageSize, setOpportunityPageSize] = useState(20);
  const [opportunityStatusFilter, setOpportunityStatusFilter] = useState<string | undefined>(undefined);
  const [opportunitySourceFilter, setOpportunitySourceFilter] = useState<string | undefined>(undefined);
  const [opportunityKeyword, setOpportunityKeyword] = useState('');
  const [opportunityModalOpen, setOpportunityModalOpen] = useState(false);
  const [savingOpportunity, setSavingOpportunity] = useState(false);
  const [editingOpportunityId, setEditingOpportunityId] = useState<string | null>(null);
  const [syncProgress, setSyncProgress] = useState<SyncProgress | null>(null);
  const [syncIssues, setSyncIssues] = useState<SyncIssue[]>([]);
  const [syncRuns, setSyncRuns] = useState<SyncRun[]>([]);
  const [syncSummary, setSyncSummary] = useState<SyncSummary | null>(null);
  const [syncConfig, setSyncConfig] = useState<SyncConfig | null>(null);
  const [syncConfigLoading, setSyncConfigLoading] = useState(false);
  const [retryLoading, setRetryLoading] = useState(false);
  const [zouwuStatsLoading, setZouwuStatsLoading] = useState(false);
  const [zouwuStats, setZouwuStats] = useState<ZouwuFeedbackStatistics | null>(null);
  const [zouwuSyncLoading, setZouwuSyncLoading] = useState(false);
  const [zouwuConfigLoading, setZouwuConfigLoading] = useState(false);
  const [zouwuConfig, setZouwuConfig] = useState<SyncConfig | null>(null);
  const [agents, setAgents] = useState<AgentProfile[]>([]);
  const [agentsLoading, setAgentsLoading] = useState(false);
  const [udescAgentIds, setUdescAgentIds] = useState<string[]>([]);
  const [agentModalOpen, setAgentModalOpen] = useState(false);
  const [savingAgent, setSavingAgent] = useState(false);
  const [editingAgentId, setEditingAgentId] = useState<string | null>(null);
  // 企微人员
  const [wecomEmployees, setWecomEmployees] = useState<WecomEmployee[]>([]);
  const [wecomEmployeesLoading, setWecomEmployeesLoading] = useState(false);
  const [wecomEmployeeModalOpen, setWecomEmployeeModalOpen] = useState(false);
  const [savingWecomEmployee, setSavingWecomEmployee] = useState(false);
  const [editingWecomUserId, setEditingWecomUserId] = useState<string | null>(null);
  const [wecomEmployeeForm] = Form.useForm();
  const [agentsTabKey, setAgentsTabKey] = useState<'udesc' | 'wecom'>('udesc');
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [range, setRange] = useState<[dayjs.Dayjs, dayjs.Dayjs]>(() => {
    const end = dayjs();
    const start = end.subtract(30, 'day');
    return [start.startOf('day'), end.endOf('day')];
  });
  const quickRangePresets = useMemo(
    () => [
      { label: '今天', value: () => createPresetRange(dayjs(), dayjs()) },
      { label: '昨天', value: () => createPresetRange(dayjs().subtract(1, 'day'), dayjs().subtract(1, 'day')) },
      { label: '近7天', value: () => createPresetRange(dayjs().subtract(6, 'day'), dayjs()) },
      { label: '近30天', value: () => createPresetRange(dayjs().subtract(29, 'day'), dayjs()) },
      { label: '本月', value: () => createPresetRange(dayjs().startOf('month'), dayjs()) },
      {
        label: '上月',
        value: () =>
          createPresetRange(
            dayjs().subtract(1, 'month').startOf('month'),
            dayjs().subtract(1, 'month').endOf('month'),
          ),
      },
    ],
    [],
  );
  const apiRange = useMemo(
    () => ({
      startDateIso: range[0].startOf('day').format('YYYY-MM-DDTHH:mm:ss.SSSZ'),
      endDateIso: range[1].endOf('day').format('YYYY-MM-DDTHH:mm:ss.SSSZ'),
      startDateLocal: range[0].startOf('day').format('YYYY-MM-DD HH:mm:ss'),
      endDateLocal: range[1].endOf('day').format('YYYY-MM-DD HH:mm:ss'),
    }),
    [range],
  );

  const reload = async (
    nextPage?: number,
    nextPageSize?: number,
    nextSessionAgentFilters?: string[],
  ) => {
    const targetPage = nextPage ?? page;
    const targetPageSize = nextPageSize ?? pageSize;
    const targetSessionAgentFilters = nextSessionAgentFilters ?? sessionAgentFilters;
    setLoading(true);
    try {
      const [overviewData, demandData, funnelData, dailyStatsData, treeResp, sessionResp] = await Promise.all([
        fetchUdescOverview({ startDate: apiRange.startDateIso, endDate: apiRange.endDateIso }),
        fetchDemandOverview({ startDate: apiRange.startDateIso, endDate: apiRange.endDateIso }),
        fetchConsultationFunnel({
          startDate: apiRange.startDateIso,
          endDate: apiRange.endDateIso,
          granularity: funnelGranularity,
        }),
        fetchUdescDailyAgentStats({ startDate: apiRange.startDateIso, endDate: apiRange.endDateIso }),
        fetchUdescTree({ startDate: apiRange.startDateIso, endDate: apiRange.endDateIso }),
        fetchUdescSessions({
          startDate: apiRange.startDateIso,
          endDate: apiRange.endDateIso,
          page: targetPage,
          pageSize: targetPageSize,
          agentIds:
            targetSessionAgentFilters.length > 0 ? targetSessionAgentFilters.join(',') : undefined,
        }),
        fetchSyncProgress().then((data) => {
          setSyncProgress(data);
          return data;
        }),
        fetchSyncConfig().then((data) => {
          setSyncConfig(data);
          return data;
        }),
        fetchSyncIssues().then((data) => {
          setSyncIssues(data);
          return data;
        }),
        fetchSyncRuns().then((data) => {
          setSyncRuns(data);
          return data;
        }),
        fetchSyncSummary().then((data) => {
          setSyncSummary(data);
          return data;
        }),
      ]);
      setOverview(overviewData);
      setDemandOverview(demandData);
      setConsultationFunnel(funnelData);
      setDailyStats(dailyStatsData);
      setTreeData(Array.isArray(treeResp) ? treeResp : []);
      setSessions(sessionResp.records);
      setTotal(sessionResp.total);
      setPage(sessionResp.page);
      setPageSize(sessionResp.pageSize);
    } catch (error) {
      message.error('加载数据失败，请检查 API 配置');
    } finally {
      setLoading(false);
    }
  };

  const loadOpportunities = async (nextPage?: number, nextPageSize?: number) => {
    const targetPage = nextPage ?? opportunityPage;
    const targetPageSize = nextPageSize ?? opportunityPageSize;
    setOpportunityLoading(true);
    try {
      const [summaryResp, listResp] = await Promise.all([
        fetchOpportunitySummary({ startDate: apiRange.startDateIso, endDate: apiRange.endDateIso }),
        fetchOpportunityList({
          startDate: apiRange.startDateIso,
          endDate: apiRange.endDateIso,
          status: opportunityStatusFilter,
          sourceType: opportunitySourceFilter,
          keyword: opportunityKeyword || undefined,
          page: targetPage,
          pageSize: targetPageSize,
        }),
      ]);
      setOpportunitySummary(summaryResp);
      setOpportunities(listResp.records);
      setOpportunityTotal(listResp.total);
      setOpportunityPage(listResp.page);
      setOpportunityPageSize(listResp.pageSize);
    } catch {
      message.error('加载商机数据失败');
    } finally {
      setOpportunityLoading(false);
    }
  };

  const loadAgents = async () => {
    setAgentsLoading(true);
    try {
      const data = await fetchAgents();
      setAgents(data);
    } catch {
      message.error('加载人员信息失败');
    } finally {
      setAgentsLoading(false);
    }
  };

  const loadWecomEmployees = async () => {
    setWecomEmployeesLoading(true);
    try {
      const data = await fetchWecomEmployees();
      setWecomEmployees(data);
    } catch {
      message.error('加载企微人员信息失败');
    } finally {
      setWecomEmployeesLoading(false);
    }
  };

  const loadZouwuStats = async () => {
    setZouwuStatsLoading(true);
    try {
      const [data, config, runs] = await Promise.all([
        fetchZouwuFeedbackStats({
          start: apiRange.startDateLocal,
          end: apiRange.endDateLocal,
        }),
        fetchZouwuSyncConfig(),
        fetchSyncRuns(),
      ]);
      setZouwuStats(data);
      setZouwuConfig(config);
      setSyncRuns(runs);
    } catch {
      message.error('加载驺吾同步统计失败');
    } finally {
      setZouwuStatsLoading(false);
    }
  };

  const saveZouwuConfig = async (payload: { enabled?: boolean; intervalHours?: number }) => {
    setZouwuConfigLoading(true);
    try {
      const data = await updateZouwuSyncConfig(payload);
      setZouwuConfig(data);
      message.success('驺吾定时同步配置已更新');
    } catch {
      message.error('更新驺吾定时配置失败');
    } finally {
      setZouwuConfigLoading(false);
    }
  };

  const saveSyncConfig = async (payload: { enabled?: boolean; intervalHours?: number }) => {
    setSyncConfigLoading(true);
    try {
      const data = await updateSyncConfig(payload);
      setSyncConfig(data);
      message.success('定时同步配置已更新');
    } catch {
      message.error('更新定时同步配置失败');
    } finally {
      setSyncConfigLoading(false);
    }
  };

  const loadUdescAgentIds = async () => {
    try {
      const ids = await fetchUdescAgentIds();
      setUdescAgentIds(ids);
    } catch {
      message.error('加载 Udesk 人员ID失败');
    }
  };

  useEffect(() => {
    void reload();
  }, [apiRange.startDateIso, apiRange.endDateIso, funnelGranularity]);

  useEffect(() => {
    if (activeMenuKey === 'opportunity') {
      void loadOpportunities(1, opportunityPageSize);
    }
  }, [apiRange.startDateIso, apiRange.endDateIso, activeMenuKey]);

  useEffect(() => {
    const timer = setInterval(() => {
      void fetchSyncProgress()
        .then((data) => {
          setSyncProgress(data);
        })
        .catch(() => undefined);
    }, 5000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    void loadAgents();
  }, []);

  useEffect(() => {
    if (activeMenuKey === 'agents') {
      void loadAgents();
      void loadUdescAgentIds();
      void loadWecomEmployees();
    }
  }, [activeMenuKey]);

  useEffect(() => {
    if (activeMenuKey === 'sync-zouwu') {
      void loadZouwuStats();
    }
  }, [activeMenuKey, apiRange.startDateIso, apiRange.endDateIso]);

  const agentProfileMap = useMemo(() => {
    return new Map(agents.map((item) => [item.agentId, item]));
  }, [agents]);

  const getAgentLabel = (agentId?: string | null) => {
    if (!agentId) {
      return '未分配客服';
    }
    const profile = agentProfileMap.get(agentId);
    if (!profile) {
      return agentId;
    }
    return `${profile.displayName} (${agentId})`;
  };

  const sessionColumns = useMemo(
    () => [
      {
        title: '客服',
        dataIndex: 'agentId',
        key: 'agentId',
        filters: Array.from(new Set(treeData.map((item) => item.agentId))).map((agentId) => ({
          text: getAgentLabel(agentId),
          value: agentId,
        })),
        filteredValue: sessionAgentFilters.length > 0 ? sessionAgentFilters : null,
        filterMultiple: true,
        render: (value?: string) => getAgentLabel(value),
      },
      {
        title: '咨询开始',
        dataIndex: 'startedAt',
        key: 'startedAt',
        render: (value: string) => dayjs(value).format('YYYY-MM-DD HH:mm:ss'),
      },
      {
        title: '咨询结束',
        dataIndex: 'endedAt',
        key: 'endedAt',
        render: (value?: string) => (value ? dayjs(value).format('YYYY-MM-DD HH:mm:ss') : '-'),
      },
      {
        title: '满意度',
        dataIndex: 'rating',
        key: 'rating',
        render: (value: number | null) => (value === null ? '-' : value),
      },
      {
        title: '消息数',
        dataIndex: 'messageCount',
        key: 'messageCount',
      },
      {
        title: '操作',
        key: 'actions',
        render: (_: unknown, record: UdescSessionRecord) => (
          <Button
            size="small"
            onClick={() => {
              setEditingOpportunityId(null);
              opportunityForm.resetFields();
              opportunityForm.setFieldsValue({
                sourceType: 'CONSULTATION',
                sourceSessionId: record.id,
                agentId: record.agentId,
                title: `咨询会话商机-${record.id}`,
                status: 'NEW',
              });
              setOpportunityModalOpen(true);
            }}
          >
            转商机
          </Button>
        ),
      },
    ],
    [agentProfileMap, treeData, sessionAgentFilters],
  );

  const treeNodes: DataNode[] = [...treeData]
    .sort((a, b) => b.sessionCount - a.sessionCount)
    .map((agent) => {
      const totalMessages = agent.sessions.reduce((sum, session) => sum + session.messageCount, 0);
      const avgMessagesPerSession =
        agent.sessionCount > 0 ? Number((totalMessages / agent.sessionCount).toFixed(2)) : 0;

      return {
        key: agent.agentId,
        title: `${getAgentLabel(agent.agentId)}（咨询 ${agent.sessionCount}，平均评分 ${agent.avgRating ?? '-'}，平均消息数 ${avgMessagesPerSession}）`,
        children: agent.sessions.slice(0, 50).map((session) => ({
          key: `${agent.agentId}-${session.id}`,
          title: `会话 ${session.id} | ${dayjs(session.startedAt).format('MM-DD HH:mm')} | 评分 ${session.rating ?? '-'} | 消息 ${session.messageCount}`,
          isLeaf: true,
        })),
      };
    });

  const progressPercent = syncProgress
    ? syncProgress.totalWindows > 0
      ? Math.min(100, Math.round((syncProgress.processedWindows / syncProgress.totalWindows) * 100))
      : 0
    : 0;

  const summarySeries = useMemo(() => {
    if (!dailyStats) {
      return null;
    }
    const sessions = dailyStats.days.map((_, idx) =>
      dailyStats.series.reduce((sum, agent) => sum + (agent.sessions[idx] ?? 0), 0),
    );
    const messages = dailyStats.days.map((_, idx) =>
      dailyStats.series.reduce((sum, agent) => sum + (agent.messages[idx] ?? 0), 0),
    );
    return {
      agentId: '__summary__',
      label: '汇总',
      sessions,
      messages,
    };
  }, [dailyStats]);

  const agentOptions = useMemo(() => {
    if (!dailyStats) {
      return [{ label: '汇总', value: '__summary__' }];
    }
    return [
      { label: '汇总', value: '__summary__' },
      ...dailyStats.series.map((item) => ({
        label: getAgentLabel(item.agentId),
        value: item.agentId,
      })),
    ];
  }, [dailyStats, agentProfileMap]);

  const selectedStatsSummary = useMemo(() => {
    if (!dailyStats || !summarySeries) {
      return {
        totalSessions: 0,
        totalMessages: 0,
        avgMessagesPerSession: 0,
      };
    }

    const hasSummary = selectedAgents.includes('__summary__');
    const selectedAgentSeries = dailyStats.series.filter((item) => selectedAgents.includes(item.agentId));

    const sessionTotal = hasSummary
      ? summarySeries.sessions.reduce((sum, value) => sum + value, 0)
      : selectedAgentSeries.reduce(
          (sum, item) => sum + item.sessions.reduce((innerSum, value) => innerSum + value, 0),
          0,
        );
    const messageTotal = hasSummary
      ? summarySeries.messages.reduce((sum, value) => sum + value, 0)
      : selectedAgentSeries.reduce(
          (sum, item) => sum + item.messages.reduce((innerSum, value) => innerSum + value, 0),
          0,
        );

    return {
      totalSessions: sessionTotal,
      totalMessages: messageTotal,
      avgMessagesPerSession: sessionTotal > 0 ? Number((messageTotal / sessionTotal).toFixed(2)) : 0,
    };
  }, [dailyStats, selectedAgents, summarySeries]);

  const trendOption = useMemo(() => {
    if (!dailyStats) {
      return {
        xAxis: { type: 'category', data: [] as string[] },
        yAxis: { type: 'value' },
        series: [],
      };
    }

    return {
      tooltip: { trigger: 'axis' },
      legend: { type: 'scroll' },
      grid: { left: 56, right: 72, top: 50, bottom: 40, containLabel: true },
      xAxis: {
        type: 'category',
        data: dailyStats.days,
      },
      yAxis: [
        {
          type: 'value',
          name: '咨询量',
          minInterval: 1,
        },
        {
          type: 'value',
          name: '消息数',
          minInterval: 1,
        },
      ],
      series: [
        ...(summarySeries && selectedAgents.includes('__summary__')
          ? [
              ...(selectedMetrics.includes('sessions')
                ? [
                    {
                      name: '汇总-咨询量',
                      type: 'line',
                      smooth: true,
                      yAxisIndex: 0,
                      data: summarySeries.sessions,
                    },
                  ]
                : []),
              ...(selectedMetrics.includes('messages')
                ? [
                    {
                      name: '汇总-消息数',
                      type: 'line',
                      smooth: true,
                      yAxisIndex: 1,
                      data: summarySeries.messages,
                    },
                  ]
                : []),
            ]
          : []),
        ...dailyStats.series
          .filter((item) => selectedAgents.includes(item.agentId))
          .flatMap((item) => [
            ...(selectedMetrics.includes('sessions')
              ? [
                  {
                      name: `${getAgentLabel(item.agentId)}-咨询量`,
                    type: 'line',
                    smooth: true,
                    yAxisIndex: 0,
                    data: item.sessions,
                  },
                ]
              : []),
            ...(selectedMetrics.includes('messages')
              ? [
                  {
                      name: `${getAgentLabel(item.agentId)}-消息数`,
                    type: 'line',
                    smooth: true,
                    yAxisIndex: 1,
                    data: item.messages,
                  },
                ]
              : []),
          ]),
      ],
    };
  }, [dailyStats, selectedAgents, selectedMetrics, summarySeries, agentProfileMap]);

  const latestFunnelPeriod = useMemo(() => {
    if (!consultationFunnel || consultationFunnel.periods.length === 0) {
      return null;
    }
    return consultationFunnel.periods[consultationFunnel.periods.length - 1];
  }, [consultationFunnel]);

  const funnelChartOption = useMemo(() => {
    if (!latestFunnelPeriod) {
      return { series: [] };
    }
    return {
      tooltip: { trigger: 'item' },
      series: [
        {
          type: 'funnel',
          left: '10%',
          width: '80%',
          sort: 'descending',
          gap: 4,
          label: { show: true, position: 'inside' },
          data: [
            { name: '咨询量', value: latestFunnelPeriod.consultationCount },
            { name: '问题咨询', value: latestFunnelPeriod.issueConsultCount },
            { name: '问题反馈', value: latestFunnelPeriod.feedbackCount },
            { name: '识别需求/Bug', value: latestFunnelPeriod.requirementIdentifiedCount },
            { name: '已完成需求/Bug', value: latestFunnelPeriod.requirementCompletedCount },
            { name: '需求/Bug上线量', value: latestFunnelPeriod.releaseCount },
          ],
        },
      ],
    };
  }, [latestFunnelPeriod]);

  const satisfactionTab = (
    <>
      <Row gutter={16}>
        <Col span={4}>
          <Card style={{ height: 120 }}>
            <Statistic title="咨询总量" value={selectedStatsSummary.totalSessions} />
          </Card>
        </Col>
        <Col span={5}>
          <Card style={{ height: 120 }}>
            <Statistic title="消息总量" value={selectedStatsSummary.totalMessages} />
          </Card>
        </Col>
        <Col span={5}>
          <Card style={{ height: 120 }}>
            <Statistic title="平均消息数" value={selectedStatsSummary.avgMessagesPerSession} />
          </Card>
        </Col>
        <Col span={4}>
          <Card style={{ height: 120 }}>
            <Statistic title="客服人数" value={overview?.agentCount ?? 0} />
          </Card>
        </Col>
        <Col span={3}>
          <Card style={{ height: 120 }}>
            <Statistic title="已评分咨询" value={overview?.ratedCount ?? 0} />
          </Card>
        </Col>
        <Col span={3}>
          <Card style={{ height: 120 }}>
            <Statistic title="平均满意度" value={Number((overview?.avgRating ?? 0).toFixed(2))} />
          </Card>
        </Col>
      </Row>

      <Row gutter={16} style={{ marginTop: 16 }}>
        <Col span={24}>
          <Card title="客服每日趋势曲线（咨询量 + 消息数）">
            <Space direction="vertical" style={{ width: '100%', marginBottom: 12 }}>
              <div>
                <Typography.Text strong>人员筛选：</Typography.Text>
                <Checkbox.Group
                  options={agentOptions}
                  value={selectedAgents}
                  onChange={(values) => {
                    setSelectedAgents(values as string[]);
                  }}
                  style={{ marginLeft: 8 }}
                />
              </div>
              <div>
                <Typography.Text strong>指标筛选：</Typography.Text>
                <Checkbox.Group
                  options={[
                    { label: '咨询量', value: 'sessions' },
                    { label: '消息数', value: 'messages' },
                  ]}
                  value={selectedMetrics}
                  onChange={(values) => {
                    setSelectedMetrics(values as Array<'sessions' | 'messages'>);
                  }}
                  style={{ marginLeft: 8 }}
                />
              </div>
            </Space>
            <ReactECharts option={trendOption} style={{ height: 340 }} />
          </Card>
        </Col>
      </Row>

      <Row gutter={16} style={{ marginTop: 16 }}>
        <Col span={24}>
          <Card
            title="咨询状态漏斗（咨询 -> 问题 -> 反馈 -> 需求/Bug处理）"
            extra={
              <Segmented
                value={funnelGranularity}
                onChange={(value) => {
                  setFunnelGranularity(value as 'day' | 'week' | 'month');
                }}
                options={[
                  { label: '每天', value: 'day' },
                  { label: '每周', value: 'week' },
                  { label: '每月', value: 'month' },
                ]}
              />
            }
          >
            <Typography.Text type="secondary">
              当前展示周期：{latestFunnelPeriod?.periodLabel ?? '-'}
            </Typography.Text>
            <ReactECharts option={funnelChartOption} style={{ height: 360, marginTop: 8 }} />
            <Table
              rowKey="periodStart"
              size="small"
              style={{ marginTop: 8 }}
              pagination={{ pageSize: 10 }}
              dataSource={consultationFunnel?.periods ?? []}
              columns={[
                { title: '周期', dataIndex: 'periodLabel', key: 'periodLabel' },
                { title: '咨询量', dataIndex: 'consultationCount', key: 'consultationCount' },
                { title: '问题咨询', dataIndex: 'issueConsultCount', key: 'issueConsultCount' },
                { title: '问题反馈', dataIndex: 'feedbackCount', key: 'feedbackCount' },
                {
                  title: '识别需求/Bug',
                  dataIndex: 'requirementIdentifiedCount',
                  key: 'requirementIdentifiedCount',
                },
                {
                  title: '已完成需求/Bug',
                  dataIndex: 'requirementCompletedCount',
                  key: 'requirementCompletedCount',
                },
                { title: '需求/Bug上线量', dataIndex: 'releaseCount', key: 'releaseCount' },
              ]}
            />
          </Card>
        </Col>
      </Row>

      <Row gutter={16} style={{ marginTop: 16 }}>
        <Col span={10}>
          <Card title="客服业务树（客服 -> 咨询会话）" styles={{ body: { maxHeight: 560, overflowY: 'auto' } }}>
            <Tree treeData={treeNodes} />
          </Card>
        </Col>
        <Col span={14}>
          <Card title="咨询详情（结构化）">
            <Space wrap style={{ marginBottom: 12 }}>
              <Tag
                color={sessionAgentFilters.length === 0 ? 'processing' : 'default'}
                style={{ cursor: 'pointer' }}
                onClick={() => {
                  setSessionAgentFilters([]);
                  setPage(1);
                  void reload(1, pageSize, []);
                }}
              >
                全部客服
              </Tag>
              {(overview?.topAgents ?? []).map((agent) => (
                <Tag
                  key={agent.agentId}
                  color={
                    sessionAgentFilters.length === 1 && sessionAgentFilters[0] === agent.agentId
                      ? 'processing'
                      : 'default'
                  }
                  style={{ cursor: 'pointer' }}
                  onClick={() => {
                    const nextFilters =
                      sessionAgentFilters.length === 1 && sessionAgentFilters[0] === agent.agentId
                        ? []
                        : [agent.agentId];
                    setSessionAgentFilters(nextFilters);
                    setPage(1);
                    void reload(1, pageSize, nextFilters);
                  }}
                >
                  {getAgentLabel(agent.agentId)}: {agent.sessions}
                </Tag>
              ))}
            </Space>
            <Table
              rowKey="id"
              dataSource={sessions}
              columns={sessionColumns}
              onChange={(pagination, filters) => {
                const agentIds = ((filters.agentId as string[] | null) ?? []).filter(Boolean);
                setSessionAgentFilters(agentIds);
                void reload(pagination.current ?? 1, pagination.pageSize ?? pageSize, agentIds);
              }}
              pagination={{
                current: page,
                pageSize,
                total,
                onChange: (nextPageNumber, nextPageSizeNumber) => {
                  void reload(nextPageNumber, nextPageSizeNumber, sessionAgentFilters);
                },
              }}
              expandable={{
                expandedRowRender: (record) => (
                  <div>
                    {record.messages.length === 0 && <Typography.Text type="secondary">无本地消息明细</Typography.Text>}
                    {record.messages.map((msg) => (
                      <div key={msg.id} style={{ marginBottom: 8 }}>
                        <Tag color="blue">{msg.senderType ?? 'unknown'}</Tag>
                        <Typography.Text type="secondary">
                          {dayjs(msg.sentAt).format('YYYY-MM-DD HH:mm:ss')}
                        </Typography.Text>
                        <div>{normalizeMessageContent(msg.content)}</div>
                      </div>
                    ))}
                  </div>
                ),
              }}
            />
          </Card>
        </Col>
      </Row>
    </>
  );

  const demandTrendOption = useMemo(() => {
    const days = demandOverview?.daily.days ?? [];
    const created = demandOverview?.daily.created ?? [];
    const completed = demandOverview?.daily.completed ?? [];
    return {
      tooltip: { trigger: 'axis' },
      legend: { data: ['识别需求数', '完成需求数'] },
      grid: { left: 56, right: 24, top: 40, bottom: 40, containLabel: true },
      xAxis: { type: 'category', data: days },
      yAxis: { type: 'value', minInterval: 1 },
      series: [
        { name: '识别需求数', type: 'line', smooth: true, data: created },
        { name: '完成需求数', type: 'line', smooth: true, data: completed },
      ],
    };
  }, [demandOverview]);

  const demandMonthlyRows = useMemo(() => {
    return (demandOverview?.monthlyRequirement ?? []).slice().reverse();
  }, [demandOverview]);

  const bugMonthlyRows = useMemo(() => {
    return (demandOverview?.monthlyBug ?? []).slice().reverse();
  }, [demandOverview]);

  // 需求明细数据
  const requirementList = useMemo(() => {
    return (demandOverview?.recentRequirements ?? []).filter(
      (r) => r.issueType !== 1
    );
  }, [demandOverview]);

  // Bug明细数据
  const bugList = useMemo(() => {
    return (demandOverview?.recentRequirements ?? []).filter(
      (r) => r.issueType === 1
    );
  }, [demandOverview]);

  // 需求明细表格列定义（支持排序和筛选）
  const requirementColumns = [
    { 
      title: 'ID', 
      dataIndex: 'id', 
      key: 'id',
      sorter: (a: { id: string }, b: { id: string }) => a.id.localeCompare(b.id),
    },
    {
      title: '标题',
      dataIndex: 'title',
      key: 'title',
      sorter: (a: { title: string }, b: { title: string }) => a.title.localeCompare(b.title),
      render: (title: string, record: { id: string }) => (
        <a href={`https://zouwu.gitcode.com/requirements/requirement/detail/${record.id}`} target="_blank" rel="noopener noreferrer">
          {title}
        </a>
      ),
    },
    { 
      title: '状态', 
      dataIndex: 'status', 
      key: 'status',
      filters: [...new Set(requirementList.map(r => r.status))].map(s => ({ text: s, value: s })),
      onFilter: (value: unknown, record: { status: string }) => record.status === value,
      sorter: (a: { status: string }, b: { status: string }) => a.status.localeCompare(b.status),
    },
    {
      title: '来源会话',
      dataIndex: 'sourceSessionId',
      key: 'sourceSessionId',
      render: (value?: string) => value ?? '-',
    },
    {
      title: '创建时间',
      dataIndex: 'createdAtSource',
      key: 'createdAtSource',
      sorter: (a: { createdAtSource: string }, b: { createdAtSource: string }) => 
        new Date(a.createdAtSource).getTime() - new Date(b.createdAtSource).getTime(),
      render: (value: string) => dayjs(value).format('YYYY-MM-DD HH:mm:ss'),
    },
    {
      title: '完成时间',
      dataIndex: 'completedAtSource',
      key: 'completedAtSource',
      sorter: (a: { completedAtSource?: string }, b: { completedAtSource?: string }) => {
        const aTime = a.completedAtSource ? new Date(a.completedAtSource).getTime() : 0;
        const bTime = b.completedAtSource ? new Date(b.completedAtSource).getTime() : 0;
        return aTime - bTime;
      },
      render: (value?: string) => (value ? dayjs(value).format('YYYY-MM-DD HH:mm:ss') : '-'),
    },
  ];

  // Bug明细表格列定义
  const bugColumns = [
    { 
      title: 'ID', 
      dataIndex: 'id', 
      key: 'id',
      sorter: (a: { id: string }, b: { id: string }) => a.id.localeCompare(b.id),
    },
    {
      title: '标题',
      dataIndex: 'title',
      key: 'title',
      sorter: (a: { title: string }, b: { title: string }) => a.title.localeCompare(b.title),
      render: (title: string, record: { id: string }) => (
        <a href={`https://zouwu.gitcode.com/requirements/requirement/detail/${record.id}`} target="_blank" rel="noopener noreferrer">
          {title}
        </a>
      ),
    },
    { 
      title: '状态', 
      dataIndex: 'status', 
      key: 'status',
      filters: [...new Set(bugList.map(r => r.status))].map(s => ({ text: s, value: s })),
      onFilter: (value: unknown, record: { status: string }) => record.status === value,
      sorter: (a: { status: string }, b: { status: string }) => a.status.localeCompare(b.status),
    },
    {
      title: '来源会话',
      dataIndex: 'sourceSessionId',
      key: 'sourceSessionId',
      render: (value?: string) => value ?? '-',
    },
    {
      title: '创建时间',
      dataIndex: 'createdAtSource',
      key: 'createdAtSource',
      sorter: (a: { createdAtSource: string }, b: { createdAtSource: string }) => 
        new Date(a.createdAtSource).getTime() - new Date(b.createdAtSource).getTime(),
      render: (value: string) => dayjs(value).format('YYYY-MM-DD HH:mm:ss'),
    },
    {
      title: '完成时间',
      dataIndex: 'completedAtSource',
      key: 'completedAtSource',
      sorter: (a: { completedAtSource?: string }, b: { completedAtSource?: string }) => {
        const aTime = a.completedAtSource ? new Date(a.completedAtSource).getTime() : 0;
        const bTime = b.completedAtSource ? new Date(b.completedAtSource).getTime() : 0;
        return aTime - bTime;
      },
      render: (value?: string) => (value ? dayjs(value).format('YYYY-MM-DD HH:mm:ss') : '-'),
    },
  ];

  // 需求Tab内容
  const requirementTabContent = (
    <>
      <Row gutter={16}>
        <Col span={8}>
          <Card style={{ height: 120 }}>
            <Statistic title="识别需求总数" value={demandOverview?.totalIdentifiedCount ?? 0} />
          </Card>
        </Col>
        <Col span={8}>
          <Card style={{ height: 120 }}>
            <Statistic title="已完成需求数" value={demandOverview?.completedCount ?? 0} />
          </Card>
        </Col>
        <Col span={8}>
          <Card style={{ height: 120 }}>
            <Statistic
              title="需求完成率"
              value={Number(((demandOverview?.completionRate ?? 0) * 100).toFixed(2))}
              suffix="%"
            />
          </Card>
        </Col>
      </Row>
      <Row gutter={16} style={{ marginTop: 16 }}>
        <Col span={16}>
          <Card title="需求识别与完成趋势">
            <ReactECharts option={demandTrendOption} style={{ height: 320 }} />
          </Card>
        </Col>
        <Col span={8}>
          <Card title="需求状态分布">
            <Space direction="vertical" style={{ width: '100%' }}>
              {Object.entries(demandOverview?.statusBreakdown ?? {})
                .filter(([status]) => {
                  // 只显示需求的状态（排除Bug状态）
                  const reqStatuses = requirementList.map(r => r.status);
                  return reqStatuses.includes(status);
                })
                .map(([status, count]) => (
                  <Row key={status} justify="space-between">
                    <Typography.Text>{status}</Typography.Text>
                    <Typography.Text strong>{count}</Typography.Text>
                  </Row>
                ))}
              <Typography.Text type="secondary">
                关联咨询会话需求数：{demandOverview?.linkedSessionCount ?? 0}
              </Typography.Text>
            </Space>
          </Card>
        </Col>
      </Row>
      <Card title="需求明细" style={{ marginTop: 16 }}>
        <Table
          rowKey="id"
          dataSource={requirementList}
          size="small"
          pagination={{ pageSize: 20, showSizeChanger: true, showTotal: (total) => `共 ${total} 条` }}
          columns={requirementColumns}
        />
      </Card>
      <Card title="按月需求完成率" style={{ marginTop: 16 }}>
        <Table
          rowKey="month"
          dataSource={demandMonthlyRows}
          pagination={false}
          size="small"
          columns={[
            { title: '月份', dataIndex: 'month', key: 'month', sorter: true },
            { title: '识别需求数', dataIndex: 'created', key: 'created', sorter: true },
            { title: '完成需求数', dataIndex: 'completed', key: 'completed', sorter: true },
            {
              title: '完成率',
              dataIndex: 'completionRate',
              key: 'completionRate',
              sorter: true,
              render: (value: number) => `${(value * 100).toFixed(2)}%`,
            },
          ]}
        />
      </Card>
    </>
  );

  // Bug Tab内容
  const bugTabContent = (
    <>
      <Row gutter={16}>
        <Col span={8}>
          <Card style={{ height: 120 }}>
            <Statistic title="识别 Bug 总数" value={demandOverview?.bugCount ?? 0} />
          </Card>
        </Col>
        <Col span={8}>
          <Card style={{ height: 120 }}>
            <Statistic title="已完成 Bug 数" value={demandOverview?.bugCompletedCount ?? 0} />
          </Card>
        </Col>
        <Col span={8}>
          <Card style={{ height: 120 }}>
            <Statistic
              title="Bug 完成率"
              value={Number(((demandOverview?.bugCompletionRate ?? 0) * 100).toFixed(2))}
              suffix="%"
            />
          </Card>
        </Col>
      </Row>
      <Card title="Bug 明细" style={{ marginTop: 16 }}>
        <Table
          rowKey="id"
          dataSource={bugList}
          size="small"
          pagination={{ pageSize: 20, showSizeChanger: true, showTotal: (total) => `共 ${total} 条` }}
          columns={bugColumns}
        />
      </Card>
      <Card title="按月 Bug 完成率" style={{ marginTop: 16 }}>
        <Table
          rowKey="month"
          dataSource={bugMonthlyRows}
          pagination={false}
          size="small"
          columns={[
            { title: '月份', dataIndex: 'month', key: 'month', sorter: true },
            { title: '识别 Bug 数', dataIndex: 'created', key: 'created', sorter: true },
            { title: '完成 Bug 数', dataIndex: 'completed', key: 'completed', sorter: true },
            {
              title: '完成率',
              dataIndex: 'completionRate',
              key: 'completionRate',
              sorter: true,
              render: (value: number) => `${(value * 100).toFixed(2)}%`,
            },
          ]}
        />
      </Card>
    </>
  );

  // 需求主Tab（包含需求和Bug两个子Tab）
  const demandTab = (
    <Tabs defaultActiveKey="requirement" items={[
      { key: 'requirement', label: '需求', children: requirementTabContent },
      { key: 'bug', label: 'Bug', children: bugTabContent },
    ]} />
  );

  const opportunityTab = (
    <>
      <Row gutter={16}>
        <Col span={4}>
          <Card style={{ height: 120 }}>
            <Statistic title="商机总数" value={opportunitySummary?.total ?? 0} />
          </Card>
        </Col>
        <Col span={4}>
          <Card style={{ height: 120 }}>
            <Statistic title="赢单数" value={opportunitySummary?.won ?? 0} />
          </Card>
        </Col>
        <Col span={4}>
          <Card style={{ height: 120 }}>
            <Statistic title="输单数" value={opportunitySummary?.lost ?? 0} />
          </Card>
        </Col>
        <Col span={4}>
          <Card style={{ height: 120 }}>
            <Statistic
              title="赢单率"
              value={Number(((opportunitySummary?.winRate ?? 0) * 100).toFixed(2))}
              suffix="%"
            />
          </Card>
        </Col>
        <Col span={4}>
          <Card style={{ height: 120 }}>
            <Statistic title="咨询链路商机" value={opportunitySummary?.consultingLinked ?? 0} />
          </Card>
        </Col>
        <Col span={4}>
          <Card style={{ height: 120 }}>
            <Statistic title="手工录入商机" value={opportunitySummary?.manualCreated ?? 0} />
          </Card>
        </Col>
      </Row>

      <Card style={{ marginTop: 16 }}>
        <Space wrap>
          <Input
            allowClear
            placeholder="关键词（标题/客户）"
            value={opportunityKeyword}
            onChange={(e) => setOpportunityKeyword(e.target.value)}
            style={{ width: 240 }}
          />
          <Select
            allowClear
            placeholder="状态"
            value={opportunityStatusFilter}
            onChange={(value) => setOpportunityStatusFilter(value)}
            style={{ width: 160 }}
            options={[
              { label: '新建', value: 'NEW' },
              { label: '已甄别', value: 'QUALIFIED' },
              { label: '跟进中', value: 'FOLLOWING' },
              { label: '赢单', value: 'WON' },
              { label: '输单', value: 'LOST' },
            ]}
          />
          <Select
            allowClear
            placeholder="来源"
            value={opportunitySourceFilter}
            onChange={(value) => setOpportunitySourceFilter(value)}
            style={{ width: 160 }}
            options={[
              { label: '咨询转商机', value: 'CONSULTATION' },
              { label: '手工录入', value: 'MANUAL' },
            ]}
          />
          <Button onClick={() => void loadOpportunities(1, opportunityPageSize)}>查询</Button>
          <Button
            type="primary"
            onClick={() => {
              setEditingOpportunityId(null);
              opportunityForm.resetFields();
              opportunityForm.setFieldsValue({ sourceType: 'MANUAL', status: 'NEW' });
              setOpportunityModalOpen(true);
            }}
          >
            新增商机
          </Button>
        </Space>
      </Card>

      <Card title="商机闭环列表" style={{ marginTop: 16 }}>
        <Table
          rowKey="id"
          loading={opportunityLoading}
          dataSource={opportunities}
          columns={[
            { title: '标题', dataIndex: 'title', key: 'title' },
            { title: '来源', dataIndex: 'sourceType', key: 'sourceType' },
            { title: '关联会话', dataIndex: 'sourceSessionId', key: 'sourceSessionId', render: (value?: string) => value ?? '-' },
            { title: '客服', dataIndex: 'agentId', key: 'agentId', render: (value?: string) => getAgentLabel(value) },
            { title: '客户', dataIndex: 'customerName', key: 'customerName', render: (value?: string) => value ?? '-' },
            {
              title: '状态',
              dataIndex: 'status',
              key: 'status',
              render: (value: OpportunityStatus, record: OpportunityRecord) => (
                <Select
                  value={value}
                  style={{ width: 140 }}
                  options={[
                    { label: '新建', value: 'NEW' },
                    { label: '已甄别', value: 'QUALIFIED' },
                    { label: '跟进中', value: 'FOLLOWING' },
                    { label: '赢单', value: 'WON' },
                    { label: '输单', value: 'LOST' },
                  ]}
                  onChange={async (nextStatus) => {
                    await updateOpportunityStatus(record.id, { status: nextStatus });
                    message.success('商机状态已更新');
                    await loadOpportunities(opportunityPage, opportunityPageSize);
                  }}
                />
              ),
            },
            {
              title: '估算金额',
              dataIndex: 'estimatedAmount',
              key: 'estimatedAmount',
              render: (value?: number) => (value === undefined ? '-' : value),
            },
            {
              title: '更新时间',
              dataIndex: 'updatedAt',
              key: 'updatedAt',
              render: (value: string) => dayjs(value).format('YYYY-MM-DD HH:mm:ss'),
            },
            {
              title: '操作',
              key: 'actions',
              render: (_: unknown, record: OpportunityRecord) => (
                <Space>
                  <Button
                    size="small"
                    onClick={() => {
                      setEditingOpportunityId(record.id);
                      opportunityForm.setFieldsValue({
                        ...record,
                        sourceType: record.sourceType as OpportunitySourceType,
                        status: record.status as OpportunityStatus,
                      });
                      setOpportunityModalOpen(true);
                    }}
                  >
                    编辑
                  </Button>
                  <Popconfirm
                    title="确认删除该商机？"
                    onConfirm={async () => {
                      await deleteOpportunity(record.id);
                      message.success('商机已删除');
                      await loadOpportunities(opportunityPage, opportunityPageSize);
                    }}
                  >
                    <Button danger size="small">
                      删除
                    </Button>
                  </Popconfirm>
                </Space>
              ),
            },
          ]}
          pagination={{
            current: opportunityPage,
            pageSize: opportunityPageSize,
            total: opportunityTotal,
            onChange: (nextPageNumber, nextPageSizeNumber) => {
              void loadOpportunities(nextPageNumber, nextPageSizeNumber);
            },
          }}
        />
      </Card>
    </>
  );

  const syncTab = (
    <>
      <Space style={{ marginBottom: 16 }}>
        <Button
          type="primary"
          loading={syncLoading}
          onClick={async () => {
            setSyncLoading(true);
            try {
              const resp = await runSync();
              if (resp.accepted) {
                message.success('已触发同步任务（后台运行）');
              } else {
                message.warning('同步任务已在运行中');
              }
              const [progress, runs, summary] = await Promise.all([
                fetchSyncProgress(),
                fetchSyncRuns(),
                fetchSyncSummary(),
              ]);
              setSyncProgress(progress);
              setSyncRuns(runs);
              setSyncSummary(summary);
            } finally {
              setSyncLoading(false);
            }
          }}
        >
          手动同步
        </Button>
        <Button
          loading={retryLoading}
          onClick={async () => {
            setRetryLoading(true);
            try {
              const resp = await retrySyncIssues();
              if (resp.accepted) {
                message.success(`已触发补偿重试（问题记录 ${resp.issueCount} 条）`);
              } else {
                message.warning(resp.reason === 'no_issues' ? '暂无失败记录可重试' : '同步正在运行中');
              }
              const [progress, issues, runs, summary] = await Promise.all([
                fetchSyncProgress(),
                fetchSyncIssues(),
                fetchSyncRuns(),
                fetchSyncSummary(),
              ]);
              setSyncProgress(progress);
              setSyncIssues(issues);
              setSyncRuns(runs);
              setSyncSummary(summary);
            } finally {
              setRetryLoading(false);
            }
          }}
        >
          失败记录一键补偿重试
        </Button>
      </Space>

      <Card title="同步进度实时面板">
        <Space direction="vertical" style={{ width: '100%' }}>
          <Progress percent={progressPercent} status={syncProgress?.isRunning ? 'active' : 'normal'} />
          <Row gutter={12}>
            <Col span={6}>
              <Statistic title="当前窗口进度" value={`${syncProgress?.processedWindows ?? 0}/${syncProgress?.totalWindows ?? 0}`} />
            </Col>
            <Col span={6}>
              <Statistic title="已同步会话" value={syncProgress?.sessionSynced ?? 0} />
            </Col>
            <Col span={6}>
              <Statistic title="已同步消息" value={syncProgress?.messageSynced ?? 0} />
            </Col>
            <Col span={6}>
              <Statistic title="预计剩余(秒)" value={syncProgress?.estimatedRemainingSeconds ?? 0} />
            </Col>
          </Row>
          <Typography.Text type="secondary">
            当前窗口：{syncProgress?.currentWindowStart ?? '-'} ~ {syncProgress?.currentWindowEnd ?? '-'}
          </Typography.Text>
          <Typography.Text type="secondary">
            预计剩余条数：{syncProgress?.estimatedRemainingRecords ?? 0}，失败记录累计：{syncProgress?.issueCount ?? 0}
          </Typography.Text>
          <Typography.Text type="secondary">
            状态：{syncProgress?.isRunning ? '运行中' : '空闲'} {syncProgress?.note ? `| ${syncProgress.note}` : ''}
          </Typography.Text>
        </Space>
      </Card>

      <Card title="定时任务配置" style={{ marginTop: 16 }}>
        <Space>
          <Typography.Text>开启定时同步</Typography.Text>
          <Switch
            checked={syncConfig?.enabled ?? true}
            onChange={(checked) => {
              void saveSyncConfig({ enabled: checked });
            }}
            loading={syncConfigLoading}
          />
          <Typography.Text>周期（小时）</Typography.Text>
          <InputNumber
            min={1}
            max={168}
            value={syncConfig?.intervalHours ?? 1}
            onChange={(value) => {
              if (!value) {
                return;
              }
              void saveSyncConfig({ intervalHours: Number(value) });
            }}
            disabled={!syncConfig?.enabled}
          />
        </Space>
      </Card>

      <Card title="已同步汇总" style={{ marginTop: 16 }}>
        <Row gutter={12}>
          <Col span={6}>
            <Statistic title="累计会话数" value={syncSummary?.totalSessions ?? 0} />
          </Col>
          <Col span={6}>
            <Statistic title="累计消息数" value={syncSummary?.totalMessages ?? 0} />
          </Col>
          <Col span={6}>
            <Statistic title="累计入库记录" value={syncSummary?.totalRecords ?? 0} />
          </Col>
          <Col span={6}>
            <Statistic title="累计失败记录" value={syncSummary?.issueCount ?? 0} />
          </Col>
        </Row>
        <Space direction="vertical" style={{ marginTop: 12 }}>
          <Typography.Text type="secondary">
            最近成功同步：{syncSummary?.latestSuccessAt ? dayjs(syncSummary.latestSuccessAt).format('YYYY-MM-DD HH:mm:ss') : '-'}
          </Typography.Text>
          <Typography.Text type="secondary">
            同步检查点：{syncSummary?.checkpoint?.cursor ?? '-'}
          </Typography.Text>
          <Typography.Text type="secondary">
            检查点时间：
            {syncSummary?.checkpoint?.lastSyncedAt
              ? dayjs(syncSummary.checkpoint.lastSyncedAt).format('YYYY-MM-DD HH:mm:ss')
              : '-'}
          </Typography.Text>
        </Space>
      </Card>

      <Card title="历史同步记录" style={{ marginTop: 16 }}>
        <Table
          rowKey="id"
          dataSource={syncRuns}
          pagination={false}
          size="small"
          columns={[
            {
              title: '开始时间',
              dataIndex: 'startedAt',
              key: 'startedAt',
              render: (value: string) => dayjs(value).format('YYYY-MM-DD HH:mm:ss'),
            },
            {
              title: '结束时间',
              dataIndex: 'finishedAt',
              key: 'finishedAt',
              render: (value?: string) => (value ? dayjs(value).format('YYYY-MM-DD HH:mm:ss') : '-'),
            },
            { title: '状态', dataIndex: 'status', key: 'status' },
            { title: '同步条数', dataIndex: 'recordsSynced', key: 'recordsSynced' },
            { title: '说明', dataIndex: 'message', key: 'message', render: (value?: string) => value ?? '-' },
          ]}
        />
      </Card>

      <Card title="最近失败记录" style={{ marginTop: 16 }}>
        <Table
          rowKey="id"
          dataSource={syncIssues.slice(0, 50)}
          pagination={false}
          size="small"
          columns={[
            { title: '类别', dataIndex: 'category', key: 'category' },
            {
              title: '失败时间',
              dataIndex: 'createdAt',
              key: 'createdAt',
              render: (value: string) => dayjs(value).format('YYYY-MM-DD HH:mm:ss'),
            },
            { title: '错误', dataIndex: 'errorMessage', key: 'errorMessage' },
          ]}
        />
      </Card>
    </>
  );

  const zouwuSyncTab = (
    <>
      <Space style={{ marginBottom: 16 }}>
        <Button
          type="primary"
          loading={zouwuSyncLoading}
          onClick={async () => {
            setZouwuSyncLoading(true);
            try {
              const resp = await runZouwuSync();
              if (resp.accepted) {
                message.success('已触发驺吾同步任务（后台运行）');
              } else {
                message.warning('驺吾同步任务已在运行中');
              }
              await loadZouwuStats();
              const runs = await fetchSyncRuns();
              setSyncRuns(runs);
            } finally {
              setZouwuSyncLoading(false);
            }
          }}
        >
          手动同步
        </Button>
        <Button loading={zouwuStatsLoading} onClick={() => void loadZouwuStats()}>
          刷新驺吾统计
        </Button>
      </Space>

      <Card title="驺吾定时任务配置" style={{ marginBottom: 16 }}>
        <Space>
          <Typography.Text>开启定时同步</Typography.Text>
          <Switch
            checked={zouwuConfig?.enabled ?? true}
            onChange={(checked) => {
              void saveZouwuConfig({ enabled: checked });
            }}
            loading={zouwuConfigLoading}
          />
          <Typography.Text>周期（小时）</Typography.Text>
          <InputNumber
            min={1}
            max={168}
            value={zouwuConfig?.intervalHours ?? 1}
            onChange={(value) => {
              if (!value) {
                return;
              }
              void saveZouwuConfig({ intervalHours: Number(value) });
            }}
            disabled={!zouwuConfig?.enabled}
          />
        </Space>
      </Card>

      <Card title="驺吾新增统计（按创建时间）" loading={zouwuStatsLoading}>
        <Row gutter={12}>
          <Col span={8}>
            <Statistic title="功能需求新增" value={zouwuStats?.newRequirements ?? 0} />
          </Col>
          <Col span={8}>
            <Statistic title="BUG反馈新增" value={zouwuStats?.newBugs ?? 0} />
          </Col>
          <Col span={8}>
            <Statistic title="长期演进标签ID" value={zouwuStats?.longTermLabelId ?? '-'} />
          </Col>
        </Row>
        <Space direction="vertical" style={{ marginTop: 12 }}>
          <Typography.Text type="secondary">
            统计窗口：{zouwuStats?.startCreatedTime ?? '-'} ~ {zouwuStats?.endCreatedTime ?? '-'}
          </Typography.Text>
          <Typography.Text type="secondary">
            标签：{zouwuStats?.longTermLabelName ?? '-'}
          </Typography.Text>
        </Space>
      </Card>

      <Card title="驺吾关单率" style={{ marginTop: 16 }} loading={zouwuStatsLoading}>
        <Table
          rowKey="scope"
          pagination={false}
          dataSource={zouwuStats?.closeRates ?? []}
          columns={[
            {
              title: '口径',
              dataIndex: 'scope',
              key: 'scope',
              render: (value: 'requirement' | 'bug' | 'all') =>
                value === 'requirement' ? '功能需求' : value === 'bug' ? 'BUG反馈' : '总量',
            },
            { title: '总数', dataIndex: 'total', key: 'total' },
            {
              title: '排除（已采纳且长期演进）',
              dataIndex: 'excludedByLongTermAccepted',
              key: 'excludedByLongTermAccepted',
            },
            { title: '已拒绝+已闭环', dataIndex: 'closedOrRejected', key: 'closedOrRejected' },
            { title: '分母', dataIndex: 'denominator', key: 'denominator' },
            {
              title: '关单率',
              dataIndex: 'closeRate',
              key: 'closeRate',
              render: (value: number | null) => (value === null ? 'N/A' : `${(value * 100).toFixed(2)}%`),
            },
          ]}
        />
      </Card>

      <Card title="驺吾历史同步记录" style={{ marginTop: 16 }}>
        <Table
          rowKey="id"
          dataSource={syncRuns.filter((item) => item.source === 'zouwu')}
          pagination={false}
          size="small"
          columns={[
            {
              title: '开始时间',
              dataIndex: 'startedAt',
              key: 'startedAt',
              render: (value: string) => dayjs(value).format('YYYY-MM-DD HH:mm:ss'),
            },
            {
              title: '结束时间',
              dataIndex: 'finishedAt',
              key: 'finishedAt',
              render: (value?: string) => (value ? dayjs(value).format('YYYY-MM-DD HH:mm:ss') : '-'),
            },
            { title: '状态', dataIndex: 'status', key: 'status' },
            { title: '同步条数', dataIndex: 'recordsSynced', key: 'recordsSynced' },
            { title: '说明', dataIndex: 'message', key: 'message', render: (value?: string) => value ?? '-' },
          ]}
        />
      </Card>
    </>
  );

  const agentsTab = (
    <Card title="人员管理">
      <Tabs
        activeKey={agentsTabKey}
        onChange={(key) => setAgentsTabKey(key as 'udesc' | 'wecom')}
        items={[
          {
            key: 'udesc',
            label: 'Udesc 客服人员',
            children: (
              <>
                <div style={{ marginBottom: 16 }}>
                  <Button
                    type="primary"
                    onClick={() => {
                      setEditingAgentId(null);
                      agentForm.resetFields();
                      agentForm.setFieldsValue({ enabled: true });
                      void loadUdescAgentIds();
                      setAgentModalOpen(true);
                    }}
                  >
                    新增人员
                  </Button>
                </div>
                <Table
                  rowKey="agentId"
                  loading={agentsLoading}
                  dataSource={agents}
                  columns={[
                    { title: '人员ID', dataIndex: 'agentId', key: 'agentId' },
                    { title: '姓名', dataIndex: 'displayName', key: 'displayName' },
                    { title: '团队', dataIndex: 'team', key: 'team' },
                    { title: '角色', dataIndex: 'role', key: 'role' },
                    {
                      title: '启用',
                      dataIndex: 'enabled',
                      key: 'enabled',
                      render: (value: boolean) => (value ? '是' : '否'),
                    },
                    { title: '备注', dataIndex: 'remark', key: 'remark' },
                    {
                      title: '操作',
                      key: 'actions',
                      render: (_: unknown, record: AgentProfile) => (
                        <Space>
                          <Button
                            size="small"
                            onClick={() => {
                              setEditingAgentId(record.agentId);
                              agentForm.setFieldsValue({
                                agentId: record.agentId,
                                displayName: record.displayName,
                                team: record.team,
                                role: record.role,
                                enabled: record.enabled,
                                remark: record.remark,
                              });
                              void loadUdescAgentIds();
                              setAgentModalOpen(true);
                            }}
                          >
                            编辑
                          </Button>
                          <Popconfirm
                            title="确认删除该人员配置？"
                            onConfirm={async () => {
                              await deleteAgent(record.agentId);
                              message.success('已删除');
                              await loadAgents();
                            }}
                          >
                            <Button size="small" danger>
                              删除
                            </Button>
                          </Popconfirm>
                        </Space>
                      ),
                    },
                  ]}
                />
              </>
            ),
          },
          {
            key: 'wecom',
            label: '企微人员',
            children: (
              <>
                <div style={{ marginBottom: 16 }}>
                  <Button
                    type="primary"
                    onClick={() => {
                      setEditingWecomUserId(null);
                      wecomEmployeeForm.resetFields();
                      wecomEmployeeForm.setFieldsValue({ enabled: true, isCustomerService: false });
                      setWecomEmployeeModalOpen(true);
                    }}
                  >
                    新增企微人员
                  </Button>
                </div>
                <Table
                  rowKey="userId"
                  loading={wecomEmployeesLoading}
                  dataSource={wecomEmployees}
                  columns={[
                    { title: '用户ID', dataIndex: 'userId', key: 'userId' },
                    { title: '姓名', dataIndex: 'name', key: 'name' },
                    { title: '部门', dataIndex: 'department', key: 'department' },
                    { title: '职位', dataIndex: 'position', key: 'position' },
                    { title: '手机', dataIndex: 'mobile', key: 'mobile' },
                    { title: '邮箱', dataIndex: 'email', key: 'email' },
                    {
                      title: '启用',
                      dataIndex: 'enabled',
                      key: 'enabled',
                      render: (value: boolean) => (value ? '是' : '否'),
                    },
                    {
                      title: '客服',
                      dataIndex: 'isCustomerService',
                      key: 'isCustomerService',
                      render: (value: boolean) => (value ? '是' : '否'),
                    },
                    { title: '备注', dataIndex: 'remark', key: 'remark' },
                    {
                      title: '操作',
                      key: 'actions',
                      render: (_: unknown, record: WecomEmployee) => (
                        <Space>
                          <Button
                            size="small"
                            onClick={() => {
                              setEditingWecomUserId(record.userId);
                              wecomEmployeeForm.setFieldsValue({
                                userId: record.userId,
                                name: record.name,
                                department: record.department,
                                position: record.position,
                                mobile: record.mobile,
                                email: record.email,
                                enabled: record.enabled,
                                isCustomerService: record.isCustomerService,
                                remark: record.remark,
                              });
                              setWecomEmployeeModalOpen(true);
                            }}
                          >
                            编辑
                          </Button>
                          <Popconfirm
                            title="确认删除该企微人员？"
                            onConfirm={async () => {
                              await deleteWecomEmployee(record.userId);
                              message.success('已删除');
                              await loadWecomEmployees();
                            }}
                          >
                            <Button size="small" danger>
                              删除
                            </Button>
                          </Popconfirm>
                        </Space>
                      ),
                    },
                  ]}
                />
              </>
            ),
          },
        ]}
      />
    </Card>
  );

  return (
    <div style={{ padding: 24 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <Typography.Title level={3} style={{ marginBottom: 0 }}>
          GitCode 客服运营看板
        </Typography.Title>
        {!disableAuth && (
          <Space>
            <Typography.Text type="secondary">
              {loginUser?.realname ? `当前登录：${loginUser.realname}` : '当前登录'}
            </Typography.Text>
            <Button
              onClick={() => {
                clearSession();
                window.location.href = '/login';
              }}
            >
              退出登录
            </Button>
          </Space>
        )}
      </div>
        <Space style={{ marginBottom: 16 }}>
          <RangePicker
            format="YYYY-MM-DD"
            value={range}
            presets={quickRangePresets}
            allowClear={false}
            onChange={(value) => {
              if (!value || value.length !== 2 || !value[0] || !value[1]) {
                return;
              }
              setPage(1);
              setRange([value[0].startOf('day'), value[1].endOf('day')]);
            }}
          />
          <Button
            onClick={() => {
              if (activeMenuKey === 'opportunity') {
                void loadOpportunities(1, opportunityPageSize);
                return;
              }
              if (activeMenuKey === 'sync-zouwu') {
                void loadZouwuStats();
                return;
              }
              void reload();
            }}
          >
            查询
          </Button>
        </Space>

        {loading && <Spin />}

        {!loading && !overview && activeMenuKey === 'satisfaction' && <Alert type="warning" message="暂无满意度数据，请先同步。" />}
        {!loading && !demandOverview && activeMenuKey === 'demand' && <Alert type="warning" message="暂无需求数据，请先同步驺吾数据。" />}
        {!opportunityLoading && opportunities.length === 0 && activeMenuKey === 'opportunity' && (
          <Alert type="warning" message="暂无商机数据，可手工新增或从咨询详情转商机。" />
        )}

        {!loading && overview && activeMenuKey === 'satisfaction' && satisfactionTab}
        {!loading && demandOverview && activeMenuKey === 'demand' && demandTab}
        {activeMenuKey === 'opportunity' && opportunityTab}
        {activeMenuKey === 'sync-udesc' && syncTab}
        {activeMenuKey === 'sync-zouwu' && zouwuSyncTab}
        {activeMenuKey === 'agents' && agentsTab}

        <Modal
          title={editingAgentId ? '编辑人员' : '新增人员'}
          open={agentModalOpen}
          confirmLoading={savingAgent}
          onCancel={() => setAgentModalOpen(false)}
          onOk={async () => {
            const values = await agentForm.validateFields();
            setSavingAgent(true);
            try {
              await upsertAgent(values);
              message.success('保存成功');
              setAgentModalOpen(false);
              await loadAgents();
            } finally {
              setSavingAgent(false);
            }
          }}
        >
          <Form form={agentForm} layout="vertical">
            <Form.Item name="agentId" label="人员ID" rules={[{ required: true, message: '请输入人员ID' }]}>
              <AutoComplete
                disabled={Boolean(editingAgentId)}
                options={udescAgentIds.map((id) => ({ value: id, label: getAgentLabel(id) }))}
                placeholder="优先选择 Udesk 人员ID"
                filterOption={(inputValue, option) =>
                  `${option?.value ?? ''}${option?.label ?? ''}`.toLowerCase().includes(inputValue.toLowerCase())
                }
              />
            </Form.Item>
            <Form.Item name="displayName" label="姓名" rules={[{ required: true, message: '请输入姓名' }]}>
              <Input />
            </Form.Item>
            <Form.Item name="team" label="团队">
              <Input />
            </Form.Item>
            <Form.Item name="role" label="角色">
              <Input />
            </Form.Item>
            <Form.Item name="enabled" label="启用" valuePropName="checked">
              <Switch />
            </Form.Item>
            <Form.Item name="remark" label="备注">
              <Input.TextArea rows={3} />
            </Form.Item>
          </Form>
        </Modal>

        <Modal
          title={editingWecomUserId ? '编辑企微人员' : '新增企微人员'}
          open={wecomEmployeeModalOpen}
          confirmLoading={savingWecomEmployee}
          onCancel={() => setWecomEmployeeModalOpen(false)}
          onOk={async () => {
            const values = await wecomEmployeeForm.validateFields();
            setSavingWecomEmployee(true);
            try {
              await upsertWecomEmployee(values);
              message.success('保存成功');
              setWecomEmployeeModalOpen(false);
              await loadWecomEmployees();
            } catch {
              message.error('保存失败');
            } finally {
              setSavingWecomEmployee(false);
            }
          }}
        >
          <Form form={wecomEmployeeForm} layout="vertical">
            <Form.Item name="userId" label="用户ID" rules={[{ required: true, message: '请输入用户ID' }]}>
              <Input />
            </Form.Item>
            <Form.Item name="name" label="姓名">
              <Input />
            </Form.Item>
            <Form.Item name="department" label="部门">
              <Input />
            </Form.Item>
            <Form.Item name="position" label="职位">
              <Input />
            </Form.Item>
            <Form.Item name="mobile" label="手机">
              <Input />
            </Form.Item>
            <Form.Item name="email" label="邮箱">
              <Input />
            </Form.Item>
            <Form.Item name="enabled" label="启用" valuePropName="checked">
              <Switch />
            </Form.Item>
            <Form.Item name="isCustomerService" label="是否客服" valuePropName="checked">
              <Switch />
            </Form.Item>
            <Form.Item name="remark" label="备注">
              <Input.TextArea rows={3} />
            </Form.Item>
          </Form>
        </Modal>

        <Modal
          title={editingOpportunityId ? '编辑商机' : '新增商机'}
          open={opportunityModalOpen}
          confirmLoading={savingOpportunity}
          onCancel={() => setOpportunityModalOpen(false)}
          onOk={async () => {
            const values = await opportunityForm.validateFields();
            setSavingOpportunity(true);
            try {
              await upsertOpportunity({
                id: editingOpportunityId ?? undefined,
                ...values,
              });
              message.success('商机已保存');
              setOpportunityModalOpen(false);
              await loadOpportunities(opportunityPage, opportunityPageSize);
            } finally {
              setSavingOpportunity(false);
            }
          }}
        >
          <Form form={opportunityForm} layout="vertical">
            <Form.Item name="title" label="商机标题" rules={[{ required: true, message: '请输入商机标题' }]}>
              <Input />
            </Form.Item>
            <Form.Item name="sourceType" label="来源" rules={[{ required: true, message: '请选择来源' }]}>
              <Select
                options={[
                  { label: '咨询转商机', value: 'CONSULTATION' },
                  { label: '手工录入', value: 'MANUAL' },
                ]}
              />
            </Form.Item>
            <Form.Item name="sourceSessionId" label="关联咨询会话ID">
              <AutoComplete
                options={sessions.map((item) => ({
                  value: item.id,
                  label: `${item.id} | ${getAgentLabel(item.agentId)}`,
                }))}
                placeholder="可选择咨询详情中的会话ID"
              />
            </Form.Item>
            <Form.Item name="agentId" label="负责人客服ID">
              <AutoComplete
                options={udescAgentIds.map((id) => ({ value: id, label: getAgentLabel(id) }))}
                placeholder="可关联客服ID"
              />
            </Form.Item>
            <Form.Item name="customerName" label="客户名称">
              <Input />
            </Form.Item>
            <Form.Item name="contactInfo" label="联系方式">
              <Input />
            </Form.Item>
            <Form.Item name="estimatedAmount" label="预估金额">
              <InputNumber min={0} style={{ width: '100%' }} />
            </Form.Item>
            <Form.Item name="status" label="状态" rules={[{ required: true, message: '请选择状态' }]}>
              <Select
                options={[
                  { label: '新建', value: 'NEW' },
                  { label: '已甄别', value: 'QUALIFIED' },
                  { label: '跟进中', value: 'FOLLOWING' },
                  { label: '赢单', value: 'WON' },
                  { label: '输单', value: 'LOST' },
                ]}
              />
            </Form.Item>
            <Form.Item name="nextAction" label="下一步动作">
              <Input />
            </Form.Item>
            <Form.Item name="description" label="商机说明">
              <Input.TextArea rows={3} />
            </Form.Item>
          </Form>
        </Modal>
    </div>
  );
}
