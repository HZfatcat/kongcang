import { useState, useEffect, useMemo, useCallback } from 'react';
import { Card, DatePicker, Table, Typography, Spin, Alert, Row, Col, Statistic, Tag, Button } from 'antd';
import { DownloadOutlined, FileTextOutlined, MessageOutlined, PhoneOutlined, SendOutlined, BarChartOutlined } from '@ant-design/icons';
import type { ColumnsType, TablePaginationConfig } from 'antd/es/table';
import type { FilterValue, SorterResult } from 'antd/es/table/interface';
import dayjs from 'dayjs';
import ReactECharts from 'echarts-for-react';
import { fetchNotesData, NoteRecord } from '../../api/udesc';

const { RangePicker } = DatePicker;
const { Title, Text } = Typography;

const sourceColors: Record<string, string> = {
  im: 'blue', call: 'green', ticket: 'orange',
};
const sourceLabels: Record<string, string> = {
  im: 'IM', call: '呼叫中心', ticket: '工单',
};
const sourceIcons: Record<string, React.ReactNode> = {
  im: <MessageOutlined />, call: <PhoneOutlined />, ticket: <SendOutlined />,
};

function exportNotesCsv(records: NoteRecord[]) {
  const header = 'ID,时间,来源,客服,客户,一级分类,二级分类,三级分类\n';
  const rows = records.map((r) =>
    [
      r.id, r.time,
      sourceLabels[r.source || 'im'] || r.source,
      `"${(r.agent || '').replace(/"/g, '""')}"`,
      `"${(r.customer || '').replace(/"/g, '""')}"`,
      `"${(r.problemType1 || '').replace(/"/g, '""')}"`,
      `"${(r.problemType2 || '').replace(/"/g, '""')}"`,
      `"${(r.problemType3 || '').replace(/"/g, '""')}"`,
    ].join(','),
  );
  const csv = '\uFEFF' + header + rows.join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `业务记录_${dayjs().format('YYYYMMDD_HHmmss')}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

export function NotesPage() {
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<NoteRecord[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);
  const [error, setError] = useState<string | null>(null);
  // 服务端筛选状态
  const [filters, setFilters] = useState<Record<string, FilterValue | null>>({});
  const [category, setCategory] = useState<string | undefined>(undefined);
  const [dateRange, setDateRange] = useState<[dayjs.Dayjs, dayjs.Dayjs]>([
    dayjs().subtract(30, 'day'), dayjs(),
  ]);

  // 根据当前筛选条件计算展示数据
  const filteredData = useMemo(() => {
    let result = data;
    for (const [key, value] of Object.entries(filters)) {
      if (value && value.length > 0) {
        result = result.filter((r) => {
          const recordVal = (r as any)[key];
          return value.includes(recordVal);
        });
      }
    }
    return result;
  }, [data, filters]);

  // 提取各列的筛选选项
  const distinctSources = useMemo(() =>
    Array.from(new Set(data.map((r) => r.source).filter(Boolean))) as string[], [data]);
  const distinctAgents = useMemo(() =>
    Array.from(new Set(data.map((r) => r.agent).filter(Boolean))).sort(), [data]);
  const distinctCustomers = useMemo(() =>
    Array.from(new Set(data.map((r) => r.customer).filter(Boolean))).sort(), [data]);
  const distinctP1 = useMemo(() =>
    Array.from(new Set(data.map((r) => r.problemType1).filter(Boolean))).sort(), [data]);
  const distinctP2 = useMemo(() =>
    Array.from(new Set(data.map((r) => r.problemType2).filter(Boolean))).sort(), [data]);
  const distinctP3 = useMemo(() =>
    Array.from(new Set(data.map((r) => r.problemType3).filter(Boolean))).sort(), [data]);

  const columns: ColumnsType<NoteRecord> = [
    {
      title: '时间', dataIndex: 'time', key: 'time', width: 180,
      sorter: (a, b) => a.time.localeCompare(b.time),
    },
    {
      title: '来源', dataIndex: 'source', key: 'source', width: 100,
      filters: distinctSources.map((s) => ({ text: sourceLabels[s] || s, value: s })),
      render: (v: string) => (
        <Tag icon={sourceIcons[v] || null} color={sourceColors[v] || 'default'}>
          {sourceLabels[v] || v || '--'}
        </Tag>
      ),
    },
    {
      title: '客服', dataIndex: 'agent', key: 'agent', width: 100,
      filters: distinctAgents.map((a) => ({ text: a, value: a })),
      onFilter: (value, record) => record.agent === value,
      render: (v: string) => v || <Text type="secondary">--</Text>,
    },
    {
      title: '客户', dataIndex: 'customer', key: 'customer', width: 200, ellipsis: true,
      filters: distinctCustomers.map((c) => ({ text: c, value: c })),
      onFilter: (value, record) => record.customer === value,
      render: (v: string) => v || <Text type="secondary">--</Text>,
    },
    {
      title: '一级分类', dataIndex: 'problemType1', key: 'problemType1', width: 140,
      filters: distinctP1.map((p) => ({ text: p, value: p })),
      onFilter: (value, record) => record.problemType1 === value,
      render: (v: string) => v ? <Tag color="blue">{v}</Tag> : <Text type="secondary">--</Text>,
    },
    {
      title: '二级分类', dataIndex: 'problemType2', key: 'problemType2', width: 160,
      filters: distinctP2.map((p) => ({ text: p, value: p })),
      onFilter: (value, record) => record.problemType2 === value,
      render: (v: string) => v || <Text type="secondary">--</Text>,
    },
    {
      title: '三级分类', dataIndex: 'problemType3', key: 'problemType3', width: 220, ellipsis: true,
      filters: distinctP3.map((p) => ({ text: p, value: p })),
      onFilter: (value, record) => record.problemType3 === value,
      render: (v: string) => v || <Text type="secondary">--</Text>,
    },
  ];

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await fetchNotesData({
        startDate: dateRange[0].format('YYYY-MM-DD'),
        endDate: dateRange[1].format('YYYY-MM-DD'),
        category: category as any,
        page, perPage: pageSize,
      });
      setData(result.records);
      setTotal(result.total);
    } catch (err: any) {
      setError(err.message || '加载数据失败');
    } finally {
      setLoading(false);
    }
  }, [dateRange, category, page, pageSize]);

  useEffect(() => { loadData(); }, [loadData]);

  // 统计摘要 — 基于当前筛选后的数据
  const { p1Dist, p2Dist } = useMemo(() => {
    const p1 = new Map<string, number>();
    const p2 = new Map<string, number>();
    for (const r of filteredData) {
      const p1k = r.problemType1 || '未分类';
      p1.set(p1k, (p1.get(p1k) || 0) + 1);
      if (r.problemType2) p2.set(r.problemType2, (p2.get(r.problemType2) || 0) + 1);
    }
    const sort = (m: Map<string, number>) =>
      Array.from(m.entries()).sort((a, b) => b[1] - a[1]).slice(0, 12);
    return { p1Dist: sort(p1), p2Dist: sort(p2) };
  }, [filteredData]);

  const barOption1 = useMemo(() => ({
    tooltip: { trigger: 'axis' as const, axisPointer: { type: 'shadow' as const } },
    grid: { left: 10, right: 20, bottom: 10, top: 10, containLabel: true },
    xAxis: { type: 'value' as const, minInterval: 1 },
    yAxis: { type: 'category' as const, data: p1Dist.map(([k]) => k).reverse(), axisLabel: { fontSize: 11 } },
    series: [{ type: 'bar' as const, data: p1Dist.map(([, v]) => v).reverse(), itemStyle: { color: '#1890ff' } }],
  }), [p1Dist]);

  const barOption2 = useMemo(() => ({
    tooltip: { trigger: 'axis' as const, axisPointer: { type: 'shadow' as const } },
    grid: { left: 10, right: 20, bottom: 10, top: 10, containLabel: true },
    xAxis: { type: 'value' as const, minInterval: 1 },
    yAxis: { type: 'category' as const, data: p2Dist.map(([k]) => k).reverse(), axisLabel: { fontSize: 11 } },
    series: [{ type: 'bar' as const, data: p2Dist.map(([, v]) => v).reverse(), itemStyle: { color: '#52c41a' } }],
  }), [p2Dist]);

  return (
    <div style={{ padding: 24 }}>
      <div className="page-header" style={{ marginBottom: 24 }}>
        <Title level={4} style={{ margin: 0 }}>业务记录</Title>
        <Text type="secondary">业务记录列表，按一级/二级/三级分类逐级展开</Text>
      </div>

      {/* 筛选栏 — 仅日期 */}
      <Card size="small" style={{ marginBottom: 16 }}>
        <Row gutter={16} align="middle" wrap>
          <Col>
            <RangePicker
              value={dateRange}
              onChange={(dates) => {
                if (dates) { setDateRange(dates as [dayjs.Dayjs, dayjs.Dayjs]); setPage(1); }
              }}
              allowClear={false}
            />
          </Col>
          <Col flex="none">
            <Button icon={<DownloadOutlined />} onClick={() => exportNotesCsv(filteredData)} disabled={filteredData.length === 0}>
              导出CSV
            </Button>
          </Col>
        </Row>
      </Card>

      {/* 统计摘要 — 基于服务端筛选结果（总数来自服务端） */}
      {!loading && !error && total > 0 && (
        <Card size="small" style={{ marginBottom: 16 }}>
          <Row gutter={16}>
            <Col span={4}>
              <Statistic title="记录总数" value={total} prefix={<FileTextOutlined />} valueStyle={{ color: '#1890ff' }} />
            </Col>
            <Col span={10}>
              <div style={{ fontSize: 13, color: '#666', marginBottom: 4 }}><BarChartOutlined /> 一级分类分布</div>
              {p1Dist.length > 0 ? (
                <ReactECharts option={barOption1} style={{ height: Math.max(100, p1Dist.length * 28) }} />
              ) : <Text type="secondary">暂无数据</Text>}
            </Col>
            <Col span={10}>
              <div style={{ fontSize: 13, color: '#666', marginBottom: 4 }}><BarChartOutlined /> 二级分类分布</div>
              {p2Dist.length > 0 ? (
                <ReactECharts option={barOption2} style={{ height: Math.max(100, p2Dist.length * 28) }} />
              ) : <Text type="secondary">暂无数据</Text>}
            </Col>
          </Row>
        </Card>
      )}

      {loading ? (
        <div style={{ textAlign: 'center', padding: 100 }}><Spin size="large" /></div>
      ) : error ? (
        <Alert type="error" message={error} showIcon />
      ) : (
        <Table
          columns={columns}
          dataSource={data}
          rowKey="id"
          scroll={{ x: 1300 }}
          onChange={(pagination, tableFilters, sorter, extra) => {
            // 更新分页
            if (pagination.current) setPage(pagination.current);
            if (pagination.pageSize) setPageSize(pagination.pageSize);
            setFilters(tableFilters);
            // 更新来源筛选（触发服务端重新加载）
            const srcFilter = (tableFilters as any)?.source;
            const newCategory = srcFilter?.length === 1 ? srcFilter[0] : undefined;
            setCategory(newCategory || undefined);
          }}
          pagination={{
            current: page, pageSize, total,
            showSizeChanger: true,
            showTotal: (t) => `共 ${t} 条`,
          }}
          size="small"
        />
      )}
    </div>
  );
}
