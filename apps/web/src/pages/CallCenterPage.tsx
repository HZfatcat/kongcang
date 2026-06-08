import { useState, useEffect, useMemo } from 'react';
import {
  Card,
  DatePicker,
  Row,
  Col,
  Statistic,
  Spin,
  Alert,
  Typography,
  Table,
  Tag,
  Space,
  Select,
} from 'antd';
import {
  PhoneOutlined,
  InboxOutlined,
  ClockCircleOutlined,
  SmileOutlined,
  FrownOutlined,
  CustomerServiceOutlined,
  RiseOutlined,
  BarChartOutlined,
} from '@ant-design/icons';
import dayjs from 'dayjs';
import ReactECharts from 'echarts-for-react';
import { fetchCallCenterData } from '../api/udesc';
import type { CallCenterStats } from '../api/udesc';

const { RangePicker } = DatePicker;
const { Title, Text } = Typography;

// ---- 工具函数 ----

/** 秒 → HH:mm:ss */
function secToHms(s: number): string {
  if (!s || s <= 0) return '00:00:00';
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = Math.floor(s % 60);
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
}

/** 百分比 (保留 1 位小数) */
function pct(part: number, total: number): string {
  if (!total) return '0.0%';
  return `${Math.round((part / total) * 1000) / 10}%`;
}

/** 从记录计算各项统计 */
function calcStatsFromRecords(records: CallCenterStats['records']) {
  const inbound = records.filter((x) => x.callType === '呼入');
  const outbound = records.filter((x) => x.callType === '呼出');

  const inConnected = inbound.filter((x) => x.callResult === '客服接听');
  const outConnected = outbound.filter((x) => x.callResult === '客户接听');

  const makeStats = (items: typeof records, connected: typeof records) => {
    const cnt = items.length;
    const connCnt = connected.length;
    const totalDuration = connected.reduce((s, x) => s + (x.callTime || 0), 0);
    const avgDuration = connCnt > 0 ? Math.round(totalDuration / connCnt) : 0;
    const rated = items.filter((x) => x.satisfaction && x.satisfaction !== '未评');
    const sat = rated.filter((x) => x.satisfaction === '满意');
    const unsat = rated.filter((x) => x.satisfaction !== '满意');
    return {
      total: cnt,
      connected: connCnt,
      totalDuration,
      avgDuration,
      rated: rated.length,
      satisfied: sat.length,
      unsatisfied: unsat.length,
    };
  };

  const inStats = makeStats(inbound, inConnected);
  const outStats = makeStats(outbound, outConnected);

  const allTotal = inbound.length + outbound.length;
  const allConn = inConnected.length + outConnected.length;
  const allDuration = inStats.totalDuration + outStats.totalDuration;
  const allAvg = allConn > 0 ? Math.round(allDuration / allConn) : 0;
  const allRated = inStats.rated + outStats.rated;
  const allSat = inStats.satisfied + outStats.satisfied;
  const allUnsat = inStats.unsatisfied + outStats.unsatisfied;

  return {
    overview: {
      totalCalls: allTotal,
      totalConnected: allConn,
      connectionRate: pct(allConn, allTotal),
      totalDuration: allDuration,
      avgDuration: allAvg,
      totalRated: allRated,
      satisfied: allSat,
      unsatisfied: allUnsat,
      participationRate: pct(allRated, allTotal),
    },
    inbound: inStats,
    outbound: outStats,
  };
}

/** 按日期聚合趋势数据 */
function buildTrendData(records: CallCenterStats['records']) {
  const map = new Map<string, { inbound: number; outbound: number }>();
  for (const r of records) {
    const date = dayjs(r.startTime).format('MM-DD');
    if (!map.has(date)) map.set(date, { inbound: 0, outbound: 0 });
    const d = map.get(date)!;
    if (r.callType === '呼入') d.inbound++;
    else if (r.callType === '呼出') d.outbound++;
  }
  const sorted = Array.from(map.entries()).sort((a, b) => a[0].localeCompare(b[0]));
  return {
    dates: sorted.map(([d]) => d),
    inboundCounts: sorted.map(([, v]) => v.inbound),
    outboundCounts: sorted.map(([, v]) => v.outbound),
  };
}

const callResultColor: Record<string, string> = {
  '客服接听': 'green',
  '客户接听': 'blue',
  '未接听': 'red',
  '客户挂断': 'orange',
  '系统挂断': 'default',
};
const satisfactionColor: Record<string, string> = {
  '满意': 'green',
  '一般': 'orange',
  '不满意': 'red',
  '未评': 'default',
};

