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
  Input,
  Button,
  TableColumnsType,
  message,
  Radio,
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
  DownloadOutlined,
  SearchOutlined,
  UserOutlined,
} from '@ant-design/icons';
import dayjs from 'dayjs';
import weekOfYear from 'dayjs/plugin/weekOfYear';
import ReactECharts from 'echarts-for-react';
import { fetchCallCenterData, fetchUdescAgents } from '../../api/udesc';
import type { CallCenterStats } from '../../api/udesc';
import type { UdescAgentDetail } from '../../types/udesc';

dayjs.extend(weekOfYear);

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

/** 手机号脱敏：13800138000 → 138****8000 */
function maskPhone(phone: string): string {
  if (!phone || phone.length < 7) return phone || '';
  return phone.slice(0, 3) + '****' + phone.slice(-4);
}

/** 从记录计算各项统计 */
function calcStatsFromRecords(records: CallCenterStats['records']) {
  const inbound = records.filter((x) => x.callType === '呼入');
  const outbound = records.filter((x) => x.callType === '呼出');
  // 呼入振铃 = 实际到达客服的通话
  const inRing = inbound.filter((x) => x.callResult === '客服接听' || x.callResult === '未接听');
  const inConnected = inbound.filter((x) => x.callResult === '客服接听');
  const outConnected = outbound.filter((x) => x.callResult === '客户接听');

  const makeStats = (items: typeof records, ring: typeof records | null, connected: typeof records) => {
    const cnt = items.length;
    const ringCnt = ring ? ring.length : cnt;
    const connCnt = connected.length;
    const totalDuration = connected.reduce((s, x) => s + (x.callTime || 0), 0);
    const avgDuration = connCnt > 0 ? Math.round(totalDuration / connCnt) : 0;
    const rated = items.filter((x) => x.satisfaction && x.satisfaction !== '未评');
    const sat = rated.filter((x) => x.satisfaction === '满意');
    const unsat = rated.filter((x) => x.satisfaction !== '满意');
    return {
      total: cnt,
      ringCount: ringCnt,
      connected: connCnt,
      totalDuration,
      avgDuration,
      rated: rated.length,
      satisfied: sat.length,
      unsatisfied: unsat.length,
    };
  };

  const inStats = makeStats(inbound, inRing, inConnected);
  // 呼出不计算振铃，接通率=接通数/总呼出数
  const outStats = makeStats(outbound, null, outConnected);

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
      satisfaction: allSat > 0 || allUnsat > 0 ? pct(allSat, allSat + allUnsat) : 'N/A',
    },
    inbound: inStats,
    outbound: outStats,
  };
}

/** 按日期聚合趋势数据 */
type TrendMode = 'day' | 'week' | 'month';
function buildTrendData(records: CallCenterStats['records'], mode: TrendMode = 'day') {
  const map = new Map<string, { inbound: number; outbound: number; sortKey: string }>();
  for (const r of records) {
    const d = dayjs(r.startTime);
    let key: string;
    let sortKey: string;
    if (mode === 'week') {
      // 显示为 "06/02-06/08" 日期范围
      const weekStart = d.startOf('week').add(1, 'day'); // 周一
      const weekEnd = weekStart.add(6, 'day'); // 周日
      key = `${weekStart.format('MM/DD')}-${weekEnd.format('MM/DD')}`;
      sortKey = weekStart.format('YYYY-MM-DD');
    } else if (mode === 'month') {
      key = d.format('YYYY-MM');
      sortKey = key;
    } else {
      key = d.format('MM-DD');
      sortKey = d.format('YYYY-MM-DD');
    }
    if (!map.has(key)) map.set(key, { inbound: 0, outbound: 0, sortKey });
    const v = map.get(key)!;
    if (r.callType === '呼入') v.inbound++;
    else if (r.callType === '呼出') v.outbound++;
  }
  const sorted = Array.from(map.entries()).sort((a, b) => a[1].sortKey.localeCompare(b[1].sortKey));
  return {
    dates: sorted.map(([d]) => d),
    inboundCounts: sorted.map(([, v]) => v.inbound),
    outboundCounts: sorted.map(([, v]) => v.outbound),
  };
}

