import { useEffect, useState, useMemo, useCallback, useRef } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Card, DatePicker, Table, Typography, Spin, message, Select, Space, Button, Row, Col, Statistic, Tag, Progress, Modal, Descriptions } from 'antd';
import type { ColumnsType, TablePaginationConfig } from 'antd/es/table';
import dayjs from 'dayjs';
import ReactECharts from 'echarts-for-react';
import {
  fetchUdescTickets,
  fetchUdescTicketSummary,
  fetchUdescTicketDailyStats,
  fetchAgents,
  type UdescTicket,
  type UdescTicketListResp,
  type UdescTicketSummary,
  type UdescTicketDailyStats,
} from '../../api/udesc';
import type { AgentProfile } from '../../types/udesc';

const { RangePicker } = DatePicker;

export function TicketsPage() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  // 状态
  const [loading, setLoading] = useState(false);
  const [summaryLoading, setSummaryLoading] = useState(false);
  const [dailyLoading, setDailyLoading] = useState(false);
  const [data, setData] = useState<UdescTicketListResp | null>(null);
  const [summary, setSummary] = useState<UdescTicketSummary | null>(null);
  const [dailyStats, setDailyStats] = useState<UdescTicketDailyStats | null>(null);
  const [agents, setAgents] = useState<AgentProfile[]>([]);

  const [range, setRange] = useState<[dayjs.Dayjs, dayjs.Dayjs]>(() => {
    const end = dayjs();
    const start = end.subtract(30, 'day');
    return [start.startOf('day'), end.endOf('day')];
  });

  const [statusFilter, setStatusFilter] = useState<string | undefined>();
  const [assigneeFilter, setAssigneeFilter] = useState<string | undefined>();
  const [sortBy, setSortBy] = useState<string>('createdAt');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');
  const [selectedTicket, setSelectedTicket] = useState<UdescTicket | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);

  // 从 URL 初始化分页状态
  const pageFromUrl = parseInt(searchParams.get('page') || '1', 10);
  const pageSizeFromUrl = parseInt(searchParams.get('pageSize') || '20', 10);
  const [page, setPageState] = useState(pageFromUrl);
  const [pageSize, setPageSizeState] = useState(pageSizeFromUrl);

  const stateRef = useRef({ page, pageSize, sortBy, sortOrder, statusFilter, assigneeFilter, range });
  stateRef.current = { page, pageSize, sortBy, sortOrder, statusFilter, assigneeFilter, range };

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

  // 加载工单列表
  const loadData = useCallback(async (p: number, ps: number) => {
    const { sortBy, sortOrder, statusFilter, assigneeFilter, range } = stateRef.current;
    setLoading(true);
    try {
      const resp = await fetchUdescTickets({
        startDate: range[0].startOf('day').format('YYYY-MM-DDTHH:mm:ss.SSSZ'),
        endDate: range[1].endOf('day').format('YYYY-MM-DDTHH:mm:ss.SSSZ'),
        status: statusFilter,
        assigneeId: assigneeFilter,
        sortBy,
        sortOrder,
        page: p,
        pageSize: ps,
      });
      setData(resp);
    } catch {
      message.error('加载工单数据失败');
    } finally {
      setLoading(false);
    }
  }, []);

  // 加载汇总数据
  const loadSummary = useCallback(async () => {
    setSummaryLoading(true);
    try {
      const resp = await fetchUdescTicketSummary({
        startDate: apiRange.startDateIso,
        endDate: apiRange.endDateIso,
      });
      setSummary(resp);
    } catch {
      // ignore
    } finally {
      setSummaryLoading(false);
    }
  }, [apiRange.startDateIso, apiRange.endDateIso]);

  // 加载每日统计
  const loadDailyStats = useCallback(async () => {
    setDailyLoading(true);
    try {
      const resp = await fetchUdescTicketDailyStats({
        startDate: range[0].format('YYYY-MM-DD'),
        endDate: range[1].format('YYYY-MM-DD'),
      });
      setDailyStats(resp);
    } catch {
      // ignore
    } finally {
      setDailyLoading(false);
    }
  }, [apiRange.startDateIso, apiRange.endDateIso]);

  // 初始加载
  useEffect(() => {
    loadData(page, pageSize);
    loadSummary();
    loadDailyStats();
  }, [apiRange.startDateIso, apiRange.endDateIso, page, pageSize, sortBy, sortOrder, statusFilter, assigneeFilter]);

  // 表格分页/排序/筛选变化
  const handleTableChange = (pagination: TablePaginationConfig, filters: any, sorter: any) => {
    if (pagination.current) setPage(pagination.current);
    if (pagination.pageSize) setPageSizeCB(pagination.pageSize);
    if (sorter.field) {
      setSortBy(sorter.field);
      setSortOrder(sorter.order === 'ascend' ? 'asc' : 'desc');
    }
    // 处理列筛选
    if (filters.status) {
      setStatusFilter(filters.status[0]);
    } else {
      setStatusFilter(undefined);
    }
    if (filters.assigneeName) {
      setAssigneeFilter(filters.assigneeName[0]);
    } else {
      setAssigneeFilter(undefined);
    }
  };

  // 状态映射
  const statusColorMap: Record<string, string> = {
    '开启': 'blue',
    '解决中': 'processing',
    '已解决': 'green',
    '已关闭': 'default',
  };


  // 列定义
  const columns: ColumnsType<UdescTicket> = [
    {
      title: '工单编号',
      dataIndex: 'fieldNum',
      width: 120,
      sorter: true,
      render: (v: string) => v || '-',
    },
    {
      title: '主题',
      dataIndex: 'subject',
      ellipsis: true,
      render: (v: string) => v || '-',
    },
    {
      title: '状态',
      dataIndex: 'status',
      width: 100,
      sorter: true,
      filters: [
        { text: '开启', value: '开启' },
        { text: '解决中', value: '解决中' },
        { text: '已解决', value: '已解决' },
        { text: '已关闭', value: '已关闭' },
      ],
      filteredValue: statusFilter ? [statusFilter] : null,
      render: (v: string) => v ? <Tag color={statusColorMap[v] || 'default'}>{v}</Tag> : '-',
    },
    {
      title: '受理人',
      dataIndex: 'assigneeName',
      width: 100,
      sorter: true,
      filters: agents.map(a => ({ text: a.displayName, value: a.agentId })),
      filteredValue: assigneeFilter ? [assigneeFilter] : null,
      render: (v: string) => v || '-',
    },
    {
      title: '用户',
      dataIndex: 'userName',
      width: 100,
      sorter: true,
      render: (v: string) => v || '-',
    },
    {
      title: '满意度',
      dataIndex: 'satisfaction',
      width: 80,
      sorter: true,
      render: (v: number | null) => v !== null && v !== undefined ? `${v}%` : '-',
    },
    {
      title: '创建时间',
      dataIndex: 'createdAt',
      width: 160,
      sorter: true,
      render: (v: string | null) => v ? dayjs(v).format('MM-DD HH:mm') : '-',
    },
    {
      title: '首次响应',
      dataIndex: 'firstRepliedAt',
      width: 160,
      sorter: true,
      render: (v: string | null) => v ? dayjs(v).format('MM-DD HH:mm') : '-',
    },
    {
      title: '解决时间',
      dataIndex: 'resolvedAt',
      width: 160,
      sorter: true,
      render: (v: string | null) => v ? dayjs(v).format('MM-DD HH:mm') : '-',
    },
  ];

  // 每日趋势图配置
  const chartOption = useMemo(() => {
    if (!dailyStats) return {};
    const days = dailyStats.days.map(d => d.slice(5));
    return {
      tooltip: { trigger: 'axis' },
      grid: { left: '3%', right: '4%', bottom: '3%', containLabel: true },
      xAxis: { type: 'category', data: days },
      yAxis: { type: 'value' },
      series: [
        { name: '创建', type: 'line', data: dailyStats.created, smooth: true, itemStyle: { color: '#1890ff' }, areaStyle: { color: 'rgba(24,144,255,0.1)' } },
      ],
    };
  }, [dailyStats]);

  return (
    <div style={{ padding: 24 }}>
      <div className="page-header" style={{ marginBottom: 24, position: 'relative' }}>
        <Typography.Title level={4} style={{ margin: 0 }}>工单分析</Typography.Title>
        <Typography.Text type="secondary">工单处理效率与状态分析</Typography.Text>
      </div>

      {/* 筛选区 */}
      <Card size="small" style={{ marginBottom: 16 }}>
        <Space wrap>
          <RangePicker
            value={range}
            onChange={(dates) => dates && setRange(dates as [dayjs.Dayjs, dayjs.Dayjs])}
            allowClear={false}
          />
          <Select
            placeholder="状态筛选"
            allowClear
            style={{ width: 120 }}
            value={statusFilter}
            onChange={setStatusFilter}
            options={[
              { label: '开启', value: '开启' },
              { label: '解决中', value: '解决中' },
              { label: '已解决', value: '已解决' },
              { label: '已关闭', value: '已关闭' },
            ]}
          />
          <Select
            placeholder="受理人筛选"
            allowClear
            showSearch
            style={{ width: 150 }}
            value={assigneeFilter}
            onChange={setAssigneeFilter}
            options={agents.map((a) => ({ label: a.displayName || a.agentId, value: a.agentId }))}
          />
          <Button onClick={() => { setPage(1); loadData(1, pageSize); }}>刷新</Button>
        </Space>
      </Card>

      {/* 汇总指标 */}
      <Spin spinning={summaryLoading}>
        <Row gutter={16} style={{ marginBottom: 16 }}>
          <Col span={4}>
            <Card size="small">
              <Statistic title="总工单数" value={summary?.total ?? 0} />
            </Card>
          </Col>
          <Col span={4}>
            <Card size="small">
<Statistic title="已解决" value={summary?.byStatus['已解决'] ?? 0} />
            </Card>
          </Col>
          <Col span={4}>
            <Card size="small">
              <Statistic
                title="解决率"
                value={
                  summary?.total
                    ? (
                        (summary.byStatus['已解决'] ?? 0) /
                        summary.total *
                        100
                      ).toFixed(1)
                    : '0'
                }
                suffix="%"
              />
            </Card>
          </Col>
          <Col span={4}>
            <Card size="small">
              <Statistic title="开启" value={summary?.byStatus['开启'] ?? summary?.byStatus['新工单'] ?? 0} />
            </Card>
          </Col>
          <Col span={4}>
            <Card size="small">
              <Statistic title="解决中" value={summary?.byStatus['解决中'] ?? summary?.byStatus['受理中'] ?? 0} />
            </Card>
          </Col>
          <Col span={4}>
            <Card size="small">
              <Statistic title="已关闭" value={summary?.byStatus['已关闭'] ?? 0} />
            </Card>
          </Col>
        </Row>
      </Spin>

      {/* 每日趋势图 */}
      <Card title="每日趋势" size="small" style={{ marginBottom: 16 }}>
        <Spin spinning={dailyLoading}>
          {dailyStats && (
            <ReactECharts option={chartOption} style={{ height: 200 }} />
          )}
        </Spin>
      </Card>

      {/* 受理人排名 */}
      {summary?.byAssignee && summary.byAssignee.length > 0 && (
        <Card title="受理人工作量 Top 10" size="small" style={{ marginBottom: 16 }}>
          <Row gutter={[8, 8]}>
            {summary.byAssignee.slice(0, 10).map((a, i) => (
              <Col span={4} key={a.assigneeId || i}>
                <Card size="small" style={{ background: i < 3 ? '#f6ffed' : undefined }}>
                  <div style={{ fontWeight: 500, marginBottom: 4 }}>
                    {i < 3 && <Tag color={i === 0 ? 'gold' : i === 1 ? 'silver' : 'default'}>Top {i + 1}</Tag>}
                    {a.assigneeName || '未知'}
                  </div>
                  <div style={{ fontSize: 20 }}>{a.count}</div>
                </Card>
              </Col>
            ))}
          </Row>
        </Card>
      )}

      {/* 工单列表 */}
      <Card title="工单列表" size="small">
        <Table<UdescTicket>
          rowKey="id"
          columns={columns}
          dataSource={data?.records ?? []}
          loading={loading}
          pagination={{
            current: page,
            pageSize,
            total: data?.total ?? 0,
            showSizeChanger: true,
            showQuickJumper: true,
            showTotal: (total) => `共 ${total} 条`,
          }}
          onChange={handleTableChange}
          onRow={(record) => ({
            onClick: () => {
              setSelectedTicket(record);
              setDetailOpen(true);
            },
            style: { cursor: 'pointer' },
          })}
          size="small"
          scroll={{ x: 1200 }}
        />
      </Card>

      {/* 工单详情弹窗 */}
      <Modal
        title={`工单详情 - ${selectedTicket?.fieldNum || selectedTicket?.id}`}
        open={detailOpen}
        onCancel={() => setDetailOpen(false)}
        footer={null}
        width={720}
      >
        {selectedTicket && (
          <Descriptions column={2} bordered size="small">
            <Descriptions.Item label="工单编号">{selectedTicket.fieldNum || '-'}</Descriptions.Item>
            <Descriptions.Item label="来源">{selectedTicket.source || '-'}</Descriptions.Item>
            <Descriptions.Item label="主题" span={2}>{selectedTicket.subject || '-'}</Descriptions.Item>
            <Descriptions.Item label="状态">
              {selectedTicket.status ? <Tag color={statusColorMap[selectedTicket.status] || 'default'}>{selectedTicket.status}</Tag> : '-'}
            </Descriptions.Item>
            <Descriptions.Item label="受理人">{selectedTicket.assigneeName || '-'}</Descriptions.Item>
            <Descriptions.Item label="用户">{selectedTicket.userName || '-'}</Descriptions.Item>
            <Descriptions.Item label="用户组">{selectedTicket.userGroupName || '-'}</Descriptions.Item>
            <Descriptions.Item label="满意度">
              {selectedTicket.satisfaction !== null && selectedTicket.satisfaction !== undefined
                ? `${selectedTicket.satisfaction}%`
                : '-'}
            </Descriptions.Item>
            <Descriptions.Item label="创建时间">
              {selectedTicket.createdAt ? dayjs(selectedTicket.createdAt).format('YYYY-MM-DD HH:mm:ss') : '-'}
            </Descriptions.Item>
            <Descriptions.Item label="首次响应">
              {selectedTicket.firstRepliedAt ? dayjs(selectedTicket.firstRepliedAt).format('YYYY-MM-DD HH:mm:ss') : '-'}
            </Descriptions.Item>
            <Descriptions.Item label="解决时间">
              {selectedTicket.resolvedAt ? dayjs(selectedTicket.resolvedAt).format('YYYY-MM-DD HH:mm:ss') : '-'}
            </Descriptions.Item>
            <Descriptions.Item label="关闭时间">
              {selectedTicket.closedAt ? dayjs(selectedTicket.closedAt).format('YYYY-MM-DD HH:mm:ss') : '-'}
            </Descriptions.Item>
          </Descriptions>
        )}
      </Modal>
    </div>
  );
}
