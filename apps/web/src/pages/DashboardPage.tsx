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
  Space,
  Spin,
  Statistic,
  Table,
  Menu,
  Popconfirm,
  Tag,
  Progress,
  Switch,
  Tree,
  Typography,
  message,
} from 'antd';
import type { DataNode } from 'antd/es/tree';
import dayjs from 'dayjs';
import ReactECharts from 'echarts-for-react';
import {
  deleteAgent,
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
  updateSyncConfig,
  upsertAgent,
} from '../api/udesc';
import type {
  AgentProfile,
  SyncConfig,
  SyncIssue,
  SyncProgress,
  SyncRun,
  SyncSummary,
  UdescDailyAgentStats,
  UdescOverview,
  UdescSessionRecord,
  UdescTreeNode,
} from '../types/udesc';

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
  const [activeMenuKey, setActiveMenuKey] = useState<'overview' | 'sync' | 'agents'>('overview');
  const [agentForm] = Form.useForm();
  const [loading, setLoading] = useState(false);
  const [syncLoading, setSyncLoading] = useState(false);
  const [overview, setOverview] = useState<UdescOverview | null>(null);
  const [dailyStats, setDailyStats] = useState<UdescDailyAgentStats | null>(null);
  const [selectedAgents, setSelectedAgents] = useState<string[]>(['__summary__']);
  const [selectedMetrics, setSelectedMetrics] = useState<Array<'sessions' | 'messages'>>([
    'sessions',
    'messages',
  ]);
  const [treeData, setTreeData] = useState<UdescTreeNode[]>([]);
  const [sessions, setSessions] = useState<UdescSessionRecord[]>([]);
  const [sessionAgentFilters, setSessionAgentFilters] = useState<string[]>([]);
  const [syncProgress, setSyncProgress] = useState<SyncProgress | null>(null);
  const [syncIssues, setSyncIssues] = useState<SyncIssue[]>([]);
  const [syncRuns, setSyncRuns] = useState<SyncRun[]>([]);
  const [syncSummary, setSyncSummary] = useState<SyncSummary | null>(null);
  const [syncConfig, setSyncConfig] = useState<SyncConfig | null>(null);
  const [syncConfigLoading, setSyncConfigLoading] = useState(false);
  const [retryLoading, setRetryLoading] = useState(false);
  const [agents, setAgents] = useState<AgentProfile[]>([]);
  const [agentsLoading, setAgentsLoading] = useState(false);
  const [udescAgentIds, setUdescAgentIds] = useState<string[]>([]);
  const [agentModalOpen, setAgentModalOpen] = useState(false);
  const [savingAgent, setSavingAgent] = useState(false);
  const [editingAgentId, setEditingAgentId] = useState<string | null>(null);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [range, setRange] = useState<[string, string]>(() => {
    const end = dayjs();
    const start = end.subtract(30, 'day');
    return [start.toISOString(), end.toISOString()];
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
      const [overviewData, dailyStatsData, treeResp, sessionResp] = await Promise.all([
        fetchUdescOverview({ startDate: range[0], endDate: range[1] }),
        fetchUdescDailyAgentStats({ startDate: range[0], endDate: range[1] }),
        fetchUdescTree({ startDate: range[0], endDate: range[1] }),
        fetchUdescSessions({
          startDate: range[0],
          endDate: range[1],
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
  }, [range[0], range[1]]);

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
    }
  }, [activeMenuKey]);

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

  const operationsTab = (
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

  const agentsTab = (
    <Card
      title="人员管理"
      extra={
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
      }
    >
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
    </Card>
  );

  return (
    <Layout style={{ minHeight: '100vh' }}>
      <Layout.Sider width={220} theme="light" style={{ borderRight: '1px solid #f0f0f0' }}>
        <div style={{ padding: '16px 16px 8px 16px' }}>
          <Typography.Title level={5} style={{ margin: 0 }}>
            客服运营后台
          </Typography.Title>
        </div>
        <Menu
          mode="inline"
          selectedKeys={[activeMenuKey]}
          onClick={(e) => setActiveMenuKey(e.key as 'overview' | 'sync' | 'agents')}
          items={[
            { key: 'overview', label: '运营概览' },
            { key: 'sync', label: '数据同步' },
            { key: 'agents', label: '人员管理' },
          ]}
        />
      </Layout.Sider>

      <Layout.Content style={{ padding: 24 }}>
        <Typography.Title level={3}>GitCode 客服运营看板</Typography.Title>
        <Space style={{ marginBottom: 16 }}>
          <RangePicker
            format="YYYY-MM-DD"
            value={[dayjs(range[0]), dayjs(range[1])]}
            presets={quickRangePresets}
            allowClear={false}
            onChange={(value) => {
              if (!value || value.length !== 2 || !value[0] || !value[1]) {
                return;
              }
              setPage(1);
              setRange([value[0].startOf('day').toISOString(), value[1].endOf('day').toISOString()]);
            }}
          />
          <Button onClick={() => void reload()}>查询</Button>
        </Space>

        {loading && <Spin />}

        {!loading && !overview && <Alert type="warning" message="暂无数据，请先同步。" />}

        {!loading && overview && activeMenuKey === 'overview' && operationsTab}
        {activeMenuKey === 'sync' && syncTab}
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
      </Layout.Content>
    </Layout>
  );
}