/** 按客服聚合 */
function buildAgentSummary(records: CallCenterStats['records']) {
  const map = new Map<string, { total: number; inbound: number; outbound: number; connected: number; duration: number; rated: number; satisfied: number }>();
  for (const r of records) {
    const name = r.agentName || '未知';
    if (!map.has(name)) map.set(name, { total: 0, inbound: 0, outbound: 0, connected: 0, duration: 0, rated: 0, satisfied: 0 });
    const d = map.get(name)!;
    d.total++;
    if (r.callType === '呼入') d.inbound++;
    else if (r.callType === '呼出') d.outbound++;
    if (r.callResult === '客服接听' || r.callResult === '客户接听') {
      d.connected++;
      d.duration += r.callTime || 0;
    }
    if (r.satisfaction && r.satisfaction !== '未评') {
      d.rated++;
      if (r.satisfaction === '满意') d.satisfied++;
    }
  }
  return Array.from(map.entries())
    .map(([name, v]) => ({
      agent: name,
      total: v.total,
      inbound: v.inbound,
      outbound: v.outbound,
      connected: v.connected,
      connectionRate: pct(v.connected, v.total),
      avgDuration: v.connected > 0 ? secToHms(Math.round(v.duration / v.connected)) : '-',
      rated: v.rated,
      satisfaction: v.rated > 0 ? pct(v.satisfied, v.rated) : 'N/A',
    }))
    .sort((a, b) => b.total - a.total);
}

