import { useState, useEffect } from 'react';
import { Card, DatePicker, Row, Col, Statistic, Spin, Alert, Typography } from 'antd';
import { PhoneOutlined, InboxOutlined, ClockCircleOutlined, SmileOutlined, CustomerServiceOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import { fetchCallCenterData, CallCenterStats } from '../api/udesc';

const { RangePicker } = DatePicker;
const { Title, Text } = Typography;

export function CallCenterPage() {
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<CallCenterStats | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [dateRange, setDateRange] = useState<[dayjs.Dayjs, dayjs.Dayjs]>([
    dayjs(),
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

  useEffect(() => {
    loadData();
  }, [dateRange]);

  return (
    <div style={{ padding: 24 }}>
      <div className="page-header" style={{ marginBottom: 24 }}>
        <Title level={4} style={{ margin: 0 }}>呼叫中心</Title>
        <Text type="secondary">通话统计总览，数据实时从 Udesk API 获取</Text>
      </div>

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
          <Card title="呼入统计" size="small" style={{ marginBottom: 16 }}>
            <Row gutter={[16, 16]}>
              <Col span={6}>
                <Statistic title="呼入数" value={data.inbound.total} prefix={<InboxOutlined />} />
              </Col>
              <Col span={6}>
                <Statistic title="呼入接通数" value={data.inbound.connected} prefix={<PhoneOutlined />} suffix={`/ ${data.inbound.total}`} />
              </Col>
              <Col span={6}>
                <Statistic title="呼入通话总时长(秒)" value={data.inbound.totalDuration} prefix={<ClockCircleOutlined />} />
              </Col>
              <Col span={6}>
                <Statistic title="呼入平均时长(秒)" value={data.inbound.avgDuration} prefix={<ClockCircleOutlined />} />
              </Col>
              <Col span={6}>
                <Statistic title="呼入参评数" value={data.inbound.rated} prefix={<SmileOutlined />} />
              </Col>
              <Col span={6}>
                <Statistic title="呼入满意度" value={data.inbound.satisfaction} prefix={<SmileOutlined />} />
              </Col>
            </Row>
          </Card>

          <Card title="呼出统计" size="small" style={{ marginBottom: 16 }}>
            <Row gutter={[16, 16]}>
              <Col span={6}>
                <Statistic title="呼出数" value={data.outbound.total} prefix={<CustomerServiceOutlined />} />
              </Col>
              <Col span={6}>
                <Statistic title="呼出接通数" value={data.outbound.connected} prefix={<PhoneOutlined />} />
              </Col>
              <Col span={6}>
                <Statistic title="呼出通话总时长(秒)" value={data.outbound.totalDuration} prefix={<ClockCircleOutlined />} />
              </Col>
              <Col span={6}>
                <Statistic title="呼出平均时长(秒)" value={data.outbound.avgDuration} prefix={<ClockCircleOutlined />} />
              </Col>
              <Col span={6}>
                <Statistic title="呼出参评数" value={data.outbound.rated} prefix={<SmileOutlined />} />
              </Col>
              <Col span={6}>
                <Statistic title="呼出满意度" value={data.outbound.satisfaction} prefix={<SmileOutlined />} />
              </Col>
            </Row>
          </Card>

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
