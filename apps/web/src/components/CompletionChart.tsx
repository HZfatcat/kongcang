import ReactECharts from 'echarts-for-react';
import type { KpiOverview } from '../types/kpi';

interface Props {
  data: KpiOverview;
}

export function CompletionChart({ data }: Props) {
  const option = {
    tooltip: {
      trigger: 'axis',
    },
    xAxis: {
      type: 'category',
      data: ['满意度', '需求关单率'],
    },
    yAxis: {
      type: 'value',
      min: 0,
      max: 1,
      axisLabel: {
        formatter: (value: number) => `${value * 100}%`,
      },
    },
    series: [
      {
        type: 'bar',
        data: [data.satisfactionRate, data.demandCompletionRate],
      },
    ],
  };

  return <ReactECharts option={option} style={{ height: 320 }} />;
}
