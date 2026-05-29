import { useState, useEffect } from 'react';
import { Card, DatePicker, Row, Col, Statistic, Spin, Alert, Typography } from 'antd';
import { PhoneOutlined, InboxOutlined, ClockCircleOutlined, SmileOutlined, CustomerServiceOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';

const { RangePicker } = DatePicker;
const { Title, Text } = Typography;

interface CallCenterData {
  dateRange: { startDate: string; endDate: string };
  inboundTotal: number;
  inboundConnected: number;
  inboundDuration: number;
  inboundAvgDuration: number;
  inboundRated: number;
  inboundSatisfaction: string;
  outboundTotal: number;
  outboundConnected: number;
  outboundDuration: number;
  outboundAvgDuration: number;
  outboundRated: number;
  outboundSatisfaction: string;
  totalCalls: number;
  records?: Array<{
    id: number;
    time: string;
    caller: string;
    direction: string;
    duration: number;
    status: string;
  }>;
}

export function CallCenterPage() {
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<CallCenterData | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [dateRange, setDateRange] = useState<[dayjs.Dayjs, dayjs.Dayjs]>([
    dayjs('2026-05-26'),
    dayjs('2026-05-26'),
  ]);

  const loadData = async () => {
    setLoading(true);
    setError(null);
    try {
      // TODO: 对接后端 API /udesc/call-center
      // const resp = await fetchUdescCallCenter({
      //   startDate: dateRange[0].format('YYYY-MM-DD'),
      //   endDate: dateRange[1].format('YYYY-MM-DD'),
      // });
      // setData(resp);

      // 暂时使用 Python 脚本跑的示例数据
      setData(SAMPLE_DATA);
    } catch (err: any) {
      setError(err.message || '加载数据失败');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [dateRange]);

  return (
    <div style={{ padding: 24 }}>
      <div className="page-header" style={{ marginBottom: 24 }}>
        <Title level={4} style={{ margin: 0 }}>呼叫中心</Title>
        <Text type="secondary">通话统计总览，与 Udesk 后台报表对齐</Text>
      </div>

      {/* 筛选区域 */}
      <Card size="small" style={{ marginBottom: 16 }}>
        <Row gutter={16} align="middle">
          <Col>
            <RangePicker
              value={dateRange}
              onChange={(dates) => dates && setDateRange(dates as [dayjs.Dayjs, dayjs.Dayjs])}
              allowClear={false}
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
          {/* 呼入统计 */}
          <Card title="呼入统计" size="small" style={{ marginBottom: 16 }}>
            <Row gutter={[16, 16]}>
              <Col span={6}>
                <Statistic title="呼入数" value={data.inboundTotal} prefix={<InboxOutlined />} />
              </Col>
              <Col span={6}>
                <Statistic title="呼入接通数" value={data.inboundConnected} prefix={<PhoneOutlined />} suffix={`/ ${data.inboundTotal}`} />
              </Col>
              <Col span={6}>
                <Statistic title="呼入通话总时长(秒)" value={data.inboundDuration} prefix={<ClockCircleOutlined />} />
              </Col>
              <Col span={6}>
                <Statistic title="呼入平均时长(秒)" value={data.inboundAvgDuration} prefix={<ClockCircleOutlined />} />
              </Col>
              <Col span={6}>
                <Statistic title="呼入参评数" value={data.inboundRated} prefix={<SmileOutlined />} />
              </Col>
              <Col span={6}>
                <Statistic title="呼入满意度" value={data.inboundSatisfaction} prefix={<SmileOutlined />} />
              </Col>
            </Row>
          </Card>

          {/* 呼出统计 */}
          <Card title="呼出统计" size="small" style={{ marginBottom: 16 }}>
            <Row gutter={[16, 16]}>
              <Col span={6}>
                <Statistic title="呼出数" value={data.outboundTotal} prefix={<CustomerServiceOutlined />} />
              </Col>
              <Col span={6}>
                <Statistic title="呼出接通数" value={data.outboundConnected} prefix={<PhoneOutlined />} />
              </Col>
              <Col span={6}>
                <Statistic title="呼出通话总时长(秒)" value={data.outboundDuration} prefix={<ClockCircleOutlined />} />
              </Col>
              <Col span={6}>
                <Statistic title="呼出平均时长(秒)" value={data.outboundAvgDuration} prefix={<ClockCircleOutlined />} />
              </Col>
              <Col span={6}>
                <Statistic title="呼出参评数" value={data.outboundRated} prefix={<SmileOutlined />} />
              </Col>
              <Col span={6}>
                <Statistic title="呼出满意度" value={data.outboundSatisfaction} prefix={<SmileOutlined />} />
              </Col>
            </Row>
          </Card>

          {/* 汇总 */}
          <Card title="汇总" size="small">
            <Row gutter={[16, 16]}>
              <Col span={6}>
                <Statistic title="总通话数" value={data.totalCalls} prefix={<PhoneOutlined />} />
              </Col>
            </Row>
          </Card>
        </>
      ) : null}
    </div>
  );
}

// Python 脚本跑出来的示例数据（2026-05-26）
const SAMPLE_DATA: CallCenterData = {
  dateRange: { startDate: '2026-05-26', endDate: '2026-05-26' },
  inboundTotal: 2,
  inboundConnected: 2,
  inboundDuration: 197,
  inboundAvgDuration: 98.5,
  inboundRated: 0,
  inboundSatisfaction: 'N/A',
  outboundTotal: 0,
  outboundConnected: 0,
  outboundDuration: 0,
  outboundAvgDuration: 0,
  outboundRated: 0,
  outboundSatisfaction: 'N/A',
  totalCalls: 2,
};