export function CallCenterPage() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<CallCenterStats | null>(null);
  const [selectedAgent, setSelectedAgent] = useState<string | undefined>(undefined);
  // 默认最近一个月
  const [dateRange, setDateRange] = useState<[dayjs.Dayjs, dayjs.Dayjs]>([
    dayjs().subtract(30, 'day'),
    dayjs(),
  ]);

  const loadData = async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await fetchCallCenterData({
        startDate: dateRange[0].format('YYYY-MM-DD'),
        endDate: dateRange[1].format('YYYY-MM-DD'),
      });
      setData(result);
    } catch (err: any) {
      setError(err.message || '加载数据失败');
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { loadData(); }, [dateRange]);

  // ---- 客服筛选 ----
  const filteredRecords = useMemo(() => {
    if (!data) return [];
    if (!selectedAgent) return data.records;
    return data.records.filter((r) => r.agentName === selectedAgent);
  }, [data, selectedAgent]);

  // ---- 计算统计数据 ----
  const stats = useMemo(() => calcStatsFromRecords(filteredRecords), [filteredRecords]);

  // ---- 客服选项 ----
  const agentOptions = useMemo(() => {
    if (!data) return [];
    const names = new Set(data.records.map((r) => r.agentName).filter(Boolean));
    return Array.from(names).sort();
  }, [data]);

  // ---- 趋势图 ----
  const trend = useMemo(() => buildTrendData(filteredRecords), [filteredRecords]);
  const trendOption = useMemo(() => ({
    tooltip: {
      trigger: 'axis' as const,
      formatter: (params: any) => {
        const p = Array.isArray(params) ? params : [params];
        let html = `<b>${p[0]?.axisValue || ''}</b><br/>`;
        for (const item of p) {
          html += `${item.marker} ${item.seriesName}: ${item.value}<br/>`;
        }
        return html;
      },
    },
    legend: { data: ['呼入', '呼出'], bottom: 0 },
    grid: { left: 50, right: 20, bottom: 40, top: 20 },
    xAxis: { type: 'category', data: trend.dates, axisLabel: { rotate: 30, fontSize: 11 } },
    yAxis: { type: 'value', minInterval: 1 },
    series: [
      {
        name: '呼入',
        type: 'line',
        smooth: true,
        symbol: 'circle',
        symbolSize: 6,
        data: trend.inboundCounts,
        itemStyle: { color: '#1890ff' },
        areaStyle: { color: 'rgba(24,144,255,0.1)' },
      },
      {
        name: '呼出',
        type: 'line',
        smooth: true,
        symbol: 'circle',
        symbolSize: 6,
        data: trend.outboundCounts,
        itemStyle: { color: '#52c41a' },
        areaStyle: { color: 'rgba(82,196,26,0.1)' },
      },
    ],
  }), [trend]);

  // ---- 表格列 ----
  const columns = [
    {
      title: '时间', dataIndex: 'startTime', key: 'startTime', width: 170,
      render: (v: string) => v ? dayjs(v).format('MM-DD HH:mm:ss') : '-',
    },
    {
      title: '类型', dataIndex: 'callType', key: 'callType', width: 80,
      render: (v: string) => (
        <Tag icon={v === '呼入' ? <InboxOutlined /> : <CustomerServiceOutlined />}
             color={v === '呼入' ? 'blue' : 'green'}>{v || '-'}</Tag>
      ),
    },
    {
      title: '结果', dataIndex: 'callResult', key: 'callResult', width: 110,
      render: (v: string) => {
        if (!v) return <Text type="secondary">--</Text>;
        return <Tag color={callResultColor[v] || 'default'}>{v}</Tag>;
      },
    },
    {
      title: '客户电话', dataIndex: 'customerPhone', key: 'customerPhone', width: 130,
      render: (v: string) => {
        if (!v || v.trim() === '') return <Text type="secondary">--</Text>;
        return v;
      },
    },
    {
      title: '客服', dataIndex: 'agentName', key: 'agentName', width: 100,
      render: (v: string) => {
        if (!v || v.trim() === '') return <Text type="secondary">--</Text>;
        return v;
      },
    },
    {
      title: '时长', dataIndex: 'callTime', key: 'callTime', width: 90,
      sorter: (a: any, b: any) => a.callTime - b.callTime,
      render: (v: number) => secToHms(v),
    },
    {
      title: '满意度', dataIndex: 'satisfaction', key: 'satisfaction', width: 100,
      render: (v: string) => (
        <Tag color={satisfactionColor[v] || 'default'}>
          {v === '满意' ? <SmileOutlined /> : v === '不满意' ? <FrownOutlined /> : null} {v || '未评'}
        </Tag>
      ),
    },
  ];

  return (
    <div style={{ padding: 24 }}>
      <div style={{ marginBottom: 24 }}>
        <Title level={4} style={{ margin: 0 }}>呼叫中心</Title>
      </div>

      {/* 筛选栏 */}
      <Card size="small" style={{ marginBottom: 16 }}>
        <Row gutter={16} align="middle">
          <Col>
            <RangePicker
              value={dateRange}
              onChange={(dates) => dates && setDateRange(dates as [dayjs.Dayjs, dayjs.Dayjs])}
              allowClear={false}
            />
          </Col>
          <Col>
            <Select
              style={{ width: 200 }}
              placeholder="全部客服"
              allowClear
              value={selectedAgent}
              onChange={(v) => setSelectedAgent(v)}
              options={agentOptions.map((name) => ({ label: name, value: name }))}
            />
          </Col>
        </Row>
      </Card>

      {loading ? (
        <div style={{ textAlign: 'center', padding: 100 }}><Spin size="large" /></div>
      ) : error ? (
        <Alert type="error" message={error} showIcon />
      ) : data ? (
        <>
          {/* ============ 1. 总览（5 上 5 下） ============ */}
          <Card
            title={<Space><BarChartOutlined style={{ color: '#1890ff' }} /><span>总览</span></Space>}
            size="small"
            style={{ marginBottom: 16 }}
          >
            <Row gutter={[16, 24]}>
              {/* 第一行 5 个 */}
              <Col span={4}><Statistic title="总通话数" value={stats.overview.totalCalls} prefix={<PhoneOutlined />} valueStyle={{ color: '#1890ff' }} /></Col>
              <Col span={5}><Statistic title="总接通数" value={stats.overview.totalConnected} prefix={<RiseOutlined />} valueStyle={{ color: '#52c41a' }} /></Col>
              <Col span={5}><Statistic title="接通率" value={stats.overview.connectionRate} valueStyle={{ color: '#722ed1' }} /></Col>
              <Col span={5}><Statistic title="通话总时长" value={secToHms(stats.overview.totalDuration)} prefix={<ClockCircleOutlined />} valueStyle={{ fontSize: 18 }} /></Col>
              <Col span={5}><Statistic title="平均通话时长" value={secToHms(stats.overview.avgDuration)} prefix={<ClockCircleOutlined />} valueStyle={{ fontSize: 18 }} /></Col>
              {/* 第二行 4 个 + 1 空位 */}
              <Col span={4}><Statistic title="总评价数" value={stats.overview.totalRated} prefix={<SmileOutlined />} valueStyle={{ color: '#eb2f96' }} /></Col>
              <Col span={5}><Statistic title="满意数" value={stats.overview.satisfied} prefix={<SmileOutlined />} valueStyle={{ color: '#52c41a' }} /></Col>
              <Col span={5}><Statistic title="不满意数" value={stats.overview.unsatisfied} prefix={<FrownOutlined />} valueStyle={{ color: '#ff4d4f' }} /></Col>
              <Col span={5}><Statistic title="满意度参评率" value={stats.overview.participationRate} valueStyle={{ color: '#722ed1' }} /></Col>
              <Col span={5} />
            </Row>
          </Card>

          {/* ============ 2+3. 呼入 + 呼出 左右分布 ============ */}
          <Row gutter={16} style={{ marginBottom: 16 }}>
            <Col span={12}>
              <Card
                title={<Space><InboxOutlined style={{ color: '#1890ff' }} /><span>呼入统计</span></Space>}
                size="small"
              >
                <Row gutter={[16, 24]}>
                  <Col span={8}><Statistic title="呼入数" value={stats.inbound.total} /></Col>
                  <Col span={8}><Statistic title="呼入振铃数" value={stats.inbound.total} /></Col>
                  <Col span={8}><Statistic title="接通数" value={stats.inbound.connected} valueStyle={{ color: '#1890ff' }} /></Col>
                  <Col span={8}><Statistic title="接通率" value={pct(stats.inbound.connected, stats.inbound.total)} valueStyle={{ color: '#722ed1' }} /></Col>
                  <Col span={8}><Statistic title="通话总时长" value={secToHms(stats.inbound.totalDuration)} prefix={<ClockCircleOutlined />} valueStyle={{ fontSize: 16 }} /></Col>
                  <Col span={8}><Statistic title="平均通话时长" value={secToHms(stats.inbound.avgDuration)} prefix={<ClockCircleOutlined />} valueStyle={{ fontSize: 16 }} /></Col>
                  <Col span={8}><Statistic title="总评价数" value={stats.inbound.rated} prefix={<SmileOutlined />} /></Col>
                  <Col span={8}><Statistic title="满意数" value={stats.inbound.satisfied} prefix={<SmileOutlined />} valueStyle={{ color: '#52c41a' }} /></Col>
                  <Col span={8}><Statistic title="不满意数" value={stats.inbound.unsatisfied} prefix={<FrownOutlined />} valueStyle={{ color: '#ff4d4f' }} /></Col>
                  <Col span={8}><Statistic title="满意度参评率" value={pct(stats.inbound.rated, stats.inbound.total)} valueStyle={{ color: '#722ed1' }} /></Col>
                  <Col span={8} />
                  <Col span={8} />
                </Row>
              </Card>
            </Col>
            <Col span={12}>
              <Card
                title={<Space><CustomerServiceOutlined style={{ color: '#52c41a' }} /><span>呼出统计</span></Space>}
                size="small"
              >
                <Row gutter={[16, 24]}>
                  <Col span={8}><Statistic title="呼出数" value={stats.outbound.total} /></Col>
                  <Col span={8}><Statistic title="接通数" value={stats.outbound.connected} valueStyle={{ color: '#52c41a' }} /></Col>
                  <Col span={8}><Statistic title="接通率" value={pct(stats.outbound.connected, stats.outbound.total)} valueStyle={{ color: '#722ed1' }} /></Col>
                  <Col span={8}><Statistic title="通话总时长" value={secToHms(stats.outbound.totalDuration)} prefix={<ClockCircleOutlined />} valueStyle={{ fontSize: 16 }} /></Col>
                  <Col span={8}><Statistic title="平均通话时长" value={secToHms(stats.outbound.avgDuration)} prefix={<ClockCircleOutlined />} valueStyle={{ fontSize: 16 }} /></Col>
                  <Col span={8}><Statistic title="总评价数" value={stats.outbound.rated} prefix={<SmileOutlined />} /></Col>
                  <Col span={8}><Statistic title="满意数" value={stats.outbound.satisfied} prefix={<SmileOutlined />} valueStyle={{ color: '#52c41a' }} /></Col>
                  <Col span={8}><Statistic title="不满意数" value={stats.outbound.unsatisfied} prefix={<FrownOutlined />} valueStyle={{ color: '#ff4d4f' }} /></Col>
                  <Col span={8}><Statistic title="满意度参评率" value={pct(stats.outbound.rated, stats.outbound.total)} valueStyle={{ color: '#722ed1' }} /></Col>
                  <Col span={8} />
                  <Col span={8} />
                </Row>
              </Card>
            </Col>
          </Row>

          {/* ============ 4. 通话趋势 ============ */}
          <Card
            title={<Space><ClockCircleOutlined style={{ color: '#fa8c16' }} /><span>通话趋势</span></Space>}
            size="small"
            style={{ marginBottom: 16 }}
          >
            {trend.dates.length > 0 ? (
              <ReactECharts option={trendOption} style={{ height: 300 }} />
            ) : (
              <div style={{ textAlign: 'center', padding: 40, color: '#999' }}>暂无趋势数据</div>
            )}
          </Card>

          {/* ============ 5. 通话记录 ============ */}
          <Card
            title={
              <Space>
                <PhoneOutlined />
                <span>通话记录</span>
                <Text type="secondary" style={{ fontSize: 12 }}>{filteredRecords.length} 条记录</Text>
              </Space>
            }
            size="small"
          >
            {filteredRecords.length > 0 ? (
              <Table
                dataSource={filteredRecords}
                columns={columns}
                rowKey="id"
                size="small"
                pagination={{ pageSize: 30, showSizeChanger: false, showTotal: (t) => `共 ${t} 条` }}
                scroll={{ x: 780 }}
              />
            ) : (
              <div style={{ textAlign: 'center', padding: 40, color: '#999' }}>暂无通话记录</div>
            )}
          </Card>
        </>
      ) : null}
    </div>
  );
}
