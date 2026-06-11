import { useEffect, useState, useMemo, useCallback, useRef } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  Card, DatePicker, Table, Typography, Spin, message, Space, Button, Tag,
  Row, Col, Statistic, Modal, Form, Input, Select, Drawer, Descriptions, Popconfirm,
} from 'antd';
import type { ColumnsType, TablePaginationConfig } from 'antd/es/table';
import dayjs from 'dayjs';
import ReactECharts from 'echarts-for-react';
import {
  PlusOutlined,
  ReloadOutlined,
  EditOutlined,
  DeleteOutlined,
  SyncOutlined,
} from '@ant-design/icons';
import {
  fetchTaskList,
  fetchTaskSummary,
  createTask,
  updateTaskStatus,
  deleteTask,
} from '../api/task';
import type { TaskRecord, TaskStatus, TaskPriority, TaskListResp, TaskSummary } from '../types/task';

const { RangePicker } = DatePicker;
const { Text } = Typography;

const statusLabelMap: Record<TaskStatus, string> = {
  PENDING: '待处理',
  IN_PROGRESS: '进行中',
  REVIEWING: '待审核',
  COMPLETED: '已完成',
  CLOSED: '已关闭',
  CANCELLED: '已取消',
};

const statusColorMap: Record<TaskStatus, string> = {
  PENDING: 'default',
  IN_PROGRESS: 'blue',
  REVIEWING: 'purple',
  COMPLETED: 'green',
  CLOSED: 'gray',
  CANCELLED: 'red',
};

const priorityLabelMap: Record<TaskPriority, string> = {
  LOW: '低',
  MEDIUM: '中',
  HIGH: '高',
  URGENT: '紧急',
};

const priorityColorMap: Record<TaskPriority, string> = {
  LOW: 'green',
  MEDIUM: 'orange',
  HIGH: 'red',
  URGENT: 'magenta',
};

const statusFlow: Record<TaskStatus, TaskStatus[]> = {
  PENDING: ['IN_PROGRESS', 'CANCELLED'],
  IN_PROGRESS: ['REVIEWING', 'PENDING', 'CANCELLED'],
  REVIEWING: ['IN_PROGRESS', 'COMPLETED', 'CANCELLED'],
  COMPLETED: ['CLOSED'],
  CLOSED: [],
  CANCELLED: [],
};

