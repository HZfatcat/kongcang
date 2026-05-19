import React, { useState, useEffect } from 'react';
import { Typography, Card, DatePicker, Select, Row, Col, Statistic, Spin, Alert, Tooltip } from 'antd';
import { ClockCircleOutlined, CalendarOutlined, FireOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import { fetchUdeskHeatmap, UdeskHeatmap } from '../api/udesk';

const { RangePicker } = DatePicker;
const { Title, Text } = Typography;

// 颜色渐变：从浅到深
const getHeatmapColor = (value: number, max: number) => {
  if (max === 0) return '#f0f0f0';
  const ratio = value / max;
  if (ratio === 0) return '#f0f0f0';
  if (ratio < 0.2) return '#c6e48b';
  if (ratio < 0.4) return '#7bc96f';
  if (ratio < 0.6) return '#239a3b';
  if (ratio < 0.8) return '#196127';
  return '#0a3d1a';
};

export function HeatmapPage() {
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<UdeskHeatmap | null>(null);
  const [error, setError] = useState<string | null>(null);

  // 筛选条件
  const [dateRange, setDateRange] = useState<[dayjs.Dayjs, dayjs.Dayjs]>([
    dayjs().subtract(30, 'day'),
    dayjs(),
  ]);
  const [dataType, setDataType] = useState<'session' | 'ticket'>('session');

  const loadData = async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await fetchUdeskHeatmap({
        startDate: dateRange[0].format('YYYY-MM-DD'),
        endDate: dateRange[1].format('YYYY-MM-DD'),
        type: dataType,
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
  }, [dateRange, dataType]);

  // 表格数据源
  const getTableDataSource = () => {
    if (!data) return [];
    // 每列是一小时，每行是一天
    return data.days.map((day, dayIndex) => ({
      key: dayIndex,
      day,
      hours: data.matrix[dayIndex],
    }));
  };

  return (
    <div style={{ padding: 24 }}>
      <div className="page-header" style={{ marginBottom: 24, position: 'relative' }}>
        <Title level={4} style={{ margin: 0 }}>时段热力图</Title>
        <Text type="secondary">分析客服咨询/工单的时间分布，优化排班效率</Text>
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
          <Col>
            <Select
              value={dataType}
              onChange={setDataType}
              style={{ width: 120 }}
              options={[
                { value: 'session', label: '会话量' },
                { value: 'ticket', label: '工单量' },
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
        <Alert type="error" message={error} />
      ) : data ? (
        <>
          {/* 统计卡片 */}
          <Row gutter={16} style={{ marginBottom: 24 }}>
            <Col span={6}>
              <Card size="small">
                <Statistic
                  title="总计"
                  value={data.total}
                  prefix={<CalendarOutlined />}
                  suffix={dataType === 'session' ? '次会话' : '个工单'}
                />
              </Card>
            </Col>
            <Col span={6}>
              <Card size="small">
                <Statistic
                  title="高峰时段"
                  value={data.peakHours[0] ? `${data.peakHours[0].hour}:00` : '-'}
                  prefix={<ClockCircleOutlined />}
                  suffix={data.peakHours[0] ? ` (${data.peakHours[0].count}次)` : ''}
                />
              </Card>
            </Col>
            <Col span={6}>
              <Card size="small">
                <Statistic
                  title="高峰日"
                  value={data.peakDays[0]?.dayName || '-'}
                  prefix={<FireOutlined />}
                  suffix={data.peakDays[0] ? ` (${data.peakDays[0].count}次)` : ''}
                />
              </Card>
            </Col>
            <Col span={6}>
              <Card size="small">
                <Statistic
                  title="峰值"
                  value={data.max}
                  suffix="次/时段"
                />
              </Card>
            </Col>
          </Row>

          {/* Top 5 繁忙时段 */}
          <Row gutter={16} style={{ marginBottom: 24 }}>
            <Col span={12}>
              <Card title="Top 5 繁忙时段" size="small">
                {data.peakHours.slice(0, 5).map((item, index) => (
                  <div key={item.hour} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: index < 4 ? '1px solid #f0f0f0' : 'none' }}>
                    <Text>{item.hour}:00 - {item.hour + 1}:00</Text>
                    <Text strong>{item.count} 次</Text>
                  </div>
                ))}
              </Card>
            </Col>
            <Col span={12}>
              <Card title="Top 3 繁忙日" size="small">
                {data.peakDays.slice(0, 3).map((item, index) => (
                  <div key={item.day} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: index < 2 ? '1px solid #f0f0f0' : 'none' }}>
                    <Text>{item.dayName}</Text>
                    <Text strong>{item.count} 次</Text>
                  </div>
                ))}
              </Card>
            </Col>
          </Row>

          {/* 热力图 */}
          <Card title="时段热力图（颜色越深表示数量越多）" size="small">
            <div style={{ overflowX: 'auto' }}>
              <table style={{ borderCollapse: 'collapse', width: '100%', minWidth: 800 }}>
                <thead>
                  <tr>
                    <th style={{ padding: '8px 12px', textAlign: 'left', borderBottom: '1px solid #f0f0f0', width: 60 }}>时段</th>
                    {Array.from({ length: 24 }, (_, i) => (
                      <th key={i} style={{ padding: '4px', textAlign: 'center', borderBottom: '1px solid #f0f0f0', fontSize: 12, minWidth: 28 }}>
                        {i}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {data.days.map((day, dayIndex) => (
                    <tr key={dayIndex}>
                      <td style={{ padding: '8px 12px', fontWeight: 500, borderBottom: '1px solid #f0f0f0' }}>
                        {day}
                      </td>
                      {Array.from({ length: 24 }, (_, hourIndex) => {
                        const count = data.matrix[dayIndex][hourIndex];
                        return (
                          <td key={hourIndex} style={{ padding: 0, textAlign: 'center' }}>
                            <Tooltip title={`${day} ${hourIndex}:00-${hourIndex + 1}:00: ${count} 次`}>
                              <div
                                style={{
                                  width: 28,
                                  height: 28,
                                  backgroundColor: getHeatmapColor(count, data.max),
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  justifyContent: 'center',
                                  fontSize: 10,
                                  color: count > data.max * 0.6 ? '#fff' : '#333',
                                  cursor: 'pointer',
                                }}
                              >
                                {count > 0 ? count : ''}
                              </div>
                            </Tooltip>
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            
            {/* 图例 */}
            <div style={{ marginTop: 16, display: 'flex', alignItems: 'center', gap: 8 }}>
              <Text type="secondary">图例：</Text>
              <Text type="secondary">少</Text>
              {['#f0f0f0', '#c6e48b', '#7bc96f', '#239a3b', '#196127', '#0a3d1a'].map((color, i) => (
                <div
                  key={i}
                  style={{
                    width: 16,
                    height: 16,
                    backgroundColor: color,
                    borderRadius: 2,
                  }}
                />
              ))}
              <Text type="secondary">多</Text>
            </div>
          </Card>

          {/* 排班建议 */}
          <Card title="排班建议" size="small" style={{ marginTop: 16 }}>
            <Alert
              type="info"
              showIcon
              message={[
                data.peakHours[0] && `高峰时段集中在 ${data.peakHours[0].hour}:00 左右，建议在此时段增加人手`,
                data.peakDays[0] && `${data.peakDays[0].dayName}是高峰日，建议增加排班`,
                data.peakHours.filter(h => h.hour >= 11 && h.hour <= 14).length > 0 && '午间时段(11:00-14:00)需求较高，建议安排轮班就餐',
                data.peakHours.filter(h => h.hour >= 9 && h.hour <= 11).length > 0 && '上午时段(9:00-11:00)客流量大，建议全员在岗',
              ].filter(Boolean).join('；') || '暂无足够数据生成排班建议'}
            />
          </Card>
        </>
      ) : null}
    </div>
  );
}
