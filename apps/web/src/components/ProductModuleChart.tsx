import { Card } from 'antd';
import ReactECharts from 'echarts-for-react';
import { useMemo } from 'react';
import type { ProductModuleDistribution } from '../types/kpi';

interface Props {
  data: ProductModuleDistribution | null;
  loading?: boolean;
  title?: string;
  onModuleClick?: (module: string) => void;
}

export function ProductModuleChart({ data, loading, title = '产品模块分布', onModuleClick }: Props) {
  const topModules = useMemo(() => {
    if (!data) return [];
    // 只展示有明确产品模块名称的数据，不归总「其他」
    return data.distribution.slice(0, 15);
  }, [data]);

  const barOption = useMemo(
    () => ({
      tooltip: {
        trigger: 'axis' as const,
        axisPointer: { type: 'shadow' as const },
        formatter: (params: Array<{ name: string; value: number }>) => {
          const p = params[0];
          const total = topModules.reduce((sum, m) => sum + m.count, 0);
          const percent = total > 0 ? ((p.value / total) * 100).toFixed(1) : '0.0';
          return `${p.name}<br/>数量: ${p.value}<br/>占比: ${percent}%`;
        },
      },
      grid: { left: 120, right: 20, top: 40, bottom: 40 },
      xAxis: {
        type: 'value' as const,
        axisLabel: { formatter: (v: number) => `${v}` },
      },
      yAxis: {
        type: 'category' as const,
        data: topModules.map((m) => m.module).reverse(),
        axisLabel: {
          width: 100,
          overflow: 'truncate' as const,
        },
      },
      series: [
        {
          type: 'bar',
          data: topModules
            .map((m) => ({
              value: m.count,
              itemStyle: {
                color: m.percentage > 0.3 ? '#f56c6c' : m.percentage > 0.1 ? '#e6a23c' : '#409eff',
              },
            }))
            .reverse(),
          barMaxWidth: 32,
          label: {
            show: true,
            position: 'right' as const,
            formatter: (p: { value: number }) => `${p.value}`,
          },
        },
      ],
    }),
    [topModules],
  );

  const pieOption = useMemo(
    () => ({
      tooltip: {
        trigger: 'item' as const,
        formatter: (p: { name: string; value: number; percent: number }) =>
          `${p.name}<br/>数量: ${p.value}<br/>占比: ${p.percent}%`,
      },
      series: [
        {
          type: 'pie',
          radius: ['30%', '60%'],
          center: ['50%', '55%'],
          data: topModules.map((m) => ({
            name: m.module,
            value: m.count,
          })),
          label: {
            show: true,
            formatter: (p: { name: string; percent: number }) => `${p.name}\n${p.percent}%`,
          },
          emphasis: {
            itemStyle: {
              shadowBlur: 10,
              shadowOffsetX: 0,
              shadowColor: 'rgba(0, 0, 0, 0.5)',
            },
          },
        },
      ],
    }),
    [topModules],
  );

  const onEvents = useMemo(
    () => ({
      click: (params: { name: string }) => {
        if (onModuleClick) {
          onModuleClick(params.name);
        }
      },
    }),
    [onModuleClick],
  );

  const cardTitle = (
    <span style={{ fontWeight: 600 }}>{title}</span>
  );

  if (loading) {
    return (
      <Card
        title={cardTitle}
        style={{ marginTop: 16, borderRadius: 8, boxShadow: '0 1px 2px rgba(0,0,0,0.03)' }}
      >
        <div className="flex h-80 items-center justify-center text-gray-400">加载中...</div>
      </Card>
    );
  }

  if (!data || data.distribution.length === 0) {
    return (
      <Card
        title={cardTitle}
        style={{ marginTop: 16, borderRadius: 8, boxShadow: '0 1px 2px rgba(0,0,0,0.03)' }}
      >
        <div className="flex h-80 items-center justify-center text-gray-400">
          所选时间范围内暂无数据
        </div>
      </Card>
    );
  }

  return (
    <Card
      title={cardTitle}
      style={{ marginTop: 16, borderRadius: 8, boxShadow: '0 1px 2px rgba(0,0,0,0.03)' }}
    >
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <ReactECharts option={barOption} style={{ height: Math.max(240, topModules.length * 36) }} onEvents={onEvents} />
        <ReactECharts option={pieOption} style={{ height: 320 }} onEvents={onEvents} />
      </div>
    </Card>
  );
}