export function TasksPage() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  // 状态
  const [loading, setLoading] = useState(false);
  const [summaryLoading, setSummaryLoading] = useState(false);
  const [data, setData] = useState<TaskListResp | null>(null);
  const [summary, setSummary] = useState<TaskSummary | null>(null);

  const [range, setRange] = useState<[dayjs.Dayjs, dayjs.Dayjs]>(() => {
    const end = dayjs();
    const start = end.subtract(30, 'day');
    return [start.startOf('day'), end.endOf('day')];
  });

  const [statusFilter, setStatusFilter] = useState<TaskStatus | undefined>();
  const [priorityFilter, setPriorityFilter] = useState<TaskPriority | undefined>();
  const [sortBy, setSortBy] = useState<string>('createdAt');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');

  // 分页
  const pageFromUrl = parseInt(searchParams.get('page') || '1', 10);
  const pageSizeFromUrl = parseInt(searchParams.get('pageSize') || '20', 10);
  const [page, setPageState] = useState(pageFromUrl);
  const [pageSize, setPageSizeState] = useState(pageSizeFromUrl);

  const stateRef = useRef({ page, pageSize, sortBy, sortOrder, statusFilter, priorityFilter, range });
  stateRef.current = { page, pageSize, sortBy, sortOrder, statusFilter, priorityFilter, range };

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
      startDate: range[0].startOf('day').format('YYYY-MM-DDTHH:mm:ss.SSSZ'),
      endDate: range[1].endOf('day').format('YYYY-MM-DDTHH:mm:ss.SSSZ'),
    }),
    [range],
  );

  const loadData = useCallback(async (p: number, ps: number) => {
    const { sortBy, sortOrder, statusFilter, priorityFilter, range } = stateRef.current;
    setLoading(true);
    try {
      const resp = await fetchTaskList({
        startDate: range[0].startOf('day').format('YYYY-MM-DDTHH:mm:ss.SSSZ'),
        endDate: range[1].endOf('day').format('YYYY-MM-DDTHH:mm:ss.SSSZ'),
        status: statusFilter,
        priority: priorityFilter,
        sortBy,
        sortOrder,
        page: p,
        pageSize: ps,
      });
      setData(resp);
    } catch {
      message.error('加载任务数据失败');
    } finally {
      setLoading(false);
    }
  }, []);

  const loadSummary = useCallback(async () => {
    setSummaryLoading(true);
    try {
      const resp = await fetchTaskSummary({
        startDate: apiRange.startDate,
        endDate: apiRange.endDate,
      });
      setSummary(resp);
    } catch {
      // ignore
    } finally {
      setSummaryLoading(false);
    }
  }, [apiRange.startDate, apiRange.endDate]);

  useEffect(() => {
    loadData(page, pageSize);
    loadSummary();
  }, [apiRange.startDate, apiRange.endDate, page, pageSize, sortBy, sortOrder, statusFilter, priorityFilter]);

  const handleTableChange = (pagination: TablePaginationConfig, filters: any, sorter: any) => {
    if (pagination.current) setPage(pagination.current);
    if (pagination.pageSize) setPageSizeCB(pagination.pageSize);
    if (sorter.field) {
      setSortBy(sorter.field);
      setSortOrder(sorter.order === 'ascend' ? 'asc' : 'desc');
    }
    if (filters.status) {
      setStatusFilter(filters.status[0] as TaskStatus);
    } else {
      setStatusFilter(undefined);
    }
    if (filters.priority) {
      setPriorityFilter(filters.priority[0] as TaskPriority);
    } else {
      setPriorityFilter(undefined);
    }
  };

  // 创建任务弹窗
  const [createDrawerOpen, setCreateDrawerOpen] = useState(false);
  const [createForm] = Form.useForm();

  const handleCreateTask = async (values: any) => {
    try {
      await createTask({
        title: values.title,
        description: values.description,
        priority: values.priority,
        assigneeName: values.assigneeName,
        taskType: values.taskType,
      });
      message.success('创建成功');
      setCreateDrawerOpen(false);
      createForm.resetFields();
      loadData(page, pageSize);
      loadSummary();
    } catch {
      message.error('创建失败');
    }
  };

  // 状态变更
  const handleStatusChange = async (record: TaskRecord, newStatus: TaskStatus) => {
    try {
      await updateTaskStatus(record.id, { status: newStatus });
      message.success('状态更新成功');
      loadData(page, pageSize);
      loadSummary();
    } catch {
      message.error('状态更新失败');
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await deleteTask(id);
      message.success('删除成功');
      loadData(page, pageSize);
      loadSummary();
    } catch {
      message.error('删除失败');
    }
  };

  // 柱状图配置
  const barChartOption = useMemo(() => {
    if (!summary?.statusBreakdown) return {};
    const statuses: TaskStatus[] = ['PENDING', 'IN_PROGRESS', 'REVIEWING', 'COMPLETED', 'CLOSED', 'CANCELLED'];
    return {
      tooltip: { trigger: 'axis' as const },
      xAxis: {
        type: 'category' as const,
        data: statuses.map(s => statusLabelMap[s]),
        axisLabel: { fontSize: 11 },
      },
      yAxis: { type: 'value' as const },
      series: [{
        type: 'bar' as const,
        data: statuses.map(s => ({
          value: summary.statusBreakdown[s] || 0,
          itemStyle: { color: statusColorMap[s as TaskStatus] },
        })),
        label: { show: true, position: 'top' },
      }],
    };
  }, [summary]);

  const columns: ColumnsType<TaskRecord> = [
    {
      title: '标题',
      dataIndex: 'title',
      ellipsis: true,
      width: 300,
      render: (text: string, record: TaskRecord) => (
        <div>
          <Text strong>{text}</Text>
          {record.taskType && <Tag color="blue" style={{ marginLeft: 8 }}>{record.taskType}</Tag>}
        </div>
      ),
    },
    {
      title: '状态',
      dataIndex: 'status',
      width: 120,
      filters: (Object.keys(statusLabelMap) as TaskStatus[]).map(s => ({ text: statusLabelMap[s], value: s })),
      onFilter: (value, record) => record.status === value,
      render: (status: TaskStatus) => <Tag color={statusColorMap[status]}>{statusLabelMap[status]}</Tag>,
    },
    {
      title: '优先级',
      dataIndex: 'priority',
      width: 100,
      filters: (Object.keys(priorityLabelMap) as TaskPriority[]).map(p => ({ text: priorityLabelMap[p], value: p })),
      onFilter: (value, record) => record.priority === value,
      render: (priority: TaskPriority) => <Tag color={priorityColorMap[priority]}>{priorityLabelMap[priority]}</Tag>,
    },
    {
      title: '负责人',
      dataIndex: 'assigneeName',
      width: 120,
      render: (name: string) => name || '-',
    },
    {
      title: '创建人',
      dataIndex: 'creatorName',
      width: 120,
      render: (name: string) => name || '-',
    },
    {
      title: '创建时间',
      dataIndex: 'createdAt',
      width: 160,
      sorter: true,
      render: (val: string) => val ? dayjs(val).format('YYYY-MM-DD HH:mm') : '-',
    },
    {
      title: '操作',
      width: 280,
      fixed: 'right' as const,
      render: (_: any, record: TaskRecord) => (
        <Space size="small">
          {statusFlow[record.status]?.map(nextStatus => (
            <Button
              key={nextStatus}
              type="link"
              size="small"
              onClick={() => handleStatusChange(record, nextStatus)}
            >
              → {statusLabelMap[nextStatus]}
            </Button>
          ))}
          <Popconfirm title="确定删除？" onConfirm={() => handleDelete(record.id)}>
            <Button type="link" size="small" danger icon={<DeleteOutlined />} />
          </Popconfirm>
        </Space>
      ),
    },
  ];

  return (
    <div>
      {/* 统计卡片 */}
      <Row gutter={[16, 16]} style={{ marginBottom: 16 }}>
        <Col span={4}>
          <Card size="small" loading={summaryLoading}>
            <Statistic title="总任务" value={summary?.total ?? 0} />
          </Card>
        </Col>
        <Col span={4}>
          <Card size="small" loading={summaryLoading}>
            <Statistic title="待处理" value={summary?.pending ?? 0} valueStyle={{ color: '#999' }} />
          </Card>
        </Col>
        <Col span={4}>
          <Card size="small" loading={summaryLoading}>
            <Statistic title="进行中" value={summary?.inProgress ?? 0} valueStyle={{ color: '#1890ff' }} />
          </Card>
        </Col>
        <Col span={4}>
          <Card size="small" loading={summaryLoading}>
            <Statistic title="待审核" value={summary?.reviewing ?? 0} valueStyle={{ color: '#722ed1' }} />
          </Card>
        </Col>
        <Col span={4}>
          <Card size="small" loading={summaryLoading}>
            <Statistic title="已完成" value={summary?.completed ?? 0} valueStyle={{ color: '#52c41a' }} />
          </Card>
        </Col>
        <Col span={4}>
          <Card size="small" loading={summaryLoading}>
            <Statistic title="已关闭/取消" value={(summary?.closed ?? 0) + (summary?.cancelled ?? 0)} valueStyle={{ color: '#ff4d4f' }} />
          </Card>
        </Col>
      </Row>

      {/* 日期选择 + 筛选 + 创建按钮 */}
      <Card size="small" style={{ marginBottom: 16 }}>
        <Space>
          <RangePicker
            value={range}
            onChange={(dates) => {
              if (dates) setRange([dates[0] as dayjs.Dayjs, dates[1] as dayjs.Dayjs]);
            }}
          />
          <Select
            placeholder="状态筛选"
            allowClear
            style={{ width: 140 }}
            value={statusFilter}
            onChange={(v) => setStatusFilter(v as TaskStatus)}
            options={(Object.keys(statusLabelMap) as TaskStatus[]).map(s => ({
              label: statusLabelMap[s],
              value: s,
            }))}
          />
          <Select
            placeholder="优先级筛选"
            allowClear
            style={{ width: 120 }}
            value={priorityFilter}
            onChange={(v) => setPriorityFilter(v as TaskPriority)}
            options={(Object.keys(priorityLabelMap) as TaskPriority[]).map(p => ({
              label: priorityLabelMap[p],
              value: p,
            }))}
          />
          <Button icon={<ReloadOutlined />} onClick={() => { loadData(page, pageSize); loadSummary(); }}>
            刷新
          </Button>
          <Button type="primary" icon={<PlusOutlined />} onClick={() => setCreateDrawerOpen(true)}>
            创建任务
          </Button>
        </Space>
      </Card>

      {/* 任务列表 */}
      <Card title="任务列表" size="small">
        <Table<TaskRecord>
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
          size="small"
          scroll={{ x: 1400 }}
        />
      </Card>

      {/* 创建任务抽屉 */}
      <Drawer
        title="创建任务"
        placement="right"
        width={480}
        open={createDrawerOpen}
        onClose={() => setCreateDrawerOpen(false)}
        extra={
          <Button type="primary" onClick={() => createForm.submit()}>
            确定
          </Button>
        }
      >
        <Form form={createForm} onFinish={handleCreateTask} layout="vertical">
          <Form.Item label="标题" name="title" rules={[{ required: true, message: '请输入标题' }]}>
            <Input placeholder="请输入任务标题" />
          </Form.Item>
          <Form.Item label="描述" name="description">
            <Input.TextArea rows={4} placeholder="请输入任务描述" />
          </Form.Item>
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item label="优先级" name="priority" initialValue="MEDIUM">
                <Select>
                  {(Object.keys(priorityLabelMap) as TaskPriority[]).map(p => (
                    <Select.Option key={p} value={p}>{priorityLabelMap[p]}</Select.Option>
                  ))}
                </Select>
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item label="任务类型" name="taskType">
                <Input placeholder="如: requirement, ticket" />
              </Form.Item>
            </Col>
          </Row>
          <Form.Item label="负责人" name="assigneeName">
            <Input placeholder="请输入负责人姓名" />
          </Form.Item>
        </Form>
      </Drawer>
    </div>
  );
}
