import { useEffect, useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, DatePicker, Table, Typography, Spin, message, Select, Space, Button } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import dayjs from 'dayjs';
import { fetchUdescMetrics, fetchAgents, fetchUdescAgentMetricsSummary, type AgentMetricsSummary } from '../api/udesc';
import type { UdescSessionMetrics, AgentProfile } from '../types/udesc';

const { RangePicker } = DatePicker;

export function MetricsPage() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<{ records: UdescSessionMetrics[]; total: number } | null>(null);
  const [agents, setAgents] = useState<AgentProfile[]>([]);
  const [range, setRange] = useState<[dayjs.Dayjs, dayjs.Dayjs]>(() => {
    const end = dayjs();
    const start = end.subtract(30, 'day');
    return [start.startOf('day'), end.endOf('day')];
  });
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [agentId, setAgentId] = useState<string | undefined>();
  const [sortBy, setSortBy] = useState<string>('sessionId');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');
  const [agentFilter, setAgentFilter] = useState<string[] | null>(null);
  const [agentSummary, setAgentSummary] = useState<AgentMetricsSummary[]>([]);
  const [agentSummaryLoading, setAgentSummaryLoading] = useState(false);
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

  const loadAgents = async () => {
    try {
      const resp = await fetchAgents();
      setAgents(resp.filter((a) => a.enabled));
    } catch {
      // ignore
    }
  };

  const loadData = async () => {
    setLoading(true);
    try {
      const resp = await fetchUdescMetrics({
        startDate: apiRange.startDateIso,
        endDate: apiRange.endDateIso,
        agentId,
        agentIds: agentFilter && agentFilter.length > 0 ? agentFilter.join(',') : undefined,
        page,
        pageSize,
        sortBy,
        sortOrder,
      });
      setData(resp);
    } catch {
      message.error('加载指标数据失败');
    } finally {
      setLoading(false);
    }
  };

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

  useEffect(() => {
    loadAgents();
    loadAgentSummary();
  }, []);

  useEffect(() => {
    loadData();
    loadAgentSummary();
  }, [apiRange.startDateIso, apiRange.endDateIso, page, pageSize, agentId, agentFilter, sortBy, sortOrder]);

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
      width: 120,
      ellipsis: true,
      sorter: true,
      sortOrder: sortBy === 'sessionId' ? (sortOrder === 'asc' ? 'ascend' : 'descend') : null,
      render: (sessionId: string) => (
        <Typography.Link
          onClick={() => navigate(`/udesc/sessions?highlightSessionId=${sessionId}`)}
          style={{ cursor: 'pointer' }}
        >
          {sessionId}
        </Typography.Link>
      ),
    },
    {
      title: '首次响应',
      dataIndex: 'firstResponseTime',
      width: 100,
      render: (v: number | null) => formatTime(v),
      sorter: true,
      sortOrder: sortBy === 'firstResponseTime' ? (sortOrder === 'asc' ? 'ascend' : 'descend') : null,
    },
    {
      title: '平均响应',
      dataIndex: 'avgResponseTime',
      width: 100,
      render: (v: number | null) => formatTime(v),
      sorter: true,
      sortOrder: sortBy === 'avgResponseTime' ? (sortOrder === 'asc' ? 'ascend' : 'descend') : null,
    },
    {
      title: '等待时间',
      dataIndex: 'waitTime',
      width: 100,
      render: (v: number | null) => formatTime(v),
      sorter: true,
      sortOrder: sortBy === 'waitTime' ? (sortOrder === 'asc' ? 'ascend' : 'descend') : null,
    },
    {
      title: '解决时间',
      dataIndex: 'resolutionTime',
      width: 100,
      render: (v: number | null) => formatTime(v),
      sorter: true,
      sortOrder: sortBy === 'resolutionTime' ? (sortOrder === 'asc' ? 'ascend' : 'descend') : null,
    },
    {
      title: '消息数',
      dataIndex: 'messageCount',
      width: 80,
      render: (v: number) => v ?? 0,
      sorter: true,
      sortOrder: sortBy === 'messageCount' ? (sortOrder === 'asc' ? 'ascend' : 'descend') : null,
    },
    {
      title: '客服消息',
      dataIndex: 'agentMessageCount',
      width: 80,
      render: (v: number) => v ?? 0,
      sorter: true,
      sortOrder: sortBy === 'agentMessageCount' ? (sortOrder === 'asc' ? 'ascend' : 'descend') : null,
    },
    {
      title: '客户消息',
      dataIndex: 'customerMessageCount',
      width: 80,
      render: (v: number) => v ?? 0,
      sorter: true,
      sortOrder: sortBy === 'customerMessageCount' ? (sortOrder === 'asc' ? 'ascend' : 'descend') : null,
    },
    {
      title: '客服人员',
      dataIndex: 'agentName',
      width: 120,
      render: (name: string | null, record) => name || record.session?.agentId || '-',
      filters: agentFilterOptions.map((a) => ({ text: a.name, value: a.id })),
      filteredValue: agentFilter,
      onFilter: () => true, // 前端不过滤，由后端处理
    },
    {
      title: '会话开始时间',
      dataIndex: 'startedAt',
      width: 170,
      sorter: true,
      render: (d: string | undefined) => (d ? dayjs(d).format('YYYY-MM-DD HH:mm:ss') : '-'),
    },
    {
      title: '会话结束时间',
      dataIndex: 'endedAt',
      width: 170,
      sorter: true,
      render: (d: string | undefined) => (d ? dayjs(d).format('YYYY-MM-DD HH:mm:ss') : '-'),
    },
    {
      title: '会话时长',
      dataIndex: 'sessionDuration',
      width: 100,
      sorter: true,
      render: (duration: number | null) => {
        if (duration == null) return '-';
        if (duration < 60) return `${duration}秒`;
        if (duration < 3600) return `${Math.floor(duration / 60)}分${duration % 60}秒`;
        const hours = Math.floor(duration / 3600);
        const mins = Math.floor((duration % 3600) / 60);
        return `${hours}小时${mins}分`;
      },
    },
  ];

  const agentOptions = [
    { label: '全部客服', value: undefined },
    ...agents.map((a) => ({ label: a.displayName || a.agentId, value: a.agentId })),
  ];

  return (
    <div style={{ padding: 24 }}>
      <Typography.Title level={4}>会话性能指标</Typography.Title>

      <Card style={{ marginBottom: 16 }}>
        <Space wrap>
          <RangePicker
            value={range}
            onChange={(dates) => dates && setRange(dates as [dayjs.Dayjs, dayjs.Dayjs])}
            presets={[
              { label: '近7天', value: () => [dayjs().subtract(6, 'day').startOf('day'), dayjs().endOf('day')] as [dayjs.Dayjs, dayjs.Dayjs] },
              { label: '近30天', value: () => [dayjs().subtract(29, 'day').startOf('day'), dayjs().endOf('day')] as [dayjs.Dayjs, dayjs.Dayjs] },
            ]}
          />
          <Select
            options={agentOptions}
            value={agentId}
            onChange={(val) => { setAgentId(val); setPage(1); }}
            style={{ width: 200 }}
            placeholder="选择客服"
            allowClear
          />
          <Button onClick={() => { setAgentId(undefined); setPage(1); }}>
            重置
          </Button>
        </Space>
      </Card>

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
              onChange: (p, ps) => {
                setPage(p);
                setPageSize(ps);
              },
            }}
            scroll={{ x: 1100 }}
            onChange={(pagination, filters, sorter) => {
              // 处理客服人员筛选
              const agentFilterValue = filters.agentName as string[] | null;
              setAgentFilter(agentFilterValue);
              
              if (Array.isArray(sorter)) return;
              const field = sorter.field as string;
              const order = sorter.order;
              if (field && order) {
                setSortBy(field);
                setSortOrder(order === 'ascend' ? 'asc' : 'desc');
                setPage(1); // 排序变化时重置页码
              }
              setPage(1); // 筛选变化时也重置页码
            }}
          />
        </Spin>
      </Card>
    </div>
  );
}
