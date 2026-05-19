import { Card, Col, Progress, Row, Statistic } from 'antd';
import type { KpiOverview } from '../types/kpi';

interface Props {
  data: KpiOverview;
}

const toPercent = (value: number) => Number((value * 100).toFixed(2));

export function KpiCards({ data }: Props) {
  return (
    <Row gutter={[16, 16]}>
      <Col span={12}>
        <Card title="用户满意度">
          <Statistic value={toPercent(data.satisfactionRate)} suffix="%" />
          <Progress percent={toPercent(data.satisfactionRate)} />
          <div>已评分会话：{data.ratedSessions}</div>
        </Card>
      </Col>
      <Col span={12}>
        <Card title="咨询转需求关单率">
          <Statistic value={toPercent(data.demandCompletionRate)} suffix="%" />
          <Progress percent={toPercent(data.demandCompletionRate)} />
          <div>
            转需求会话：{data.consultToDemandCount} / 完成需求：{data.completedDemandCount}
          </div>
        </Card>
      </Col>
    </Row>
  );
}
