import { useState, useEffect, useMemo } from 'react';
import {
  Card, DatePicker, Row, Col, Statistic, Spin,
  Alert, Typography, Select, Segmented, Table, Tag,
} from 'antd';
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

  // 筛选后的记录
  const filteredRecords = useMemo(() => {
    if (!data) return [];
    let recs = data.records;
    if (selectedAgent && selectedAgent !== 'all') {
      recs = recs.filter((r) => r.agent_name === selectedAgent);
    }
    return recs;
  }, [data, selectedAgent]);

  // 统计计算（基于筛选后的数据）
  const stats = useMemo(() => {
    const total = filteredRecords.length;
    const inbound = filteredRecords.filter((r) => r.call_type === '呼入');
    const outbound = filteredRecords.filter((r) => r.call_type === '呼出');
    const inboundConnected = inbound.filter((r) => r.call_result === '客服接听');
    const outboundConnected = outbound.filter((r) => r.call_result === '客户接听');
    const inboundDuration = inboundConnected.reduce((s, r) => s + (r.call_time || 0), 0);
    const outboundDuration = outboundConnected.reduce((s, r) => s + (r.call_time || 0), 0);
    const allConnected = [...inboundConnected, ...outboundConnected];
    const totalDuration = inboundDuration + outboundDuration;
    const avgDuration = allConnected.length > 0 ? Math.round(totalDuration / allConnected.length) : 0;
    const inboundAvg = inboundConnected.length > 0 ? Math.round(inboundDuration / inboundConnected.length) : 0;

    return {
      total,
      totalConnected: allConnected.length,
      totalDuration,
      avgDuration,
      inboundCount: inbound.length,
      inboundConnected: inboundConnected.length,
      inboundDuration,
      inboundAvg,
      outboundCount: outbound.length,
      outboundConnected: outboundConnected.length,
      outboundDuration,
      outboundAvg: outboundConnected.length > 0 ? Math.round(outboundDuration / outboundConnected.length) : 0,
    };
  }, [filteredRecords]);

  // 折线图数据（按日聚合）
  const trendData = useMemo(() => {
    const map = new Map<string, { inbound: number; outbound: number }>();
    for (const r of filteredRecords) {
      const d = r.start_time ? r.start_time.slice(0, 10) : `ID-${r.id}`;
      const e = map.get(d) || { inbound: 0, outbound: 0 };
      if (r.call_type === '呼入') e.inbound++;
      else e.outbound++;
      map.set(d, e);
    }
    const sorted = Array.from(map.entries()).sort(([a], [b]) => a.localeCompare(b));
    return {
      dates: sorted.map(([k]) => k),
      inbound: sorted.map(([, v]) => v.inbound),
      outbound: sorted.map(([, v]) => v.outbound),
    };
  }, [filteredRecords]);

  const echartOption = useMemo(() => ({
    tooltip: { trigger: 'axis' as const },
    legend: { data: ['呼入', '呼出'], bottom: 0 },
    grid: { left: 40, right: 20, top: 10, bottom: 40 },
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

  // 满意度统计（基于筛选后）
  const satStats = useMemo(() => {
    const rated = filteredRecords.filter((r) => r.satisfaction !== '未评价');
    const sat = rated.filter((r) => r.satisfaction === '满意').length;
    const unsat = rated.filter((r) => r.satisfaction === '不满意').length;
    return {
      total: filteredRecords.length,
      rated: rated.length,
      satisfied: sat,
      unsatisfied: unsat,
      rate: rated.length > 0 ? `${(sat / rated.length * 100).toFixed(1)}%` : 'N/A',
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
      render: (v: string) => v || '—',
    },
    {
      title: '主叫号码',
      dataIndex: 'customer_phone',
      key: 'customer_phone',
      render: (v: string | null) => v || '未知',
    },
    {
      title: '方向',
      dataIndex: 'call_type',
      key: 'call_type',
      render: (v: string) => (
        <Tag color={directionColorMap[v] || 'default'}>{v}</Tag>
      ),
    },
    {
      title: '时长',
      dataIndex: 'call_time',
      key: 'call_time',
      render: (v: number) => formatDuration(v),
    },
    {
      title: '状态',
      dataIndex: 'call_result',
      key: 'call_result',
      render: (v: string) => (
        <Tag color={statusColorMap[v] || 'default'}>{v}</Tag>
      ),
    },
    {
      title: '客服',
      dataIndex: 'agent_name',
      key: 'agent_name',
      render: (v: string) => v || '—',
    },
    {
      title: '满意度',
      dataIndex: 'satisfaction',
      key: 'satisfaction',
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
      {data.period && (
        <Text type="secondary" style={{ display: 'block', marginBottom: 16 }}>
          数据周期：{data.period.start} ~ {data.period.end}（共 {data.records.length} 条通话记录）
        </Text>
      )}

      {/* 筛选栏 */}
      <Card size="small" style={{ marginBottom: 16 }}>
        <Row gutter={16} align="middle">
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
            <Text type="secondary">
              筛选后：{filteredRecords.length} 条 / 总 {data.records.length} 条
            </Text>
          </Col>
        </Row>
      </Card>

      {/* 汇总卡片 */}
      <Row gutter={[16, 16]} style={{ marginBottom: 16 }}>
        <Col xs={12} sm={6}>
          <Card><Statistic title="总通话数" value={stats.total} prefix={<PhoneOutlined />} suffix="次" /></Card>
        </Col>
        <Col xs={12} sm={6}>
          <Card><Statistic title="总接通数" value={stats.totalConnected} prefix={<CustomerServiceOutlined />} suffix="次" valueStyle={{ color: '#1677ff' }} /></Card>
        </Col>
        <Col xs={12} sm={6}>
          <Card><Statistic title="通话总时长" value={formatDuration(stats.totalDuration)} prefix={<ClockCircleOutlined />} /></Card>
        </Col>
        <Col xs={12} sm={6}>
          <Card><Statistic title="平均时长" value={formatDuration(stats.avgDuration)} prefix={<RiseOutlined />} /></Card>
        </Col>
      </Row>

      {/* 呼入/呼出统计 */}
      <Row gutter={[16, 16]} style={{ marginBottom: 16 }}>
        <Col xs={24} md={12}>
          <Card
            title={<span><InboxOutlined style={{ color: '#1677ff' }} /> 呼入统计</span>}
            size="small"
          >
            <Row gutter={[8, 8]}>
              <Col span={8}><Statistic title="呼入数" value={stats.inboundCount} suffix="次" /></Col>
              <Col span={8}><Statistic title="接通数" value={stats.inboundConnected} suffix="次" valueStyle={{ color: '#52c41a' }} /></Col>
              <Col span={8}><Statistic title="接通率" value={stats.inboundCount > 0 ? `${(stats.inboundConnected / stats.inboundCount * 100).toFixed(0)}%` : 'N/A'} /></Col>
              <Col span={8}><Statistic title="总时长" value={formatDuration(stats.inboundDuration)} /></Col>
              <Col span={8}><Statistic title="平均时长" value={formatDuration(stats.inboundAvg)} /></Col>
              <Col span={8}>
                <Statistic
                  title="满意度"
                  value={satStats.rate}
                  prefix={<SmileOutlined />}
                  valueStyle={{ color: '#52c41a' }}
                />
              </Col>
            </Row>
          </Card>
        </Col>
        <Col xs={24} md={12}>
          <Card
            title={<span><PhoneOutlined style={{ color: '#fa8c16' }} /> 呼出统计</span>}
            size="small"
          >
            <Row gutter={[8, 8]}>
              <Col span={8}><Statistic title="呼出数" value={stats.outboundCount} suffix="次" /></Col>
              <Col span={8}><Statistic title="接通数" value={stats.outboundConnected} suffix="次" valueStyle={{ color: '#52c41a' }} /></Col>
              <Col span={8}><Statistic title="接通率" value={stats.outboundCount > 0 ? `${(stats.outboundConnected / stats.outboundCount * 100).toFixed(0)}%` : 'N/A'} /></Col>
              <Col span={8}><Statistic title="总时长" value={formatDuration(stats.outboundDuration)} /></Col>
              <Col span={8}><Statistic title="平均时长" value={formatDuration(stats.outboundAvg)} /></Col>
              <Col span={8}>
                <Statistic
                  title="满意度"
                  value={satStats.rate}
                  prefix={<SmileOutlined />}
                  valueStyle={{ color: '#52c41a' }}
                />
              </Col>
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
          size="small"
          scroll={{ x: 800 }}
        />
      </Card>
    </div>
  );
}

export default CallCenterPage;
export { CallCenterPage };
