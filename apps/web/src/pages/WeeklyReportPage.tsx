import { useState, useEffect } from 'react';
import { Card, DatePicker, Space, Table, Tag, Button, message, Statistic, Row, Col, Select } from 'antd';
import { ReloadOutlined, CalendarOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import type { ColumnsType } from 'antd/es/table';

const { RangePicker } = DatePicker;

interface WeeklyReport {
  id: string;
  weekStart: string;
  weekEnd: string;
  title: string;
  author: string;
  status: 'draft' | 'published';
  createdAt: string;
}

export function WeeklyReportPage() {
  const [reports, setReports] = useState<WeeklyReport[]>([]);
  const [loading, setLoading] = useState(false);
  const [dateRange, setDateRange] = useState<[dayjs.Dayjs | null, dayjs.Dayjs | null] | null>(null);

  const fetchReports = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (dateRange?.[0]) params.append('startDate', dateRange[0].toISOString());
      if (dateRange?.[1]) params.append('endDate', dateRange[1].toISOString());
      const resp = await fetch(`/api/v1/weekly-reports?${params}`);
      const data = await resp.json();
      setReports(data.items || []);
    } catch (err) {
      console.error('获取周报失败:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchReports();
  }, [dateRange]);

  const columns: ColumnsType<WeeklyReport> = [
    {
      title: '标题',
      dataIndex: 'title',
      key: 'title',
    },
    {
      title: '周次',
      key: 'week',
      width: 200,
      render: (_, record) =>
        `${dayjs(record.weekStart).format('MM/DD')} - ${dayjs(record.weekEnd).format('MM/DD')}`,
    },
    {
      title: '作者',
      dataIndex: 'author',
      key: 'author',
      width: 120,
    },
    {
      title: '状态',
      dataIndex: 'status',
      key: 'status',
      width: 100,
      render: (val: string) => (
        <Tag color={val === 'published' ? 'green' : 'default'}>
          {val === 'published' ? '已发布' : '草稿'}
        </Tag>
      ),
    },
    {
      title: '创建时间',
      dataIndex: 'createdAt',
      key: 'createdAt',
      width: 180,
      render: (val: string) => dayjs(val).format('YYYY-MM-DD HH:mm'),
    },
  ];

  return (
    <div>
      <Row gutter={16} style={{ marginBottom: 16 }}>
        <Col span={6}>
          <Card>
            <Statistic title="本周周报" value={reports.length} prefix={<CalendarOutlined />} />
          </Card>
        </Col>
      </Row>

      <Card
        title="周报列表"
        extra={
          <Space>
            <RangePicker
              value={dateRange}
              onChange={(dates) => setDateRange(dates)}
            />
            <Button icon={<ReloadOutlined />} onClick={fetchReports}>
              刷新
            </Button>
          </Space>
        }
      >
        <Table
          columns={columns}
          dataSource={reports}
          rowKey="id"
          loading={loading}
          pagination={{ pageSize: 20, showTotal: (total) => `共 ${total} 条` }}
        />
      </Card>
    </div>
  );
}
