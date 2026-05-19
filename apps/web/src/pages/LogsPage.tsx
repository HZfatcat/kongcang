import { useState, useEffect } from 'react';
import {
  Table, Card, Select, DatePicker, Input, Space, Tag, Button, Modal, Descriptions,
  Statistic, Row, Col, Tooltip, message, Popconfirm,
} from 'antd';
import {
  SearchOutlined, ReloadOutlined, DeleteOutlined,
  InfoCircleOutlined, WarningOutlined, CloseCircleOutlined,
  BugOutlined, ExclamationCircleOutlined,
} from '@ant-design/icons';
import dayjs from 'dayjs';
import type { ColumnsType } from 'antd/es/table';

const { RangePicker } = DatePicker;
const { Option } = Select;

interface SystemLog {
  id: string;
  timestamp: string;
  level: 'debug' | 'info' | 'warn' | 'error';
  module?: string;
  source?: string;
  action?: string;
  message: string;
  context?: Record<string, unknown>;
  userId?: string;
  correlationId?: string;
  duration?: number;
}

interface LogStats {
  total: number;
  byLevel: Record<string, number>;
  byModule: Record<string, number>;
}

export function LogsPage() {
  const [logs, setLogs] = useState<SystemLog[]>([]);
  const [loading, setLoading] = useState(false);
  const [stats, setStats] = useState<LogStats | null>(null);
  const [level, setLevel] = useState<string>();
  const [module, setModule] = useState<string>();
  const [source, setSource] = useState<string>();
  const [dateRange, setDateRange] = useState<[dayjs.Dayjs | null, dayjs.Dayjs | null] | null>(null);
  const [search, setSearch] = useState('');
  const [pagination, setPagination] = useState({ current: 1, pageSize: 50, total: 0 });
  const [detailLog, setDetailLog] = useState<SystemLog | null>(null);

  const fetchLogs = async (page = 1) => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (level) params.append('level', level);
      if (module) params.append('module', module);
      if (source) params.append('source', source);
      if (dateRange?.[0]) params.append('startDate', dateRange[0].toISOString());
      if (dateRange?.[1]) params.append('endDate', dateRange[1].toISOString());
      if (search) params.append('search', search);
      params.append('page', String(page));
      params.append('pageSize', String(pagination.pageSize));

      const resp = await fetch(`/api/v1/logs?${params}`);
      const data = await resp.json();
      setLogs(data.items);
      setPagination(prev => ({ ...prev, current: page, total: data.total }));
    } catch (err) {
      console.error('Failed to fetch logs:', err);
    } finally {
      setLoading(false);
    }
  };

  const fetchStats = async () => {
    try {
      const params = new URLSearchParams();
      if (dateRange?.[0]) params.append('startDate', dateRange[0].toISOString());
      if (dateRange?.[1]) params.append('endDate', dateRange[1].toISOString());

      const resp = await fetch(`/api/v1/logs/stats?${params}`);
      const data = await resp.json();
      setStats(data);
    } catch (err) {
      console.error('Failed to fetch stats:', err);
    }
  };

  const clearLogs = async (beforeDays: number) => {
    try {
      const resp = await fetch(`/api/v1/logs/clear?beforeDays=${beforeDays}`, { method: 'DELETE' });
      const data = await resp.json();
      message.success(`已删除 ${data.deleted} 条日志`);
      fetchLogs(1);
      fetchStats();
    } catch (err) {
      message.error('清理日志失败');
    }
  };

  useEffect(() => {
    fetchLogs(1);
    fetchStats();
  }, [level, module, source, dateRange]);

  const handleSearch = () => {
    fetchLogs(1);
  };

  const handleTableChange = (newPagination: { current?: number }) => {
    fetchLogs(newPagination.current);
  };

  const handleReset = () => {
    setLevel(undefined);
    setModule(undefined);
    setSource(undefined);
    setDateRange(null);
    setSearch('');
  };

  const getLevelIcon = (logLevel: string) => {
    switch (logLevel) {
      case 'debug':
        return <BugOutlined style={{ color: '#8c8c8c' }} />;
      case 'info':
        return <InfoCircleOutlined style={{ color: '#1890ff' }} />;
      case 'warn':
        return <WarningOutlined style={{ color: '#faad14' }} />;
      case 'error':
        return <CloseCircleOutlined style={{ color: '#ff4d4f' }} />;
      default:
        return <InfoCircleOutlined />;
    }
  };

  const getLevelColor = (logLevel: string) => {
    switch (logLevel) {
      case 'debug':
        return 'default';
      case 'info':
        return 'blue';
      case 'warn':
        return 'orange';
      case 'error':
        return 'red';
      default:
        return 'default';
    }
  };

  const columns: ColumnsType<SystemLog> = [
    {
      title: '时间',
      dataIndex: 'timestamp',
      key: 'timestamp',
      width: 180,
      render: (val: string) => dayjs(val).format('YYYY-MM-DD HH:mm:ss'),
      sorter: true,
    },
    {
      title: '级别',
      dataIndex: 'level',
      key: 'level',
      width: 80,
      render: (val: string) => (
        <Tag color={getLevelColor(val)} icon={getLevelIcon(val)}>
          {val.toUpperCase()}
        </Tag>
      ),
      filters: [
        { text: 'DEBUG', value: 'debug' },
        { text: 'INFO', value: 'info' },
        { text: 'WARN', value: 'warn' },
        { text: 'ERROR', value: 'error' },
      ],
    },
    {
      title: '模块',
      dataIndex: 'module',
      key: 'module',
      width: 100,
      render: (val: string) => val || '-',
    },
    {
      title: '来源',
      dataIndex: 'source',
      key: 'source',
      width: 80,
      render: (val: string) => val ? <Tag>{val}</Tag> : '-',
    },
    {
      title: '操作',
      dataIndex: 'action',
      key: 'action',
      width: 100,
      ellipsis: true,
    },
    {
      title: '消息',
      dataIndex: 'message',
      key: 'message',
      ellipsis: true,
      render: (val: string) => (
        <Tooltip title={val}>
          <span>{val}</span>
        </Tooltip>
      ),
    },
    {
      title: '耗时',
      dataIndex: 'duration',
      key: 'duration',
      width: 80,
      render: (val: number) => val ? `${val}ms` : '-',
    },
    {
      title: '操作',
      key: 'action_btn',
      width: 80,
      render: (_, record) => (
        <Button type="link" size="small" onClick={() => setDetailLog(record)}>
          详情
        </Button>
      ),
    },
  ];

  return (
    <div>
      <Row gutter={16} style={{ marginBottom: 16 }}>
        <Col span={4}>
          <Card>
            <Statistic title="总日志数" value={stats?.total || 0} />
          </Card>
        </Col>
        <Col span={4}>
          <Card>
            <Statistic
              title="错误数"
              value={stats?.byLevel?.error || 0}
              valueStyle={{ color: '#ff4d4f' }}
            />
          </Card>
        </Col>
        <Col span={4}>
          <Card>
            <Statistic
              title="警告数"
              value={stats?.byLevel?.warn || 0}
              valueStyle={{ color: '#faad14' }}
            />
          </Card>
        </Col>
        <Col span={4}>
          <Card>
            <Statistic
              title="信息数"
              value={stats?.byLevel?.info || 0}
              valueStyle={{ color: '#1890ff' }}
            />
          </Card>
        </Col>
        <Col span={4}>
          <Card>
            <Statistic
              title="调试数"
              value={stats?.byLevel?.debug || 0}
              valueStyle={{ color: '#8c8c8c' }}
            />
          </Card>
        </Col>
      </Row>

      <Card>
        <Space style={{ marginBottom: 16 }} wrap>
          <Select
            placeholder="日志级别"
            allowClear
            style={{ width: 120 }}
            value={level}
            onChange={setLevel}
          >
            <Option value="debug">DEBUG</Option>
            <Option value="info">INFO</Option>
            <Option value="warn">WARN</Option>
            <Option value="error">ERROR</Option>
          </Select>
          <Select
            placeholder="模块"
            allowClear
            style={{ width: 120 }}
            value={module}
            onChange={setModule}
          >
            {stats?.byModule && Object.keys(stats.byModule).map(m => (
              <Option key={m} value={m}>{m}</Option>
            ))}
          </Select>
          <Select
            placeholder="来源"
            allowClear
            style={{ width: 120 }}
            value={source}
            onChange={setSource}
          >
            <Option value="udesk">Udesk</Option>
            <Option value="zouwu">驺吾</Option>
          </Select>
          <RangePicker
            showTime
            value={dateRange}
            onChange={(dates) => setDateRange(dates)}
          />
          <Input
            placeholder="搜索消息"
            style={{ width: 200 }}
            value={search}
            onChange={e => setSearch(e.target.value)}
            onPressEnter={handleSearch}
          />
          <Button icon={<SearchOutlined />} type="primary" onClick={handleSearch}>
            搜索
          </Button>
          <Button icon={<ReloadOutlined />} onClick={handleReset}>
            重置
          </Button>
          <Popconfirm
            title="确定要清理30天前的日志吗？"
            onConfirm={() => clearLogs(30)}
            okText="确定"
            cancelText="取消"
          >
            <Button danger icon={<DeleteOutlined />}>
              清理日志
            </Button>
          </Popconfirm>
          <Button onClick={() => { fetchLogs(pagination.current); fetchStats(); }}>
            刷新
          </Button>
        </Space>

        <Table
          columns={columns}
          dataSource={logs}
          rowKey="id"
          loading={loading}
          pagination={{
            current: pagination.current,
            pageSize: pagination.pageSize,
            total: pagination.total,
            showSizeChanger: true,
            showQuickJumper: true,
            showTotal: (total) => `共 ${total} 条`,
          }}
          onChange={handleTableChange}
          scroll={{ x: 1200 }}
        />
      </Card>

      <Modal
        title="日志详情"
        open={!!detailLog}
        onCancel={() => setDetailLog(null)}
        footer={null}
        width={800}
      >
        {detailLog && (
          <Descriptions column={2} bordered>
            <Descriptions.Item label="时间">
              {dayjs(detailLog.timestamp).format('YYYY-MM-DD HH:mm:ss')}
            </Descriptions.Item>
            <Descriptions.Item label="级别">
              <Tag color={getLevelColor(detailLog.level)} icon={getLevelIcon(detailLog.level)}>
                {detailLog.level.toUpperCase()}
              </Tag>
            </Descriptions.Item>
            <Descriptions.Item label="模块">{detailLog.module || '-'}</Descriptions.Item>
            <Descriptions.Item label="来源">{detailLog.source || '-'}</Descriptions.Item>
            <Descriptions.Item label="操作">{detailLog.action || '-'}</Descriptions.Item>
            <Descriptions.Item label="耗时">{detailLog.duration ? `${detailLog.duration}ms` : '-'}</Descriptions.Item>
            <Descriptions.Item label="用户ID">{detailLog.userId || '-'}</Descriptions.Item>
            <Descriptions.Item label="关联ID">{detailLog.correlationId || '-'}</Descriptions.Item>
            <Descriptions.Item label="消息" span={2}>
              <div style={{ wordBreak: 'break-all' }}>{detailLog.message}</div>
            </Descriptions.Item>
            {detailLog.context && (
              <Descriptions.Item label="上下文" span={2}>
                <pre style={{ 
                  background: '#f5f5f5', 
                  padding: 8, 
                  borderRadius: 4, 
                  maxHeight: 300, 
                  overflow: 'auto' 
                }}>
                  {JSON.stringify(detailLog.context, null, 2)}
                </pre>
              </Descriptions.Item>
            )}
          </Descriptions>
        )}
      </Modal>
    </div>
  );
}
