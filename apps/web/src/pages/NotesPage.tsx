import { useState, useEffect } from 'react';
import { Card, DatePicker, Table, Typography, Spin, Alert, message } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import dayjs from 'dayjs';
import { fetchNotesData, NoteRecord } from '../api/udesc';

const { RangePicker } = DatePicker;
const { Title, Text } = Typography;

export function NotesPage() {
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<NoteRecord[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);
  const [error, setError] = useState<string | null>(null);
  const [dateRange, setDateRange] = useState<[dayjs.Dayjs, dayjs.Dayjs]>([
    dayjs(),
    dayjs(),
  ]);

  const columns: ColumnsType<NoteRecord> = [
    { title: 'ID', dataIndex: 'id', key: 'id', width: 100 },
    { title: '时间', dataIndex: 'time', key: 'time', width: 180 },
    { title: '客服', dataIndex: 'agent', key: 'agent', width: 100 },
    { title: '客户', dataIndex: 'customer', key: 'customer', width: 200, ellipsis: true },
    { title: '问题类型_1', dataIndex: 'problemType1', key: 'problemType1', width: 120 },
    { title: '问题类型_2', dataIndex: 'problemType2', key: 'problemType2', width: 160 },
    { title: '问题类型_3', dataIndex: 'problemType3', key: 'problemType3', width: 200, ellipsis: true },
  ];

  const loadData = async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await fetchNotesData({
        startDate: dateRange[0].format('YYYY-MM-DD'),
        endDate: dateRange[1].format('YYYY-MM-DD'),
        page,
        perPage: pageSize,
      });
      setData(result.records);
      setTotal(result.total);
    } catch (err: any) {
      setError(err.message || '加载数据失败');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [dateRange, page, pageSize]);

  return (
    <div style={{ padding: 24 }}>
      <div className="page-header" style={{ marginBottom: 24 }}>
        <Title level={4} style={{ margin: 0 }}>业务记录</Title>
        <Text type="secondary">业务记录列表，问题类型按级联字段逐级展开，数据实时从 Udesk API 获取</Text>
      </div>

      <Card size="small" style={{ marginBottom: 16 }}>
        <RangePicker
          value={dateRange}
          onChange={(dates) => {
            if (dates) {
              setDateRange(dates as [dayjs.Dayjs, dayjs.Dayjs]);
              setPage(1);
            }
          }}
          allowClear={false}
        />
      </Card>

      {loading ? (
        <div style={{ textAlign: 'center', padding: 100 }}>
          <Spin size="large" />
        </div>
      ) : error ? (
        <Alert type="error" message={error} showIcon />
      ) : (
        <Table
          columns={columns}
          dataSource={data}
          rowKey="id"
          scroll={{ x: 1000 }}
          pagination={{
            current: page,
            pageSize,
            total,
            showSizeChanger: true,
            showTotal: (t) => `共 ${t} 条`,
            onChange: (p, ps) => {
              setPage(p);
              setPageSize(ps);
            },
          }}
          size="small"
        />
      )}
    </div>
  );
}
