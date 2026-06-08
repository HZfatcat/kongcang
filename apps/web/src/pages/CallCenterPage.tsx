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
  Progress,
  Segmented,
} from 'antd';
import {
  PhoneOutlined,
  InboxOutlined,
  ClockCircleOutlined,
  SmileOutlined,
  CustomerServiceOutlined,
  RiseOutlined,
  ArrowUpOutlined,
  ArrowDownOutlined,
} from '@ant-design/icons';
import dayjs from 'dayjs';
import ReactECharts from 'echarts-for-react';
import { fetchCallCenterData, CallCenterStats } from '../api/udesc';

const { RangePicker } = DatePicker;
const { Title, Text } = Typography;

const callResultColorMap: Record<string, string> = {
  '客服接听': 'green',
  '客户接听': 'blue',
  '未接听': 'red',
  '客户挂断': 'orange',
  '系统挂断': 'default',
};

const satisfactionColorMap: Record<string, string> = {
  '满意': 'green',
  '一般': 'orange',
  '不满意': 'red',
  '未评': 'default',
};

export function CallCenterPage() {
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<CallCenterStats | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [dateRange, setDateRange] = useState<[dayjs.Dayjs, dayjs.Dayjs]>([
    dayjs(),
    dayjs(),
  ]);
  const [chartView, setChartView] = useState<'overview' | 'trend'>('overview');

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

  useEffect(() => {
    loadData();
  }, [dateRange]);

  // ---- ECharts options ----

  const overviewChartOption = useMemo(() => {
    if (!data) return {};
    const { inbound, outbound } = data;
    return {
      tooltip: { trigger: 'axis' as const },
      legend: { data: ['呼入', '呼出'], bottom: 0 },
      grid: { left: 50, right: 20, bottom: 40, top: 20 },
      xAxis: {
        type: 'category',
        data: ['总通话数', '接通数', '总时长(秒)', '平均时长(秒)', '参评数'],
        axisLabel: { rotate: 15, fontSize: 11 },
      },
      yAxis: [
        { type: 'value', name: '数量' },
        { type: 'value', name: '时长', nameTextStyle: { fontSize: 11 } },
      ],
      series: [
        {
          name: '呼入',
          type: 'bar',
          barWidth: '30%',
          barGap: '15%',
          data: [
            inbound.total,
            inbound.connected,
            inbound.totalDuration,
            inbound.avgDuration,
            inbound.rated,
          ],
          itemStyle: { color: '#1890ff', borderRadius: [4, 4, 0, 0] },
          label: { show: true, position: 'top', fontSize: 10 },
        },
        {
          name: '呼出',
          type: 'bar',
          barWidth: '30%',
          data: [
            outbound.total,
            outbound.connected,
            outbound.totalDuration,
            outbound.avgDuration,
            outbound.rated,
          ],
          itemStyle: { color: '#52c41a', borderRadius: [4, 4, 0, 0] },
          label: { show: true, position: 'top', fontSize: 10 },
        },
      ],
    };
  }, [data]);

  const connectionRateOption = useMemo(() => {
    if (!data) return {};
    const { inbound, outbound } = data;
    const inRate = inbound.total > 0
      ? Math.round((inbound.connected / inbound.total) * 100)
      : 0;
    const outRate = outbound.total > 0
      ? Math.round((outbound.connected / outbound.total) * 100)
      : 0;

    return {
      tooltip: { trigger: 'item', formatter: '{b}: {c}%' },
      series: [
        {
          type: 'gauge',
          center: ['25%', '55%'],
          radius: '70%',
          startAngle: 200,
          endAngle: -20,
          min: 0,
          max: 100,
          splitNumber: 5,
          progress: { show: true, width: 12 },
          axisLine: { lineStyle: { width: 12 } },
          axisTick: { show: false },
          splitLine: { show: false },
          axisLabel: { show: false },
          detail: {
            formatter: '呼入\n{b}%',
            fontSize: 13,
            offsetCenter: [0, '30%'],
          },
          data: [{ value: inRate, name: '呼入接通率', itemStyle: { color: '#1890ff' } }],
        },
        {
          type: 'gauge',
          center: ['75%', '55%'],
          radius: '70%',
          startAngle: 200,
          endAngle: -20,
          min: 0,
          max: 100,
          splitNumber: 5,
          progress: { show: true, width: 12 },
          axisLine: { lineStyle: { width: 12 } },
          axisTick: { show: false },
          splitLine: { show: false },
          axisLabel: { show: false },
          detail: {
            formatter: '呼出\n{b}%',
            fontSize: 13,
            offsetCenter: [0, '30%'],
          },
          data: [{ value: outRate, name: '呼出接通率', itemStyle: { color: '#52c41a' } }],
        },
      ],
    };
  }, [data]);

  const satisfactionOption = useMemo(() => {
    if (!data) return {};
    const { inbound, outbound } = data;
    const inSat = parseFloat(inbound.satisfaction) || 0;
    const outSat = parseFloat(outbound.satisfaction) || 0;

    return {
      tooltip: { trigger: 'item', formatter: '{b}: {c}%' },
      series: [
        {
          type: 'gauge',
          center: ['25%', '55%'],
          radius: '70%',
          startAngle: 200,
          endAngle: -20,
          min: 0,
          max: 100,
          splitNumber: 5,
          progress: { show: true, width: 12 },
          axisLine: { lineStyle: { width: 12, color: [[1, '#f0f0f0']] } },
          axisTick: { show: false },
          splitLine: { show: false },
          axisLabel: { show: false },
          detail: {
            formatter: '呼入\n{b}%',
            fontSize: 13,
            offsetCenter: [0, '30%'],
          },
          data: [{ value: inSat, name: '呼入满意度', itemStyle: { color: '#722ed1' } }],
        },
        {
          type: 'gauge',
          center: ['75%', '55%'],
          radius: '70%',
          startAngle: 200,
          endAngle: -20,
          min: 0,
          max: 100,
          splitNumber: 5,
          progress: { show: true, width: 12 },
          axisLine: { lineStyle: { width: 12, color: [[1, '#f0f0f0']] } },
          axisTick: { show: false },
          splitLine: { show: false },
          axisLabel: { show: false },
          detail: {
            formatter: '呼出\n{b}%',
            fontSize: 13,
            offsetCenter: [0, '30%'],
          },
          data: [{ value: outSat, name: '呼出满意度', itemStyle: { color: '#eb2f96' } }],
        },
      ],
    };
  }, [data]);

  // ---- Table columns ----

  const columns = [
    {
      title: '时间',
      dataIndex: 'startTime',
      key: 'startTime',
      width: 170,
      render: (v: string) => v ? dayjs(v).format('MM-DD HH:mm:ss') : '-',
    },
    {
      title: '类型',
      dataIndex: 'callType',
      key: 'callType',
      width: 80,
      render: (v: string) => (
        <Tag icon={v === '呼入' ? <InboxOutlined /> : <CustomerServiceOutlined />} color={v === '呼入' ? 'blue' : 'green'}>
          {v}
        </Tag>
      ),
    },
    {
      title: '结果',
      dataIndex: 'callResult',
      key: 'callResult',
      width: 110,
      render: (v: string) => <Tag color={callResultColorMap[v] || 'default'}>{v}</Tag>,
    },
    {
      title: '客户电话',
      dataIndex: 'customerPhone',
      key: 'customerPhone',
      width: 130,
    },
    {
      title: '客服',
      dataIndex: 'agentName',
      key: 'agentName',
      width: 100,
    },
    {
      title: '时长(秒)',
      dataIndex: 'callTime',
      key: 'callTime',
      width: 90,
      sorter: (a: any, b: any) => a.callTime - b.callTime,
      render: (v: number) => v || '-',
    },
    {
      title: '满意度',
      dataIndex: 'satisfaction',
      key: 'satisfaction',
      width: 90,
      render: (v: string) => (
        <Tag color={satisfactionColorMap[v] || 'default'}>
          {v === '满意' ? <SmileOutlined /> : null} {v}
        </Tag>
      ),
    },
  ];

  return (
    <div style={{ padding: 24 }}>
      {/* 页面标题 */}
      <div style={{ marginBottom: 24, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <Title level={4} style={{ margin: 0 }}>呼叫中心</Title>
          <Text type="secondary">通话统计总览，数据实时从 Udesk API 获取</Text>
        </div>
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
          <Col flex="auto">
            <Segmented
              value={chartView}
              onChange={(v) => setChartView(v as 'overview' | 'trend')}
              options={[
                { label: '总览', value: 'overview' },
                { label: '详情', value: 'trend' },
              ]}
            />
          </Col>
        </Row>
      </Card>

      {loading ? (
        <div style={{ textAlign: 'center', padding: 100 }}>
          <Spin size="large" />
        </div>
      ) : error ? (
        <Alert type="error" message={error} showIcon />
      ) : data ? (
        <>
          {/* 核心指标卡片 */}
          <Row gutter={[16, 16]} style={{ marginBottom: 16 }}>
            <Col xs={12} sm={8} md={6} lg={4}>
              <Card size="small" hoverable>
                <Statistic
                  title="总通话数"
                  value={data.totalCalls}
                  prefix={<PhoneOutlined />}
                  valueStyle={{ color: '#1890ff', fontSize: 24 }}
                />
              </Card>
            </Col>
            <Col xs={12} sm={8} md={6} lg={4}>
              <Card size="small" hoverable>
                <Statistic
                  title="呼入总数"
                  value={data.inbound.total}
                  prefix={<InboxOutlined />}
                  valueStyle={{ color: '#52c41a', fontSize: 24 }}
                />
              </Card>
            </Col>
            <Col xs={12} sm={8} md={6} lg={4}>
              <Card size="small" hoverable>
                <Statistic
                  title="呼入接通"
                  value={data.inbound.connected}
                  prefix={<RiseOutlined />}
                  suffix={
                    <Text style={{ fontSize: 13, color: '#999' }}>
                      / {data.inbound.total}
                    </Text>
                  }
                  valueStyle={{ color: '#1890ff', fontSize: 24 }}
                />
              </Card>
            </Col>
            <Col xs={12} sm={8} md={6} lg={4}>
              <Card size="small" hoverable>
                <Statistic
                  title="呼出总数"
                  value={data.outbound.total}
                  prefix={<CustomerServiceOutlined />}
                  valueStyle={{ color: '#722ed1', fontSize: 24 }}
                />
              </Card>
            </Col>
            <Col xs={12} sm={8} md={6} lg={4}>
              <Card size="small" hoverable>
                <Statistic
                  title="呼出接通"
                  value={data.outbound.connected}
                  prefix={<RiseOutlined />}
                  suffix={
                    <Text style={{ fontSize: 13, color: '#999' }}>
                      / {data.outbound.total}
                    </Text>
                  }
                  valueStyle={{ color: '#722ed1', fontSize: 24 }}
                />
              </Card>
            </Col>
            <Col xs={12} sm={8} md={6} lg={4}>
              <Card size="small" hoverable>
                <Statistic
                  title="平均时长"
                  value={Math.round(
                    (data.inbound.avgDuration + data.outbound.avgDuration) / 2
                  )}
                  prefix={<ClockCircleOutlined />}
                  suffix="秒"
                  valueStyle={{ color: '#fa8c16', fontSize: 24 }}
                />
              </Card>
            </Col>
          </Row>

          {chartView === 'overview' ? (
            <>
              {/* 对比柱状图 + 接通率 */}
              <Row gutter={[16, 16]} style={{ marginBottom: 16 }}>
                <Col span={16}>
                  <Card title="呼入 vs 呼出 对比" size="small">
                    <ReactECharts option={overviewChartOption} style={{ height: 280 }} />
                  </Card>
                </Col>
                <Col span={8}>
                  <Card title="接通率" size="small">
                    <ReactECharts option={connectionRateOption} style={{ height: 200 }} />
                  </Card>
                  <Card title="满意度" size="small" style={{ marginTop: 16 }}>
                    <ReactECharts option={satisfactionOption} style={{ height: 200 }} />
                  </Card>
                </Col>
              </Row>
            </>
          ) : (
            <>
              {/* 呼入/呼出详情卡片 */}
              <Row gutter={[16, 16]} style={{ marginBottom: 16 }}>
                <Col span={12}>
                  <Card
                    title={
                      <Space>
                        <InboxOutlined style={{ color: '#1890ff' }} />
                        <span>呼入统计</span>
                      </Space>
                    }
                    size="small"
                  >
                    <Row gutter={[8, 16]}>
                      <Col span={12}>
                        <Statistic title="呼入数" value={data.inbound.total} />
                      </Col>
                      <Col span={12}>
                        <Statistic title="接通数" value={data.inbound.connected} />
                      </Col>
                      <Col span={12}>
                        <Statistic title="通话总时长(秒)" value={data.inbound.totalDuration} />
                      </Col>
                      <Col span={12}>
                        <Statistic title="平均时长(秒)" value={data.inbound.avgDuration} />
                      </Col>
                      <Col span={12}>
                        <Statistic title="参评数" value={data.inbound.rated} />
                      </Col>
                      <Col span={12}>
                        <Statistic title="满意度" value={data.inbound.satisfaction} suffix="" />
                      </Col>
                    </Row>
                  </Card>
                </Col>
                <Col span={12}>
                  <Card
                    title={
                      <Space>
                        <CustomerServiceOutlined style={{ color: '#52c41a' }} />
                        <span>呼出统计</span>
                      </Space>
                    }
                    size="small"
                  >
                    <Row gutter={[8, 16]}>
                      <Col span={12}>
                        <Statistic title="呼出数" value={data.outbound.total} />
                      </Col>
                      <Col span={12}>
                        <Statistic title="接通数" value={data.outbound.connected} />
                      </Col>
                      <Col span={12}>
                        <Statistic title="通话总时长(秒)" value={data.outbound.totalDuration} />
                      </Col>
                      <Col span={12}>
                        <Statistic title="平均时长(秒)" value={data.outbound.avgDuration} />
                      </Col>
                      <Col span={12}>
                        <Statistic title="参评数" value={data.outbound.rated} />
                      </Col>
                      <Col span={12}>
                        <Statistic title="满意度" value={data.outbound.satisfaction} suffix="" />
                      </Col>
                    </Row>
                  </Card>
                </Col>
              </Row>
            </>
          )}

          {/* 通话记录表格 */}
          <Card
            title={
              <Space>
                <PhoneOutlined />
                <span>通话记录</span>
                <Text type="secondary" style={{ fontSize: 12 }}>
                  {data.records.length} 条记录
                </Text>
              </Space>
            }
            size="small"
          >
            {data.records.length > 0 ? (
              <Table
                dataSource={data.records}
                columns={columns}
                rowKey="id"
                size="small"
                pagination={{
                  pageSize: 30,
                  showSizeChanger: false,
                  showTotal: (total) => `共 ${total} 条`,
                }}
                scroll={{ x: 780 }}
              />
            ) : (
              <div style={{ textAlign: 'center', padding: 40, color: '#999' }}>
                暂无通话记录
              </div>
            )}
          </Card>
        </>
      ) : null}
    </div>
  );
}
