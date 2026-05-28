import { useState, useEffect, useMemo, useRef } from 'react';
import {
  Card, DatePicker, Row, Col, Statistic, Spin,
  Alert, Typography, Select, Segmented, Table, Tag, Input, Button, Space, message,
} from 'antd';
import { SearchOutlined, SyncOutlined } from '@ant-design/icons';
import {
  PhoneOutlined, InboxOutlined, ClockCircleOutlined,
  SmileOutlined, CustomerServiceOutlined, RiseOutlined,
  FrownOutlined, MinusCircleOutlined, TeamOutlined,
} from '@ant-design/icons';
import ReactEChartsCore from 'echarts-for-react/lib/core';
import * as echarts from 'echarts/core';
import { LineChart } from 'echarts/charts';
import {
  GridComponent, TooltipComponent, LegendComponent,
} from 'echarts/components';
import { CanvasRenderer } from 'echarts/renderers';
import dayjs from 'dayjs';
import { runCallCenterSync } from '../api/udesc';

echarts.use([LineChart, GridComponent, TooltipComponent, LegendComponent, CanvasRenderer]);

const { RangePicker } = DatePicker;
const { Title, Text } = Typography;

// ── 类型定义 ──────────────────────────────────────────────────
interface CallRecord {
  id: number;
  call_type: string;       // 呼入 / 呼出
  call_result: string;     // 客服接听 / 客户接听 / 客户未接
  customer_phone: string | null;
  agent_name: string;
  call_time: number;       // 秒
  ring_time: number;       // 振铃时长（秒）
  start_time: string;
  satisfaction: string;    // 满意 / 不满意 / 未评价
  survey: string;
}

interface CallStatsData {
  period: { start: string; end: string };
  stats: Record<string, number | string>;
  records: CallRecord[];
}