/** 导出 CSV */
function exportCsv(records: CallCenterStats['records']) {
  const header = '时间,类型,结果,客户电话,客服,时长(秒),满意度\n';
  const rows = records.map((r) =>
    [
      dayjs(r.startTime).format('YYYY-MM-DD HH:mm:ss'),
      r.callType,
      r.callResult,
      r.customerPhone || '',
      r.agentName || '',
      r.callTime ?? 0,
      r.satisfaction || '未评',
    ].join(','),
  );
  const csv = '\uFEFF' + header + rows.join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `呼叫中心_${dayjs().format('YYYYMMDD_HHmmss')}.csv`;
  a.click();
  URL.revokeObjectURL(url);
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

const callResultOptions = [
  { label: '全部结果', value: '' },
  { label: '客服接听', value: '客服接听' },
  { label: '客户接听', value: '客户接听' },
  { label: '未接听', value: '未接听' },
  { label: '客户挂断', value: '客户挂断' },
  { label: '系统挂断', value: '系统挂断' },
];

export function CallCenterPage() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<CallCenterStats | null>(null);
  const [selectedAgent, setSelectedAgent] = useState<string | undefined>(undefined);
  const [agents, setAgents] = useState<UdescAgentDetail[]>([]);
  const [phoneSearch, setPhoneSearch] = useState('');
  const [resultFilter, setResultFilter] = useState('');
  const [trendMode, setTrendMode] = useState<TrendMode>('day');
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

  // 加载客服列表
  useEffect(() => {
    fetchUdescAgents({ enabled: true })
      .then((res) => setAgents(res.records || []))
      .catch(() => { /* ignore */ });
  }, []);

  // ---- 客户端筛选 ----
  const filteredRecords = useMemo(() => {
    if (!data) return [];
    let list = data.records;
    if (selectedAgent) list = list.filter((r) => r.agentName === selectedAgent);
    if (phoneSearch) list = list.filter((r) => r.customerPhone?.includes(phoneSearch));
    if (resultFilter) list = list.filter((r) => r.callResult === resultFilter);
    return list;
  }, [data, selectedAgent, phoneSearch, resultFilter]);

  // ---- 计算统计数据 ----
  const stats = useMemo(() => calcStatsFromRecords(filteredRecords), [filteredRecords]);

  // ---- 客服选项 ----
  const agentOptions = useMemo(() => {
    const names = new Set<string>();
    agents.forEach((a) => { if (a.name) names.add(a.name); });
    if (data) {
      data.records.forEach((r) => { if (r.agentName) names.add(r.agentName); });
    }
    return Array.from(names).sort();
  }, [agents, data]);

  // ---- 趋势图 ----
  const trend = useMemo(() => buildTrendData(filteredRecords, trendMode), [filteredRecords, trendMode]);
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
    legend: { data: ['呼入', '呼出'], top: 0, right: 0 },
    grid: { left: 50, right: 20, bottom: 50, top: 40 },
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

  // ---- 按客服聚合 ----
  const agentSummary = useMemo(() => buildAgentSummary(filteredRecords), [filteredRecords]);

  // ---- 提取筛选选项 ----
  const distinctCallTypes = useMemo(() => {
    if (!data) return [];
    return Array.from(new Set(data.records.map((r) => r.callType).filter(Boolean))).sort();
  }, [data]);
  const distinctCallResults = useMemo(() => {
    if (!data) return [];
    return Array.from(new Set(data.records.map((r) => r.callResult).filter(Boolean))).sort();
  }, [data]);
  const distinctAgents = useMemo(() => {
    if (!data) return [];
    return Array.from(new Set(data.records.map((r) => r.agentName).filter(Boolean))).sort();
  }, [data]);
  const distinctSatisfaction = useMemo(() => {
    if (!data) return [];
    return Array.from(new Set(data.records.map((r) => r.satisfaction).filter(Boolean))).sort();
  }, [data]);

  // ---- 表格列 ----
  const columns: TableColumnsType<any> = [
    {
      title: '时间', dataIndex: 'startTime', key: 'startTime', width: 170,
      render: (v: string) => v ? dayjs(v).format('MM-DD HH:mm:ss') : '-',
      sorter: (a: any, b: any) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime(),
    },
    {
      title: '主叫号码', dataIndex: 'customerPhone', key: 'customerPhone', width: 130,
      render: (v: string) => {
        if (!v || v.trim() === '') return <Text type="secondary">--</Text>;
        return maskPhone(v);
      },
    },
    {
      title: '类型', dataIndex: 'callType', key: 'callType', width: 90,
      filters: distinctCallTypes.map((t) => ({ text: t, value: t })),
      onFilter: (value, record) => record.callType === value,
      render: (v: string) => (
        <Tag icon={v === '呼入' ? <InboxOutlined /> : <CustomerServiceOutlined />}
             color={v === '呼入' ? 'blue' : 'green'}>{v || '-'}</Tag>
      ),
    },
    {
      title: '结果', dataIndex: 'callResult', key: 'callResult', width: 110,
      filters: distinctCallResults.map((r) => ({ text: r, value: r })),
      onFilter: (value, record) => record.callResult === value,
      render: (v: string) => {
        if (!v) return <Text type="secondary">--</Text>;
        return <Tag color={callResultColor[v] || 'default'}>{v}</Tag>;
      },
    },
    {
      title: '通话时长', dataIndex: 'callTime', key: 'callTime', width: 90,
      sorter: (a: any, b: any) => a.callTime - b.callTime,
      render: (v: number) => secToHms(v),
    },
    {
      title: '客服', dataIndex: 'agentName', key: 'agentName', width: 110,
      filters: distinctAgents.map((a) => ({ text: a, value: a })),
      onFilter: (value, record) => record.agentName === value,
      render: (v: string) => {
        if (!v || v.trim() === '') return <Text type="secondary">--</Text>;
        return v;
      },
    },
    {
      title: '满意度', dataIndex: 'satisfaction', key: 'satisfaction', width: 100,
      filters: distinctSatisfaction.map((s) => ({ text: s, value: s })),
      onFilter: (value, record) => record.satisfaction === value,
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
        <Row gutter={[16, 12]} align="middle" wrap>
          <Col>
            <RangePicker
              value={dateRange}
              onChange={(dates) => dates && setDateRange(dates as [dayjs.Dayjs, dayjs.Dayjs])}
              allowClear={false}
            />
          </Col>
          <Col>
            <Select
              style={{ width: 160 }}
              placeholder="全部客服"
              allowClear
              value={selectedAgent}
              onChange={(v) => setSelectedAgent(v)}
              options={agentOptions.map((name) => ({ label: name, value: name }))}
            />
          </Col>
          <Col>
            <Input
              style={{ width: 160 }}
              placeholder="搜索客户电话"
              prefix={<SearchOutlined />}
              allowClear
              value={phoneSearch}
              onChange={(e) => setPhoneSearch(e.target.value)}
            />
          </Col>
          <Col>
            <Select
              style={{ width: 130 }}
              value={resultFilter}
              onChange={(v) => setResultFilter(v)}
              options={callResultOptions}
            />
          </Col>
          <Col flex="none">
            <Button icon={<DownloadOutlined />} onClick={() => exportCsv(filteredRecords)} disabled={filteredRecords.length === 0}>
              导出CSV
            </Button>
          </Col>
        </Row>
      </Card>

      {loading ? (
        <div style={{ textAlign: 'center', padding: 100 }}><Spin size="large" /></div>
      ) : error ? (
        <Alert type="error" message={error} showIcon />
      ) : data ? (
        <>
          {/* ============ 1. 总览（10 指标） ============ */}
          <Card
            title={<Space><BarChartOutlined style={{ color: '#1890ff' }} /><span>总览</span></Space>}
            size="small"
            style={{ marginBottom: 16 }}
          >
            <Row gutter={[16, 24]}>
              {/* 第1行 */}
              <Col span={4}><Statistic title="总通话数" value={stats.overview.totalCalls} prefix={<PhoneOutlined />} valueStyle={{ color: '#1890ff' }} /></Col>
              <Col span={5}><Statistic title="总接通数" value={stats.overview.totalConnected} prefix={<RiseOutlined />} valueStyle={{ color: '#52c41a' }} /></Col>
              <Col span={5}><Statistic title="接通率" value={stats.overview.connectionRate} valueStyle={{ color: '#722ed1' }} /></Col>
              <Col span={5}><Statistic title="通话总时长" value={secToHms(stats.overview.totalDuration)} prefix={<ClockCircleOutlined />} valueStyle={{ fontSize: 18 }} /></Col>
              <Col span={5}><Statistic title="平均通话时长" value={secToHms(stats.overview.avgDuration)} prefix={<ClockCircleOutlined />} valueStyle={{ fontSize: 18 }} /></Col>
              {/* 第2行 */}
              <Col span={4}><Statistic title="总评价数" value={stats.overview.totalRated} prefix={<SmileOutlined />} valueStyle={{ color: '#eb2f96' }} /></Col>
              <Col span={5}><Statistic title="满意数" value={stats.overview.satisfied} prefix={<SmileOutlined />} valueStyle={{ color: '#52c41a' }} /></Col>
              <Col span={5}><Statistic title="不满意数" value={stats.overview.unsatisfied} prefix={<FrownOutlined />} valueStyle={{ color: '#ff4d4f' }} /></Col>
              <Col span={5}><Statistic title="满意度" value={stats.overview.satisfaction} prefix={<SmileOutlined />} valueStyle={{ color: '#722ed1' }} /></Col>
              <Col span={5}><Statistic title="满意度参评率" value={stats.overview.participationRate} valueStyle={{ color: '#722ed1' }} /></Col>
            </Row>
          </Card>

          {/* ============ 2+3. 呼入 + 呼出 ============ */}
          <Row gutter={16} style={{ marginBottom: 16 }}>
            <Col span={12}>
              <Card title={<Space><InboxOutlined style={{ color: '#1890ff' }} /><span>呼入统计</span></Space>} size="small">
                <Row gutter={[16, 24]}>
                  <Col span={6}><Statistic title="呼入数" value={stats.inbound.total} /></Col>
                  <Col span={6}><Statistic title="呼入振铃数" value={stats.inbound.ringCount} valueStyle={{ color: '#1890ff' }} /></Col>
                  <Col span={6}><Statistic title="接通数" value={stats.inbound.connected} valueStyle={{ color: '#1890ff' }} /></Col>
                  <Col span={6}><Statistic title="接通率" value={pct(stats.inbound.connected, stats.inbound.ringCount || stats.inbound.total)} valueStyle={{ color: '#722ed1' }} /></Col>
                  <Col span={6}><Statistic title="通话总时长" value={secToHms(stats.inbound.totalDuration)} prefix={<ClockCircleOutlined />} valueStyle={{ fontSize: 16 }} /></Col>
                  <Col span={6}><Statistic title="平均通话时长" value={secToHms(stats.inbound.avgDuration)} prefix={<ClockCircleOutlined />} valueStyle={{ fontSize: 16 }} /></Col>
                  <Col span={6}><Statistic title="总评价数" value={stats.inbound.rated} prefix={<SmileOutlined />} /></Col>
                  <Col span={6}><Statistic title="满意数" value={stats.inbound.satisfied} prefix={<SmileOutlined />} valueStyle={{ color: '#52c41a' }} /></Col>
                  <Col span={6}><Statistic title="不满意数" value={stats.inbound.unsatisfied} prefix={<FrownOutlined />} valueStyle={{ color: '#ff4d4f' }} /></Col>
                  <Col span={6}><Statistic title="满意度参评率" value={pct(stats.inbound.rated, stats.inbound.total)} valueStyle={{ color: '#722ed1' }} /></Col>
                </Row>
              </Card>
            </Col>
            <Col span={12}>
              <Card title={<Space><CustomerServiceOutlined style={{ color: '#52c41a' }} /><span>呼出统计</span></Space>} size="small">
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

          {/* ============ 4. 按客服聚合统计 ============ */}
          {agentSummary.length > 0 && (
            <Card
              title={<Space><UserOutlined style={{ color: '#722ed1' }} /><span>按客服统计</span></Space>}
              size="small"
              style={{ marginBottom: 16 }}
            >
              <Table
                dataSource={agentSummary}
                rowKey="agent"
                size="small"
                pagination={false}
                scroll={{ x: 800 }}
              >
                <Table.Column title="客服" dataIndex="agent" key="agent" width={100} />
                <Table.Column title="通话数" dataIndex="total" key="total" width={70} sorter={(a: any, b: any) => a.total - b.total} />
                <Table.Column title="呼入" dataIndex="inbound" key="inbound" width={60} sorter={(a: any, b: any) => a.inbound - b.inbound} />
                <Table.Column title="呼出" dataIndex="outbound" key="outbound" width={60} sorter={(a: any, b: any) => a.outbound - b.outbound} />
                <Table.Column title="接通数" dataIndex="connected" key="connected" width={70} sorter={(a: any, b: any) => a.connected - b.connected} />
                <Table.Column title="接通率" dataIndex="connectionRate" key="connectionRate" width={70} />
                <Table.Column title="平均时长" dataIndex="avgDuration" key="avgDuration" width={90} />
                <Table.Column title="评价数" dataIndex="rated" key="rated" width={70} sorter={(a: any, b: any) => a.rated - b.rated} />
                <Table.Column title="满意度" dataIndex="satisfaction" key="satisfaction" width={80}
                  filters={[{ text: 'N/A', value: 'N/A' }]}
                  onFilter={(value, record: any) => record.satisfaction === value}
                />
              </Table>
            </Card>
          )}

          {/* ============ 5. 通话趋势 ============ */}
          <Card
            title={
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%' }}>
                <Space>
                  <ClockCircleOutlined style={{ color: '#fa8c16' }} />
                  <span>通话趋势</span>
                </Space>
                <Radio.Group
                  value={trendMode}
                  onChange={(e) => setTrendMode(e.target.value)}
                  size="small"
                  optionType="button"
                  buttonStyle="solid"
                >
                  <Radio.Button value="day">按日</Radio.Button>
                  <Radio.Button value="week">按周</Radio.Button>
                  <Radio.Button value="month">按月</Radio.Button>
                </Radio.Group>
              </div>
            }
            size="small"
            style={{ marginBottom: 16 }}
          >
            {trend.dates.length > 0 ? (
              <ReactECharts option={trendOption} style={{ height: 300 }} />
            ) : (
              <div style={{ textAlign: 'center', padding: 40, color: '#999' }}>暂无趋势数据</div>
            )}
          </Card>

          {/* ============ 6. 通话记录明细 ============ */}
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
                pagination={{ pageSize: 30, showSizeChanger: true, showTotal: (t) => `共 ${t} 条` }}
                scroll={{ x: 900 }}
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
