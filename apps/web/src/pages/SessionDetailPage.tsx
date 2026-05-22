import { useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  Button,
  Card,
  Col,
  DatePicker,
  Form,
  Input,
  message,
  Modal,
  Row,
  Select,
  Space,
  Spin,
  Statistic,
  Table,
  Tag,
  Typography,
} from 'antd';
import type { DataNode } from 'antd/es/tree';
import dayjs from 'dayjs';
import ReactECharts from 'echarts-for-react';
import {
  fetchUdeskOverview,
  fetchUdeskTree,
  fetchUdeskSessions,
  fetchAgents,
  fetchUdeskDailyRatingStats,
} from '../api/udesk';
import type {
  AgentProfile,
  UdeskSessionRecord,
  UdeskTreeNode,
  UdeskOverview,
  UdeskDailyRatingStats,
} from '../types/udesk';
import { fetchOpportunityList, upsertOpportunity } from '../api/opportunity';

const { RangePicker } = DatePicker;

function renderMessageContent(raw?: string): React.ReactNode {
  if (!raw) return '';
  
  let text: string;
  try {
    const parsed = JSON.parse(raw) as { data?: { content?: string } };
    text = parsed?.data?.content ?? raw;
  } catch {
    text = raw;
  }
  
  // 去除 HTML 标签如 <p>, </p>, <br> 等
  text = text.replace(/<\/?[a-zA-Z][^>]*>/g, '').replace(/<br\s*\/?>/gi, '\n');
  
  // URL 正则 - 只匹配英文字符和常见 URL 字符
  const urlPattern = /https?:\/\/[a-zA-Z0-9\-._~:/?#[\]@!$&'()*+,;=%]+/g;
  const parts = text.split(urlPattern);
  const urls = text.match(urlPattern) || [];
  
  const result: React.ReactNode[] = [];
  parts.forEach((part, i) => {
    result.push(part);
    if (urls[i]) {
      result.push(
        <a key={`url-${i}`} href={urls[i]} target="_blank" rel="noopener noreferrer" style={{ color: '#1890ff' }}>
          {urls[i]}
        </a>
      );
    }
  });
  
  return result;
}

export function SessionDetailPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [loading, setLoading] = useState(false);
  const [overview, setOverview] = useState<UdeskOverview | null>(null);
  const [treeData, setTreeData] = useState<UdeskTreeNode[]>([]);
  const [sessions, setSessions] = useState<UdeskSessionRecord[]>([]);
  const [sessionAgentFilters, setSessionAgentFilters] = useState<string[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [agentProfileMap, setAgentProfileMap] = useState<Map<string, AgentProfile>>(new Map());
  const [range, setRange] = useState<[dayjs.Dayjs, dayjs.Dayjs]>(() => {
    const end = dayjs();
    const start = end.subtract(30, 'day');
    return [start.startOf('day'), end.endOf('day')];
  });

  const [opportunityModalOpen, setOpportunityModalOpen] = useState(false);
  const [editingOpportunityId, setEditingOpportunityId] = useState<string | null>(null);
  const [opportunityForm] = Form.useForm();
  const [savingOpportunity, setSavingOpportunity] = useState(false);
  const [opportunityStatusFilter, setOpportunityStatusFilter] = useState<string | undefined>();
  const [opportunitySourceFilter, setOpportunitySourceFilter] = useState<string | undefined>();
  const [opportunityKeyword, setOpportunityKeyword] = useState('');
  const [opportunities, setOpportunities] = useState<{ id: string; title: string }[]>([]);
  const [opportunityTotal, setOpportunityTotal] = useState(0);
  const [opportunityPage, setOpportunityPage] = useState(1);
  const [opportunityPageSize, setOpportunityPageSize] = useState(20);
  const [sessionSearchId, setSessionSearchId] = useState('');
  const activeSessionSearchRef = useRef<string | null>(null);
  const [dailyRatingStats, setDailyRatingStats] = useState<UdeskDailyRatingStats | null>(null);

  const apiRange = useMemo(
    () => ({
      startDateIso: range[0].startOf('day').format('YYYY-MM-DDTHH:mm:ss.SSSZ'),
      endDateIso: range[1].endOf('day').format('YYYY-MM-DDTHH:mm:ss.SSSZ'),
    }),
    [range],
  );

  const getAgentLabel = (agentId?: string | null): string => {
    if (!agentId) return '未知客服';
    const profile = agentProfileMap.get(agentId);
    if (profile) {
      return profile.displayName;
    }
    return agentId;
  };

  const reload = async (
    nextPage?: number,
    nextPageSize?: number,
    nextSessionAgentFilters?: string[],
    nextSessionId?: string,
  ) => {
    const targetPage = nextPage ?? page;
    const targetPageSize = nextPageSize ?? pageSize;
    const targetSessionAgentFilters = nextSessionAgentFilters ?? sessionAgentFilters;
    const targetSessionId = nextSessionId ?? sessionSearchId;
    console.log('[reload] targetSessionId:', targetSessionId, 'nextSessionId:', nextSessionId, 'sessionSearchId:', sessionSearchId);

    // 标记当前活跃的 sessionId 搜索
    const searchId = Date.now();
    if (targetSessionId) {
      activeSessionSearchRef.current = String(searchId);
    }
    const mySearchId = activeSessionSearchRef.current;

    setLoading(true);
    try {
      // 当搜索 sessionId 时，只加载该会话，不加载 overview 和 tree
      if (targetSessionId) {
        console.log('[reload] calling fetchUdeskSessions with sessionId:', targetSessionId);
        const sessionResp = await fetchUdeskSessions({
          startDate: apiRange.startDateIso,
          endDate: apiRange.endDateIso,
          page: 1,
          pageSize: 1,
          sessionId: targetSessionId,
        });
        // 检查是否仍然是最新的搜索
        if (activeSessionSearchRef.current === mySearchId) {
          setSessions(sessionResp.records);
          setTotal(sessionResp.total);
          setPage(sessionResp.page);
          setPageSize(sessionResp.pageSize);
          // 清空筛选
          setOverview(null);
          setTreeData([]);
          setSessionAgentFilters([]);
          activeSessionSearchRef.current = null;
        } else {
          console.log('[reload] skipped - outdated search');
        }
      } else {
        // 如果当前有活跃的 sessionId 搜索，跳过这次普通搜索
        if (activeSessionSearchRef.current) {
          console.log('[reload] skipped - active session search exists');
          return;
        }
        const [overviewData, treeResp, sessionResp, ratingStats] = await Promise.all([
          fetchUdeskOverview({ startDate: apiRange.startDateIso, endDate: apiRange.endDateIso }),
          fetchUdeskTree({ startDate: apiRange.startDateIso, endDate: apiRange.endDateIso }),
          fetchUdeskSessions({
            startDate: apiRange.startDateIso,
            endDate: apiRange.endDateIso,
            page: targetPage,
            pageSize: targetPageSize,
            agentIds:
              targetSessionAgentFilters.length > 0 ? targetSessionAgentFilters.join(',') : undefined,
          }),
          fetchUdeskDailyRatingStats({ startDate: apiRange.startDateIso, endDate: apiRange.endDateIso }),
        ]);
        setOverview(overviewData);
        setTreeData(Array.isArray(treeResp) ? treeResp : []);
        setSessions(sessionResp.records);
        setTotal(sessionResp.total);
        setPage(sessionResp.page);
        setPageSize(sessionResp.pageSize);
        setDailyRatingStats(ratingStats);
      }
    } catch {
      message.error('加载数据失败');
    } finally {
      setLoading(false);
    }
  };

  const loadAgents = async () => {
    try {
      const data = await fetchAgents();
      const map = new Map<string, AgentProfile>();
      data.forEach((a) => map.set(a.agentId, a));
      setAgentProfileMap(map);
    } catch {
      // ignore
    }
  };

  const loadOpportunities = async (nextPage?: number, nextPageSize?: number) => {
    const targetPage = nextPage ?? opportunityPage;
    const targetPageSize = nextPageSize ?? opportunityPageSize;
    try {
      const listResp = await fetchOpportunityList({
        startDate: apiRange.startDateIso,
        endDate: apiRange.endDateIso,
        status: opportunityStatusFilter,
        sourceType: opportunitySourceFilter,
        keyword: opportunityKeyword || undefined,
        page: targetPage,
        pageSize: targetPageSize,
      });
      setOpportunities(listResp.records);
      setOpportunityTotal(listResp.total);
      setOpportunityPage(listResp.page);
      setOpportunityPageSize(listResp.pageSize);
    } catch {
      // ignore
    }
  };

  useEffect(() => {
    loadAgents();
  }, []);

  // 处理从 MetricsPage 导航过来的 highlightSessionId 参数
  const highlightSessionId = searchParams.get('highlightSessionId');
  // 在渲染阶段就标记，防止日期变化 effect 先执行
  if (highlightSessionId && !activeSessionSearchRef.current) {
    activeSessionSearchRef.current = highlightSessionId;
  }
  const skipDateChangeEffect = useRef(false);
  useEffect(() => {
    if (highlightSessionId) {
      console.log('[highlightSessionId from URL]', highlightSessionId);
      setSessionSearchId(highlightSessionId);
      // 清除 URL 参数，避免重复触发
      searchParams.delete('highlightSessionId');
      setSearchParams(searchParams, { replace: true });
      // 通知日期变化 effect 跳过本次
      skipDateChangeEffect.current = true;
      // 延迟触发搜索，确保 state 已更新
      setTimeout(() => {
        void reload(undefined, undefined, undefined, highlightSessionId);
      }, 50);
    }
  }, [highlightSessionId]); // 只在参数变化时触发

  useEffect(() => {
    // 日期变化时重置 sessionSearchId
    // 如果 URL 中有 highlightSessionId 参数，跳过（让 highlightSessionId effect 处理）
    const urlHighlightId = searchParams.get('highlightSessionId');
    if (urlHighlightId) {
      console.log('[date change] skipped - highlightSessionId in URL:', urlHighlightId);
      return;
    }
    setSessionSearchId('');
    void reload();
  }, [apiRange.startDateIso, apiRange.endDateIso]);

  useEffect(() => {
    void loadOpportunities();
  }, [apiRange.startDateIso, apiRange.endDateIso, opportunityStatusFilter, opportunitySourceFilter, opportunityKeyword]);

  const sessionColumns = useMemo(
    () => [
      {
        title: '会话 ID',
        dataIndex: 'id',
        key: 'id',
        width: 280,
        render: (value: string) => (
          <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <Typography.Link
              style={{ fontSize: 12 }}
              type={searchParams.get('highlightSessionId') === value ? 'success' : undefined}
              onClick={(e) => {
                e.stopPropagation();
                e.preventDefault();
                if (!value) return;
                console.log('[CLICK SESSION ID v3]', value);
                alert('点击了会话ID: ' + value);
                setSessionSearchId(value);
                void reload(undefined, undefined, undefined, value);
              }}
            >
              {value}
            </Typography.Link>
            <Typography.Link
              copyable={{ text: value, tooltips: ['复制', '已复制'] }}
              style={{ fontSize: 12 }}
            />
          </span>
        ),
      },
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
        render: (_: unknown, record: UdeskSessionRecord) => (
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

  const saveOpportunity = async () => {
    try {
      const values = await opportunityForm.validateFields();
      setSavingOpportunity(true);
      await upsertOpportunity(editingOpportunityId ? { ...values, id: editingOpportunityId } : values);
      message.success(editingOpportunityId ? '商机已更新' : '商机已创建');
      setOpportunityModalOpen(false);
      void loadOpportunities();
    } catch {
      message.error('保存失败');
    } finally {
      setSavingOpportunity(false);
    }
  };

  return (
    <Spin spinning={loading}>
      <div style={{ marginBottom: 24 }}>
        <Typography.Title level={4} style={{ marginBottom: 16 }}>咨询详情（结构化）</Typography.Title>
        <Card 
          size="small" 
          style={{ background: '#fafafa', borderRadius: 8 }}
          styles={{ body: { padding: '12px 16px' } }}
        >
          <Space size="middle">
            <span style={{ color: '#666' }}>时间范围：</span>
            <RangePicker
              value={range}
              onChange={(dates) => dates && setRange(dates as [dayjs.Dayjs, dayjs.Dayjs])}
              presets={[
                { label: '近7天', value: () => [dayjs().subtract(6, 'day').startOf('day'), dayjs().endOf('day')] as [dayjs.Dayjs, dayjs.Dayjs] },
                { label: '近30天', value: () => [dayjs().subtract(29, 'day').startOf('day'), dayjs().endOf('day')] as [dayjs.Dayjs, dayjs.Dayjs] },
              ]}
            />
            <Button type="primary" onClick={() => void reload()}>
              查询
            </Button>
          </Space>
        </Card>
      </div>

      {/* 汇总和业务树并排 */}
      <Row gutter={16} style={{ marginBottom: 16 }}>
        <Col span={10}>
          <Card title="汇总" styles={{ body: { padding: '12px 16px' } }}>
            <Row gutter={16}>
              <Col span={6}>
                <Statistic title="总咨询数" value={overview?.totalSessions ?? 0} />
              </Col>
              <Col span={6}>
                <Statistic 
                  title="平均满意度" 
                  value={overview?.avgRating?.toFixed(2) ?? '-'}
                  suffix={overview?.avgRating ? ' / 5' : ''}
                />
              </Col>
              <Col span={6}>
                <Statistic title="已评价数" value={overview?.ratedCount ?? 0} />
              </Col>
              <Col span={6}>
                <Statistic 
                  title="参评率" 
                  value={overview && overview.totalSessions > 0 
                    ? `${((overview.ratedCount / overview.totalSessions) * 100).toFixed(1)}%` 
                    : '-'} 
                />
              </Col>
            </Row>
          </Card>
        </Col>
        <Col span={14}>
          <Card 
            title="客服业务统计"
            styles={{ body: { padding: 0 } }}
          >
            <Table 
              dataSource={[...treeData]
                .sort((a, b) => b.sessionCount - a.sessionCount)
                .map((agent) => {
                  const totalMessages = agent.sessions.reduce((sum, s) => sum + s.messageCount, 0);
                  const avgMessages = agent.sessionCount > 0 
                    ? (totalMessages / agent.sessionCount).toFixed(2) 
                    : '-';
                  return {
                    key: agent.agentId,
                    agentId: agent.agentId,
                    agentName: getAgentLabel(agent.agentId),
                    sessionCount: agent.sessionCount,
                    avgRating: agent.avgRating,
                    avgMessages,
                  };
                })}
              columns={[
                {
                  title: '客服',
                  dataIndex: 'agentName',
                  key: 'agentName',
                  render: (text: string) => <span style={{ fontWeight: 500 }}>{text}</span>,
                },
                {
                  title: '咨询数',
                  dataIndex: 'sessionCount',
                  key: 'sessionCount',
                  align: 'right',
                },
                {
                  title: '平均评分',
                  dataIndex: 'avgRating',
                  key: 'avgRating',
                  align: 'center',
                  render: (v: number | undefined) => {
                    if (v === undefined || v === null) return <span style={{ color: '#999' }}>-</span>;
                    const color = v >= 4.5 ? '#52c41a' : v >= 3.5 ? '#faad14' : '#ff4d4f';
                    return <span style={{ color, fontWeight: 500 }}>{v.toFixed(2)}</span>;
                  },
                },
                {
                  title: '平均消息数',
                  dataIndex: 'avgMessages',
                  key: 'avgMessages',
                  align: 'right',
                  render: (v: string) => <span style={{ color: '#666' }}>{v}</span>,
                },
              ]}
              size="small"
              pagination={false}
              scroll={{ y: 200 }}
            />
          </Card>
        </Col>
      </Row>

      {/* 满意度趋势图 */}
      {dailyRatingStats && dailyRatingStats.days.length > 0 && (
        <Card title="满意度趋势" style={{ marginBottom: 16 }}>
          <ReactECharts
            option={{
              tooltip: {
                trigger: 'axis',
              },
              legend: {
                type: 'scroll',
                bottom: 0,
              },
              grid: {
                left: '3%',
                right: '4%',
                bottom: '15%',
                containLabel: true,
              },
              xAxis: {
                type: 'category',
                data: dailyRatingStats.days.map(d => dayjs(d).format('MM-DD')),
              },
              yAxis: {
                type: 'value',
                min: 0,
                max: 5,
              },
              series: [
                ...dailyRatingStats.series.map((s) => ({
                  name: getAgentLabel(s.agentId),
                  type: 'line' as const,
                  data: s.ratings,
                  connectNulls: true,
                })),
                {
                  name: '整体平均',
                  type: 'line' as const,
                  data: dailyRatingStats.overall,
                  connectNulls: true,
                  lineStyle: { width: 3, type: 'dashed' },
                  symbol: 'circle',
                  symbolSize: 8,
                },
              ],
            }}
            style={{ height: 300 }}
          />
        </Card>
      )}

      {/* 咨询记录 */}
      <Card title="咨询记录">
        <Space wrap style={{ marginBottom: 12 }}>
          <Input.Search
            placeholder="搜索会话ID [v3]"
            allowClear
            style={{ width: 200 }}
            value={sessionSearchId}
            onChange={(e) => setSessionSearchId(e.target.value)}
            onSearch={(value) => {
              setSessionSearchId(value);
              setPage(1);
              void reload(1, pageSize, sessionAgentFilters, value);
            }}
          />
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
            void reload(pagination.current ?? 1, pagination.pageSize ?? pageSize, agentIds, sessionSearchId || undefined);
          }}
          pagination={{
            current: page,
            pageSize,
            total,
            showSizeChanger: true,
            showTotal: (t) => `共 ${t} 条`,
            onChange: (nextPageNumber, nextPageSizeNumber) => {
              void reload(nextPageNumber, nextPageSizeNumber, sessionAgentFilters);
            },
          }}
          expandable={{
            expandedRowRender: (record) => (
              <div style={{ padding: 12 }}>
                {record.messages.length === 0 && (
                  <Typography.Text type="secondary">无本地消息明细</Typography.Text>
                )}
                {record.messages.map((msg) => {
                  // 判断发送者类型：
                  // 1. 优先使用 senderType
                  // 2. 比较 senderId 与 agentId
                  // 3. 从 rawPayload 中查找 sender/status 等字段
                  const raw = msg.rawPayload as Record<string, unknown> | undefined;
                  const rawSender = raw?.sender as string | undefined;
                  const rawStatus = raw?.status as string | undefined;
                  const rawFrom = raw?.from as string | undefined;
                  
                  const isSystemMsg = msg.senderType === '系统' || msg.senderType === 'system' || msg.senderType === 'SYSTEM';
                  const isAgent = (
                    msg.senderType === 'AGENT' ||
                    msg.senderType === 'agent' ||
                    msg.senderType === '客服' ||
                    rawSender === 'AGENT' ||
                    rawSender === 'agent' ||
                    rawFrom === 'AGENT' ||
                    rawFrom === 'agent' ||
                    rawStatus === 'arrive' ||  // 客服消息有 send_status: arrive
                    msg.senderId === record.agentId
                  );

                  return (
                    <div key={msg.id} style={{ marginBottom: 8 }}>
                      <Tag color={isSystemMsg ? 'orange' : isAgent ? 'blue' : 'green'}>
                        {isSystemMsg ? '系统' : isAgent ? '客服' : '客户'}
                      </Tag>
                      <Typography.Text type="secondary" style={{ marginLeft: 8 }}>
                        {dayjs(msg.sentAt).format('MM-DD HH:mm:ss')}
                      </Typography.Text>
                      <div style={{ marginTop: 4 }}>{renderMessageContent(msg.content)}</div>
                    </div>
                  );
                })}
              </div>
            ),
          }}
        />
      </Card>

      <Modal
        title="创建商机"
        open={opportunityModalOpen}
        onCancel={() => setOpportunityModalOpen(false)}
        onOk={saveOpportunity}
        confirmLoading={savingOpportunity}
        width={600}
      >
        <Form form={opportunityForm} layout="vertical">
          <Form.Item name="sourceType" label="来源类型">
            <Select disabled>
              <Select.Option value="CONSULTATION">咨询会话</Select.Option>
            </Select>
          </Form.Item>
          <Form.Item name="sourceSessionId" label="来源会话ID">
            <Input disabled />
          </Form.Item>
          <Form.Item name="agentId" label="客服ID">
            <Input disabled />
          </Form.Item>
          <Form.Item name="title" label="商机标题" rules={[{ required: true }]}>
            <Input />
          </Form.Item>
          <Form.Item name="status" label="状态" rules={[{ required: true }]}>
            <Select>
              <Select.Option value="NEW">新建</Select.Option>
              <Select.Option value="CONTACTED">已联系</Select.Option>
              <Select.Option value="QUALIFIED">已确认</Select.Option>
              <Select.Option value="CONVERTED">已转化</Select.Option>
              <Select.Option value="CLOSED">已关闭</Select.Option>
            </Select>
          </Form.Item>
          <Form.Item name="description" label="描述">
            <Input.TextArea rows={3} />
          </Form.Item>
          <Form.Item name="estimatedValue" label="预估价值">
            <Input type="number" />
          </Form.Item>
          <Form.Item name="contactName" label="联系人姓名">
            <Input />
          </Form.Item>
          <Form.Item name="contactPhone" label="联系电话">
            <Input />
          </Form.Item>
          <Form.Item name="contactEmail" label="联系邮箱">
            <Input />
          </Form.Item>
        </Form>
      </Modal>
    </Spin>
  );
}