// ── 辅助函数 ──────────────────────────────────────────────────
function formatDuration(seconds: number): string {
  if (!seconds || seconds <= 0) return '00:00:00';
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

/** 手机号中间四位脱敏：180****3876 */
function maskPhone(phone: string | null): string {
  if (!phone) return '未知';
  const s = phone.replace(/\s/g, '');
  if (s.length === 11) {
    return s.slice(0, 3) + '****' + s.slice(7);
  }
  if (s.length > 4) {
    return s.slice(0, 2) + '****' + s.slice(-2);
  }
  return s;
}

const directionColorMap: Record<string, string> = {
  '呼入': 'blue',
  '呼出': 'volcano',
};

const statusColorMap: Record<string, string> = {
  '客服接听': 'green',
  '客户接听': 'cyan',
  '客户未接': 'orange',
  '呼叫失败': 'red',
};

const satisfactionIconMap: Record<string, { icon: React.ReactNode; color: string; label: string }> = {
  '满意': { icon: <SmileOutlined />, color: '#52c41a', label: '满意' },
  '不满意': { icon: <FrownOutlined />, color: '#ff4d4f', label: '不满意' },
  '未评价': { icon: <MinusCircleOutlined />, color: '#d9d9d9', label: '未评价' },
};

// ── 主组件 ──────────────────────────────────────────────────
function CallCenterPage() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<CallStatsData | null>(null);
  const [selectedAgent, setSelectedAgent] = useState<string>('all');
  const [trendMode, setTrendMode] = useState<string>('日');
  const [dateRange, setDateRange] = useState<[dayjs.Dayjs | null, dayjs.Dayjs | null]>([
    dayjs().subtract(1, 'month').startOf('day'),
    dayjs().endOf('day'),
  ]);

  // 列筛选搜索状态
  const [searchText, setSearchText] = useState('');
  const [searchedColumn, setSearchedColumn] = useState('');
  const searchInput = useRef<any>(null);

  // 手动同步状态
  const [syncing, setSyncing] = useState(false);

  const handleSync = async () => {
    setSyncing(true);
    try {
      await runCallCenterSync();
      message.success('同步请求已提交，正在拉取最新数据…');
      // 同步完成后重新加载数据
      const resp = await fetch('/call-stats.json');
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      const json: CallStatsData = await resp.json();
      setData(json);
      message.success('数据已更新');
    } catch (err: any) {
      message.error('同步失败：' + (err.message || '未知错误'));
    } finally {
      setSyncing(false);
    }
  };

  // 列筛选项（下拉复选框类：通话类型/通话结果/满意度）
  const [tableFilters, setTableFilters] = useState<Record<string, React.Key[] | null>>({});

  const handleSearch = (selectedKeys: string[], confirm: () => void, dataIndex: string) => {
    confirm();
    setSearchText(selectedKeys[0] || '');
    setSearchedColumn(dataIndex);
  };

  const handleReset = (clearFilters: () => void) => {
    clearFilters();
    setSearchText('');
  };

  const getColumnSearchProps = (dataIndex: string, placeholder: string) => ({
    filterDropdown: ({ setSelectedKeys, selectedKeys, confirm, clearFilters, close }: any) => (
      <div style={{ padding: 8 }} onKeyDown={(e) => e.stopPropagation()}>
        <Input
          ref={searchInput}
          placeholder={placeholder}
          value={selectedKeys[0]}
          onChange={(e) => setSelectedKeys(e.target.value ? [e.target.value] : [])}
          onPressEnter={() => handleSearch(selectedKeys as string[], confirm, dataIndex)}
          style={{ marginBottom: 8, display: 'block' }}
        />
        <Space>
          <Button
            type="primary"
            onClick={() => handleSearch(selectedKeys as string[], confirm, dataIndex)}
            icon={<SearchOutlined />}
            size="small"
            style={{ width: 90 }}
          >
            搜索
          </Button>
          <Button onClick={() => clearFilters && handleReset(clearFilters)} size="small" style={{ width: 90 }}>
            重置
          </Button>
        </Space>
      </div>
    ),
    filterIcon: (filtered: boolean) => (
      <SearchOutlined style={{ color: filtered ? '#1677ff' : undefined }} />
    ),
    onFilter: (value: boolean | React.Key, record: any) =>
      record[dataIndex]
        ? record[dataIndex].toString().toLowerCase().includes(String(value).toLowerCase())
        : false,
  });

  // 获取真实数据
  useEffect(() => {
    setLoading(true);
    fetch('/call-stats.json')
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then((json: CallStatsData) => {
        setData(json);
        setLoading(false);
      })
      .catch((e) => {
        setError(e.message);
        setLoading(false);
      });
  }, []);

  // 提取客服列表（去重）
  const agents = useMemo(() => {
    if (!data) return [];
    const set = new Set<string>();
    for (const r of data.records) {
      if (r.agent_name) set.add(r.agent_name);
    }
    // 如果一条 agent_name 都没有，加一个占位提示
    if (set.size === 0) set.add('(暂无客服数据)');
    return Array.from(set).sort();
  }, [data]);

  // 筛选后的记录（按客服 + 日期范围）
  const filteredRecords = useMemo(() => {
    if (!data) return [];
    let recs = data.records;
    if (selectedAgent && selectedAgent !== 'all') {
      recs = recs.filter((r) => r.agent_name === selectedAgent);
    }
    if (dateRange[0] && dateRange[1]) {
      const start = dateRange[0].startOf('day').valueOf();
      const end = dateRange[1].endOf('day').valueOf();
      recs = recs.filter((r) => {
        const t = dayjs(r.start_time).valueOf();
        return t >= start && t <= end;
      });
    }
    // 列筛选（通话类型/通话结果/满意度）
    if (tableFilters['call_type']?.length) {
      const vals = tableFilters['call_type'] as string[];
      recs = recs.filter((r) => vals.includes(r.call_type));
    }
    if (tableFilters['call_result']?.length) {
      const vals = tableFilters['call_result'] as string[];
      recs = recs.filter((r) => vals.includes(r.call_result));
    }
    if (tableFilters['satisfaction']?.length) {
      const vals = tableFilters['satisfaction'] as string[];
      recs = recs.filter((r) => vals.includes(r.satisfaction));
    }
    return recs;
  }, [data, selectedAgent, dateRange, tableFilters]);

  // 统计计算（基于筛选后的数据）
  const stats = useMemo(() => {
    const total = filteredRecords.length;
    const inbound = filteredRecords.filter((r) => r.call_type === '呼入');
    const outbound = filteredRecords.filter((r) => r.call_type === '呼出');
    const inboundConnected = inbound.filter((r) => r.call_result === '客服接听');
    const outboundConnected = outbound.filter((r) => r.call_result === '客户接听');
    const inboundRing = inbound.filter((r) => (r.ring_time || 0) > 0);
    const inboundRingCount = inboundRing.length;
    const inboundDuration = inboundConnected.reduce((s, r) => s + (r.call_time || 0), 0);
    const outboundDuration = outboundConnected.reduce((s, r) => s + (r.call_time || 0), 0);
    const allConnected = [...inboundConnected, ...outboundConnected];
    const totalDuration = inboundDuration + outboundDuration;
    const avgDuration = allConnected.length > 0 ? Math.round(totalDuration / allConnected.length) : 0;
    const inboundAvg = inboundConnected.length > 0 ? Math.round(inboundDuration / inboundConnected.length) : 0;

    return {
      total,
      totalConnected: allConnected.length,
      connectRate: allConnected.length > 0 ? `${(allConnected.length / (inboundRingCount + outbound.length) * 100).toFixed(1)}%` : 'N/A',
      totalDuration,
      avgDuration,
      inboundCount: inbound.length,
      inboundConnected: inboundConnected.length,
      inboundRingCount,
      inboundConnectRateByRing: inboundRingCount > 0 ? `${(inboundConnected.length / inboundRingCount * 100).toFixed(1)}%` : 'N/A',
      inboundDuration,
      inboundAvg,
      outboundCount: outbound.length,
      outboundConnected: outboundConnected.length,
      outboundDuration,
      outboundAvg: outboundConnected.length > 0 ? Math.round(outboundDuration / outboundConnected.length) : 0,
    };
  }, [filteredRecords]);

  // 折线图数据（按日/周/月聚合）
  const trendData = useMemo(() => {
    const pad2 = (n: number) => String(n).padStart(2, '0');
    const map = new Map<string, { inbound: number; outbound: number }>();
    for (const r of filteredRecords) {
      let key: string;
      const d = r.start_time ? r.start_time.slice(0, 10) : `ID-${r.id}`;
      if (trendMode === '周') {
        // 按 ISO 周聚合，key 显示为周区间 MM/DD-MM/DD
        const dt = new Date(d);
        const dayOfWeek = dt.getDay() || 7; // 周一=1, 周日=7
        const monday = new Date(dt);
        monday.setDate(dt.getDate() - dayOfWeek + 1);
        const sunday = new Date(monday);
        sunday.setDate(monday.getDate() + 6);
        key = `${pad2(monday.getMonth() + 1)}/${pad2(monday.getDate())}-${pad2(sunday.getMonth() + 1)}/${pad2(sunday.getDate())}`;
      } else if (trendMode === '月') {
        key = d.slice(0, 7);
      } else {
        key = d;
      }
      const e = map.get(key) || { inbound: 0, outbound: 0 };
      if (r.call_type === '呼入') e.inbound++;
      else e.outbound++;
      map.set(key, e);
    }
    const sorted = Array.from(map.entries()).sort(([a], [b]) => a.localeCompare(b));
    return {
      dates: sorted.map(([k]) => k),
      inbound: sorted.map(([, v]) => v.inbound),
      outbound: sorted.map(([, v]) => v.outbound),
    };
  }, [filteredRecords, trendMode]);

  const echartOption = useMemo(() => ({
    tooltip: { trigger: 'axis' as const },
    legend: { data: ['呼入', '呼出'], bottom: 0 },
    grid: { left: 40, right: 20, top: 15, bottom: 55 },
    xAxis: {
      type: 'category' as const,
      data: trendData.dates,
      axisLabel: { rotate: 30, fontSize: 11 },
    },
    yAxis: { type: 'value' as const, minInterval: 1 },
    series: [
      {
        name: '呼入',
        type: 'line',
        data: trendData.inbound,
        smooth: true,
        symbol: 'circle',
        lineStyle: { color: '#1677ff', width: 2 },
        itemStyle: { color: '#1677ff' },
        areaStyle: {
          color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
            { offset: 0, color: 'rgba(22,119,255,0.25)' },
            { offset: 1, color: 'rgba(22,119,255,0.02)' },
          ]),
        },
      },
      {
        name: '呼出',
        type: 'line',
        data: trendData.outbound,
        smooth: true,
        symbol: 'diamond',
        lineStyle: { color: '#fa8c16', width: 2 },
        itemStyle: { color: '#fa8c16' },
        areaStyle: {
          color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
            { offset: 0, color: 'rgba(250,140,22,0.25)' },
            { offset: 1, color: 'rgba(250,140,22,0.02)' },
          ]),
        },
      },
    ],
  }), [trendData]);

  // 满意度统计（基于筛选后，分组）
  const satStats = useMemo(() => {
    const rated = filteredRecords.filter((r) => r.satisfaction !== '未评价');
    const sat = rated.filter((r) => r.satisfaction === '满意').length;
    const unsat = rated.filter((r) => r.satisfaction === '不满意').length;

    // 呼入
    const inboundRated = filteredRecords.filter((r) => r.call_type === '呼入' && r.satisfaction !== '未评价');
    const inboundSat = inboundRated.filter((r) => r.satisfaction === '满意').length;
    const inboundUnsat = inboundRated.filter((r) => r.satisfaction === '不满意').length;

    // 呼出
    const outboundRated = filteredRecords.filter((r) => r.call_type === '呼出' && r.satisfaction !== '未评价');
    const outboundSat = outboundRated.filter((r) => r.satisfaction === '满意').length;
    const outboundUnsat = outboundRated.filter((r) => r.satisfaction === '不满意').length;

    return {
      total: filteredRecords.length,
      rated: rated.length,
      satisfied: sat,
      unsatisfied: unsat,
      rate: rated.length > 0 ? `${(sat / rated.length * 100).toFixed(2)}%` : 'N/A',
      inboundRated: inboundRated.length, inboundSat, inboundUnsat,
      inboundRate: inboundRated.length > 0 ? `${(inboundSat / inboundRated.length * 100).toFixed(2)}%` : 'N/A',
      outboundRated: outboundRated.length, outboundSat, outboundUnsat,
      outboundRate: outboundRated.length > 0 ? `${(outboundSat / outboundRated.length * 100).toFixed(2)}%` : 'N/A',
    };
  }, [filteredRecords]);

  // ── 渲染 ────────────────────────────────────────────────────
  if (loading) return <Spin size="large" style={{ display: 'block', margin: '80px auto' }} />;
  if (error) return <Alert type="error" message="数据加载失败" description={error} showIcon />;
  if (!data) return <Alert type="info" message="暂无数据" showIcon />;

  const columns = [
    {
      title: '时间',
      dataIndex: 'start_time',
      key: 'start_time',
      width: 160,
      ...getColumnSearchProps('start_time', '搜索时间'),
      render: (v: string) => v || '—',
    },
    {
      title: '主叫号码',
      dataIndex: 'customer_phone',
      key: 'customer_phone',
      width: 130,
      ...getColumnSearchProps('customer_phone', '搜索号码'),
      render: (v: string | null) => maskPhone(v),
    },
    {
      title: '通话类型',
      dataIndex: 'call_type',
      key: 'call_type',
      width: 100,
      filters: [
        { text: '呼入', value: '呼入' },
        { text: '呼出', value: '呼出' },
      ],
      filteredValue: tableFilters['call_type'] || null,
      render: (v: string) => (
        <Tag color={directionColorMap[v] || 'default'}>{v}</Tag>
      ),
    },
    {
      title: '时长',
      dataIndex: 'call_time',
      key: 'call_time',
      width: 100,
      render: (v: number) => formatDuration(v),
    },
    {
      title: '通话结果',
      dataIndex: 'call_result',
      key: 'call_result',
      width: 110,
      filters: [
        { text: '客服接听', value: '客服接听' },
        { text: '客户接听', value: '客户接听' },
        { text: '客户未接', value: '客户未接' },
        { text: '客户挂断', value: '客户挂断' },
        { text: '客服未接', value: '客服未接' },
      ],
      filteredValue: tableFilters['call_result'] || null,
      render: (v: string) => (
        <Tag color={statusColorMap[v] || 'default'}>{v}</Tag>
      ),
    },
    {
      title: '客服',
      dataIndex: 'agent_name',
      key: 'agent_name',
      width: 100,
      ...getColumnSearchProps('agent_name', '搜索客服'),
      render: (v: string) => v || '—',
    },
    {
      title: '满意度',
      dataIndex: 'satisfaction',
      key: 'satisfaction',
      width: 100,
      filters: [
        { text: '满意', value: '满意' },
        { text: '不满意', value: '不满意' },
        { text: '未评价', value: '未评价' },
      ],
      filteredValue: tableFilters['satisfaction'] || null,
      render: (v: string) => {
        const item = satisfactionIconMap[v];
        if (!item) return <Text type="secondary">—</Text>;
        return (
          <span style={{ color: item.color }}>
            {item.icon} {item.label}
          </span>
        );
      },
    },
  ];

  return (
    <div style={{ padding: 24 }}>
      <Title level={3}><PhoneOutlined /> 呼叫中心</Title>

      {/* 筛选栏（左上角增加日期组件） */}
      <Card size="small" style={{ marginBottom: 16 }}>
        <Row gutter={16} align="middle">
          <Col>
            <Text strong>日期：</Text>
            <RangePicker
              value={dateRange}
              onChange={(dates) => {
                if (dates && dates[0] && dates[1]) {
                  setDateRange([dates[0], dates[1]]);
                } else {
                  setDateRange([null, null]);
                }
              }}
              allowClear
            />
          </Col>
          <Col>
            <Text strong>客服：</Text>
            <Select
              value={selectedAgent}
              onChange={setSelectedAgent}
              style={{ width: 150 }}
              options={[
                { value: 'all', label: '全部客服' },
                ...agents.map((a) => ({ value: a, label: a })),
              ]}
            />
          </Col>
          <Col flex="auto" />
          <Col>
            <Button
              type="primary"
              icon={<SyncOutlined />}
              loading={syncing}
              onClick={handleSync}
            >
              同步数据
            </Button>
          </Col>
        </Row>
      </Card>

      {/* 汇总卡片（一行5个：总通话数 + 总接通数 + 接通率 + 通话总时长 + 平均时长） */}
      <Row gutter={[16, 16]} style={{ marginBottom: 16 }}>
        <Col span={4}><Card size="small"><Statistic title="总通话数" value={stats.total} prefix={<PhoneOutlined />} suffix="次" /></Card></Col>
        <Col span={5}><Card size="small"><Statistic title="总接通数" value={stats.totalConnected} prefix={<CustomerServiceOutlined />} suffix="次" valueStyle={{ color: '#1677ff' }} /></Card></Col>
        <Col span={5}><Card size="small"><Statistic title="接通率" value={stats.connectRate} prefix={<RiseOutlined />} valueStyle={{ color: '#52c41a' }} /></Card></Col>
        <Col span={5}><Card size="small"><Statistic title="通话总时长" value={formatDuration(stats.totalDuration)} prefix={<ClockCircleOutlined />} /></Card></Col>
        <Col span={5}><Card size="small"><Statistic title="平均时长" value={formatDuration(stats.avgDuration)} prefix={<RiseOutlined />} /></Card></Col>
      </Row>
      <Row gutter={[16, 16]} style={{ marginBottom: 16 }}>
        <Col span={4}><Card size="small"><Statistic title="总评价数" value={satStats.rated} suffix="次" /></Card></Col>
        <Col span={5}><Card size="small"><Statistic title="满意数" value={satStats.satisfied} prefix={<SmileOutlined />} suffix="次" valueStyle={{ color: '#52c41a' }} /></Card></Col>
        <Col span={5}><Card size="small"><Statistic title="不满意数" value={satStats.unsatisfied} prefix={<FrownOutlined />} suffix="次" valueStyle={{ color: '#ff4d4f' }} /></Card></Col>
        <Col span={5}><Card size="small"><Statistic title="满意度" value={satStats.rate} prefix={<SmileOutlined />} valueStyle={{ color: '#1677ff' }} /></Card></Col>
        <Col span={5}><Card size="small"><Statistic title="参评率" value={satStats.rated > 0 ? `${(satStats.rated / satStats.total * 100).toFixed(1)}%` : 'N/A'} /></Card></Col>
      </Row>

      {/* 呼入/呼出统计（各带评价） */}
      <Row gutter={[16, 16]} style={{ marginBottom: 16 }}>
        <Col xs={24} md={12}>
          <Card
            title={<span><InboxOutlined style={{ color: '#1677ff' }} /> 呼入数据</span>}
            size="small"
          >
            <Row gutter={[8, 8]}>
              <Col span={6}><Statistic title="呼入数" value={stats.inboundCount} suffix="次" /></Col>
              <Col span={6}><Statistic title="呼入振铃数" value={stats.inboundRingCount} suffix="次" valueStyle={{ color: '#1677ff' }} /></Col>
              <Col span={6}><Statistic title="接通数" value={stats.inboundConnected} suffix="次" valueStyle={{ color: '#52c41a' }} /></Col>
              <Col span={6}><Statistic title="接通率" value={stats.inboundConnectRateByRing} /></Col>
              <Col span={8}><Statistic title="通话总时长" value={formatDuration(stats.inboundDuration)} /></Col>
              <Col span={8}><Statistic title="通话平均时长" value={formatDuration(stats.inboundAvg)} /></Col>
              <Col span={8}>
                <Statistic title="满意度" value={satStats.inboundRate} prefix={<SmileOutlined />} valueStyle={{ color: '#52c41a' }} />
              </Col>
              <Col span={8}><Statistic title="总评价数" value={satStats.inboundRated} suffix="次" /></Col>
              <Col span={8}><Statistic title="满意数" value={satStats.inboundSat} prefix={<SmileOutlined />} suffix="次" valueStyle={{ color: '#52c41a' }} /></Col>
              <Col span={8}><Statistic title="不满意数" value={satStats.inboundUnsat} prefix={<FrownOutlined />} suffix="次" valueStyle={{ color: '#ff4d4f' }} /></Col>
            </Row>
          </Card>
        </Col>
        <Col xs={24} md={12}>
          <Card
            title={<span><PhoneOutlined style={{ color: '#fa8c16' }} /> 呼出数据</span>}
            size="small"
          >
            <Row gutter={[8, 8]}>
              <Col span={8}><Statistic title="呼出数" value={stats.outboundCount} suffix="次" /></Col>
              <Col span={8}><Statistic title="接通数" value={stats.outboundConnected} suffix="次" valueStyle={{ color: '#52c41a' }} /></Col>
              <Col span={8}><Statistic title="接通率" value={stats.outboundCount > 0 ? `${(stats.outboundConnected / stats.outboundCount * 100).toFixed(0)}%` : 'N/A'} /></Col>
              <Col span={8}><Statistic title="通话总时长" value={formatDuration(stats.outboundDuration)} /></Col>
              <Col span={8}><Statistic title="通话平均时长" value={formatDuration(stats.outboundAvg)} /></Col>
              <Col span={8}>
                <Statistic title="满意度" value={satStats.outboundRate} prefix={<SmileOutlined />} valueStyle={{ color: '#52c41a' }} />
              </Col>
              <Col span={8}><Statistic title="总评价数" value={satStats.outboundRated} suffix="次" /></Col>
              <Col span={8}><Statistic title="满意数" value={satStats.outboundSat} prefix={<SmileOutlined />} suffix="次" valueStyle={{ color: '#52c41a' }} /></Col>
              <Col span={8}><Statistic title="不满意数" value={satStats.outboundUnsat} prefix={<FrownOutlined />} suffix="次" valueStyle={{ color: '#ff4d4f' }} /></Col>
            </Row>
          </Card>
        </Col>
      </Row>

      {/* 折线图 */}
      <Card
        title={<span><RiseOutlined /> 通话趋势</span>}
        size="small"
        style={{ marginBottom: 16 }}
        extra={<Segmented value={trendMode} onChange={setTrendMode} options={['日', '周', '月']} />}
      >
        <ReactEChartsCore
          echarts={echarts}
          option={echartOption}
          style={{ height: 260 }}
          notMerge
        />
      </Card>

      {/* 通话记录列表 */}
      <Card title={<span><TeamOutlined /> 通话记录</span>} size="small">
        <Table
          dataSource={filteredRecords}
          columns={columns}
          rowKey="id"
          pagination={{ pageSize: 10, showSizeChanger: false }}
          onChange={(_pagination: any, filters: any) => setTableFilters(filters)}
          size="small"
          scroll={{ x: 800 }}
        />
        <div style={{ padding: '8px 0', color: '#666', fontSize: 13 }}>
          共 <strong>{filteredRecords.length}</strong> 条，每页显示 <strong>10</strong> 条
        </div>
      </Card>
    </div>
  );
}

export default CallCenterPage;
export { CallCenterPage };
