import { useEffect, useState, useMemo, useCallback, useRef } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Card, DatePicker, Table, Typography, Spin, message, Select, Space, Button } from 'antd';
import type { ColumnsType, TablePaginationConfig } from 'antd/es/table';
import dayjs from 'dayjs';
import { fetchUdescMetrics, fetchAgents, fetchUdescAgentMetricsSummary, type AgentMetricsSummary } from '../api/udesc';
import type { UdescSessionMetrics, AgentProfile } from '../types/udesc';

const { RangePicker } = DatePicker;

export function MetricsPage() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  
  // 状态
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<{ records: UdescSessionMetrics[]; total: number } | null>(null);
  const [agents, setAgents] = useState<AgentProfile[]>([]);
  const [range, setRange] = useState<[dayjs.Dayjs, dayjs.Dayjs]>(() => {
    const end = dayjs();
    const start = end.subtract(30, 'day');
    return [start.startOf('day'), end.endOf('day')];
  });
  const [agentId, setAgentId] = useState<string | undefined>();
  const [sortBy, setSortBy] = useState<string>('sessionId');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');
  const [agentFilter, setAgentFilter] = useState<string[] | null>(null);
  const [agentSummary, setAgentSummary] = useState<AgentMetricsSummary[]>([]);
  const [agentSummaryLoading, setAgentSummaryLoading] = useState(false);
  
  // 从 URL 初始化分页状态，并监听 URL 变化（浏览器后退）
  const pageFromUrl = parseInt(searchParams.get('page') || '1', 10);
  const pageSizeFromUrl = parseInt(searchParams.get('pageSize') || '20', 10);
  const [page, setPageState] = useState(pageFromUrl);
  const [pageSize, setPageSizeState] = useState(pageSizeFromUrl);
  
  // 监听 URL 变化（浏览器后退/前进）
  useEffect(() => {
    const urlPage = parseInt(searchParams.get('page') || '1', 10);
    const urlPageSize = parseInt(searchParams.get('pageSize') || '20', 10);
    if (urlPage !== page) {
      setPageState(urlPage);
    }
    if (urlPageSize !== pageSize) {
      setPageSizeState(urlPageSize);
    }
  }, [searchParams, page, pageSize]);
  
  // 用 ref 保存最新值，避免闭包问题
  const stateRef = useRef({ page, pageSize, sortBy, sortOrder, agentFilter, agentId, range });
  stateRef.current = { page, pageSize, sortBy, sortOrder, agentFilter, agentId, range };
  
  // 同步更新 URL 和 state（不使用 replace，让浏览器后退生效）
  const setPage = useCallback((p: number) => {
    setPageState(p);
    setSearchParams(prev => {
      prev.set('page', String(p));
      return prev;
    });
  }, [setSearchParams]);
  
  const setPageSizeCB = useCallback((ps: number) => {
    setPageSizeState(ps);
    setSearchParams(prev => {
      prev.set('pageSize', String(ps));
      return prev;
    });
  }, [setSearchParams]);
  
  const apiRange = useMemo(
    () => ({
      startDateIso: range[0].startOf('day').format('YYYY-MM-DDTHH:mm:ss.SSSZ'),
      endDateIso: range[1].endOf('day').format('YYYY-MM-DDTHH:mm:ss.SSSZ'),
    }),
    [range],
  );

  // 从已加载的数据中提取客服列表
  const agentFilterOptions = useMemo(() => {
    if (!data?.records) return [];
    const agentMap = new Map<string, { id: string; name: string }>();
    data.records.forEach((r) => {
      const id = r.agentId || r.session?.agentId;
      const name = r.agentName;
      if (id && !agentMap.has(id)) {
        agentMap.set(id, { id, name: name || id });
      }
    });
    return Array.from(agentMap.values());
  }, [data?.records]);

  // 加载客服列表
  useEffect(() => {
    const loadAgents = async () => {
      try {
        const resp = await fetchAgents();
        setAgents(resp.filter((a) => a.enabled));
      } catch {
        // ignore
      }
    };
    loadAgents();
  }, []);

  // 加载数据 - 使用 ref 避免 useEffect 依赖过多
  const loadData = useCallback(async (p: number, ps: number) => {
    const { sortBy, sortOrder, agentFilter, agentId, range } = stateRef.current;
    setLoading(true);
    try {
      const resp = await fetchUdescMetrics({
        startDate: range[0].startOf('day').format('YYYY-MM-DDTHH:mm:ss.SSSZ'),
        endDate: range[1].endOf('day').format('YYYY-MM-DDTHH:mm:ss.SSSZ'),
        agentId,
        agentIds: agentFilter && agentFilter.length > 0 ? agentFilter.join(',') : undefined,
        page: p,
        pageSize: ps,
        sortBy,
        sortOrder,
      });
      setData(resp);
    } catch {
      message.error('加载指标数据失败');
    } finally {
      setLoading(false);
    }
  }, []);

  // 加载客服汇总
  const loadAgentSummary = useCallback(async () => {
    setAgentSummaryLoading(true);
    try {
      const resp = await fetchUdescAgentMetricsSummary({
        startDate: apiRange.startDateIso,
        endDate: apiRange.endDateIso,
      });
      setAgentSummary(resp);
    } catch {
      message.error('加载客服汇总数据失败');
    } finally {
      setAgentSummaryLoading(false);
    }
  }, [apiRange]);

  // 初始加载
  useEffect(() => {
    loadData(page, pageSize);
    loadAgentSummary();
  }, [page, pageSize, loadData, loadAgentSummary, apiRange]);

  // 客服筛选/排序变化时重置页码并重新加载
  useEffect(() => {
    if (page !== 1) {
      setPage(1);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [agentFilter, sortBy, sortOrder, agentId]);

  const formatTime = (seconds: number | null) => {
    if (seconds === null || seconds === undefined) return '-';
    if (seconds < 60) return `${Math.round(seconds)}秒`;
    if (seconds < 3600) return `${Math.round(seconds / 60)}分钟`;
    return `${(seconds / 3600).toFixed(1)}小时`;
  };

  const columns: ColumnsType<UdescSessionMetrics> = [
    {
      title: '会话ID',
      dataIndex: 'sessionId',
      width: 280,
      render: (id: string, record) => (
        <Typography.Link onClick={() => navigate(`/udesc/sessions?highlightSessionId=${id}`)}>
          {id}
        </Typography.Link>
      ),
    },
    {
      title: '客服',
      dataIndex: 'agentName',
      width: 100,
      ellipsis: true,
    },
    {
      title: '满意度',
      dataIndex: ['satisfaction', 'rating'],
      width: 80,
      align: 'center',
      render: (v: number | null) => v ? `⭐ ${v}` : '-',
    },
    {
      title: '首次响应',
      dataIndex: 'firstResponseTime',
      width: 100,
      align: 'right',
      sorter: true,
      render: (v: number | null) => formatTime(v),
    },
    {
      title: '平均响应',
      dataIndex: 'avgResponseTime',
      width: 100,
      align: 'right',
      sorter: true,
      render: (v: number | null) => formatTime(v),
    },
    {
      title: '等待时间',
      dataIndex: 'totalWaitTime',
      width: 100,
      align: 'right',
      sorter: true,
      render: (v: number | null) => formatTime(v),
    },
    {
      title: '解决时间',
      dataIndex: 'resolutionTime',
      width: 100,
      align: 'right',
      sorter: true,
      render: (v: number | null) => formatTime(v),
    },
    {
      title: '消息数',
      dataIndex: 'messageCount',
      width: 80,
      align: 'right',
    },
    {
      title: '开始时间',
      dataIndex: ['session', 'startedAt'],
      width: 160,
      render: (v: string) => v ? dayjs(v).format('MM-DD HH:mm:ss') : '-',
    },
    {
      title: '结束时间',
      dataIndex: ['session', 'endedAt'],
      width: 160,
      render: (v: string) => v ? dayjs(v).format('MM-DD HH:mm:ss') : '-',
    },
  ];

  // 分页变化处理
  const handlePaginationChange = useCallback((p: number, ps: number) => {
    setPage(p);
    if (ps !== pageSize) {
      setPageSizeCB(ps);
      setPage(1); // 切换每页条数时回到第一页
    }
  }, [pageSize, setPage, setPageSizeCB]);

  // 表格变化处理（筛选、排序）
  const handleTableChange = useCallback((_pagination: TablePaginationConfig, filters: Record<string, (string | number | boolean)[] | null>, sorter: any) => {
    // 处理客服人员筛选
    const agentFilterValue = filters.agentName as string[] | null;
    setAgentFilter(agentFilterValue);
    
    // 处理排序
    if (!Array.isArray(sorter) && sorter.field) {
      setSortBy(sorter.field as string);
      setSortOrder(sorter.order === 'ascend' ? 'asc' : 'desc');
    }
  }, []);

  return (
    <div style={{ padding: 24 }}>
      <Space style={{ marginBottom: 16 }} size="middle">
        <RangePicker
          value={range}
          onChange={(dates) => {
            if (dates && dates[0] && dates[1]) {
              setRange([dates[0], dates[1]]);
              setPage(1);
            }
          }}
        />
        <Select
          style={{ width: 200 }}
          placeholder="筛选客服"
          allowClear
          options={agents.map((a) => ({ label: a.name, value: a.id }))}
          onChange={(v) => {
            setAgentId(v);
            setPage(1);
          }}
        />
        <Button onClick={() => {
          setPage(1);
          loadData(1, pageSize);
          loadAgentSummary();
        }}>
          刷新
        </Button>
      </Space>

      <Card title="客服人员统计" style={{ marginBottom: 16 }}>
        <Spin spinning={agentSummaryLoading}>
          <Table
            rowKey="agentId"
            size="small"
            pagination={false}
            dataSource={agentSummary}
            columns={[
              { title: '客服', dataIndex: 'agentName', width: 120 },
              { title: '会话数', dataIndex: 'sessionCount', width: 80, align: 'right', sorter: (a, b) => a.sessionCount - b.sessionCount },
              { title: '平均首次响应', dataIndex: 'avgFirstResponseTime', width: 120, align: 'right', render: (v: number | null) => formatTime(v) },
              { title: '平均响应时间', dataIndex: 'avgResponseTime', width: 120, align: 'right', render: (v: number | null) => formatTime(v) },
              { title: '平均等待时间', dataIndex: 'avgWaitTime', width: 120, align: 'right', render: (v: number | null) => formatTime(v) },
              { title: '平均解决时间', dataIndex: 'avgResolutionTime', width: 120, align: 'right', render: (v: number | null) => formatTime(v) },
              { title: '平均消息/会话', dataIndex: 'avgMessagesPerSession', width: 120, align: 'right' },
            ]}
            scroll={{ x: 800 }}
          />
        </Spin>
      </Card>

      <Card>
        <Spin spinning={loading}>
          <Table
            rowKey="sessionId"
            columns={columns}
            dataSource={data?.records ?? []}
            pagination={{
              current: page,
              pageSize,
              total: data?.total ?? 0,
              showSizeChanger: true,
              showTotal: (total) => `共 ${total} 条`,
              onChange: handlePaginationChange,
            }}
            scroll={{ x: 1100 }}
            onChange={handleTableChange}
          />
        </Spin>
      </Card>
    </div>
  );
}
