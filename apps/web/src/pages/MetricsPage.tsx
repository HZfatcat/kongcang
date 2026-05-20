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
  const [range, setRange] = useState<[dayjs.Dayjs, dayjs.Dayjs]>([
    dayjs('2026-04-11').startOf('day'),
    dayjs('2026-05-11').endOf('day'),
  ]);
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
    console.log('[loadData] called with p=', p, 'ps=', ps);
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


  // 加载数据 - 响应所有查询条件变化
  useEffect(() => {
    loadData(page, pageSize);
  }, [page, pageSize, sortBy, sortOrder, agentId, range, loadData]);
  // 客服汇总 - 独立加载，响应时间范围变化
  useEffect(() => {
    const loadAgentSummary = async () => {
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
    };
    loadAgentSummary();
  }, [apiRange]);

  const formatTime = (seconds: number | null) => {
    if (seconds === null || seconds === undefined) return '-';
    const abs = Math.abs(seconds);
    const h = Math.floor(abs / 3600);
    const m = Math.floor((abs % 3600) / 60);
    const s = Math.round(abs % 60);
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  };

  const formatSeconds = (v: number | null) => {
    if (v === null || v === undefined) return '-';
    return `${Math.round(v)}s`;
  };

  const columns: ColumnsType<UdescSessionMetrics> = [
    {
      title: '会话ID',
      dataIndex: 'sessionId',
      width: 120,
      ellipsis: true,
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
      dataIndex: 'rating',
      width: 70,
      render: (v: number | null) => v ? `⭐ ${v}` : '-',
    },
    {
      title: '首次响应',
      dataIndex: 'firstResponseTime',
      width: 80,
      sorter: true,
      render: (v: number | null) => formatSeconds(v),
    },
    {
      title: '平均响应',
      dataIndex: 'avgResponseTime',
      width: 80,
      sorter: true,
      render: (v: number | null) => formatSeconds(v),
    },
    {
      title: '对话时长',
      dataIndex: 'resolutionTime',
      width: 100,
      sorter: true,
      render: (v: number | null) => formatTime(v),
    },
    {
      title: '消息',
      dataIndex: 'messageCount',
      width: 65,
    },
    {
      title: '开始时间',
      dataIndex: 'startedAt',
      width: 130,
      render: (v: string) => v ? dayjs(v).format('MM-DD HH:mm:ss') : '-',
    },
    {
      title: '结束时间',
      dataIndex: 'endedAt',
      width: 130,
      render: (v: string) => v ? dayjs(v).format('MM-DD HH:mm:ss') : '-',
    },
  ];



  return (
    <div style={{ padding: 24 }}>
      <Space style={{ marginBottom: 16 }} size="middle">
        <RangePicker
          value={range}
          onChange={(dates) => {
            if (dates && dates[0] && dates[1]) {
              setRange([dates[0], dates[1]]);
            }
          }}
        />
        <Select
          allowClear
          style={{ width: 150 }}
          placeholder="选择客服"
          value={agentId}
          onChange={(v) => setAgentId(v)}
          options={agents.map((a) => ({ label: a.displayName, value: a.agentId }))}
        />
      </Space>

      <Card title="客服人员统计" style={{ marginBottom: 16 }}>
        <Spin spinning={agentSummaryLoading}>
          <Table
            rowKey="agentId"
            size="small"
            pagination={false}
            dataSource={agentSummary}
            columns={[
              { title: '客服', dataIndex: 'agentName', width: 80, ellipsis: true },
              { title: '会话数', dataIndex: 'sessionCount', width: 70, sorter: (a, b) => a.sessionCount - b.sessionCount },
              { title: '平均首次响应', dataIndex: 'avgFirstResponseTime', width: 90, render: (v: number | null) => formatTime(v) },
              { title: '平均响应', dataIndex: 'avgResponseTime', width: 90, render: (v: number | null) => formatTime(v) },
              { title: '平均对话时长', dataIndex: 'avgResolutionTime', width: 100, render: (v: number | null) => formatTime(v) },
              { title: '平均消息数', dataIndex: 'avgMessagesPerSession', width: 90 },
            ]}
            scroll={{ x: 580 }}
          />
        </Spin>
      </Card>

      <Card title="会话明细">
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
            }}
            onChange={(pagination, _filters, sorter) => {
              // 处理分页
              const p = pagination.current || 1;
              const ps = pagination.pageSize || 20;
              if (ps !== pageSize) {
                setPageSizeCB(ps);
                setPage(1);
              } else if (p !== page) {
                setPage(p);
              }
              // 处理排序
              if (!Array.isArray(sorter) && sorter.field) {
                setSortBy(sorter.field as string);
                setSortOrder(sorter.order === 'ascend' ? 'asc' : 'desc');
              }
            }}
            scroll={{ x: 955 }}
          />
        </Spin>
      </Card>
    </div>
  );
}
