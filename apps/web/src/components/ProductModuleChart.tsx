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
    // 取前 10 个模块，其余归为「其他」
    const items = data.distribution.slice(0, 10);
    const other = data.distribution.slice(10);
    if (other.length > 0) {
      items.push({
        module: '其他',
        count: other.reduce((s, d) => s + d.count, 0),
        percentage: other.reduce((s, d) => s + d.percentage, 0),
      });
    }
    return items;
  }, [data]);

  const barOption = useMemo(
    () => ({
      tooltip: {
        trigger: 'axis' as const,
        axisPointer: { type: 'shadow' as const },
        formatter: (params: Array<{ name: string; value: number; percent: number }>) => {
          const p = params[0];
          return `${p.name}<br/>数量: ${p.value}<br/>占比: ${p.percent}%`;
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
        if (onModuleClick && params.name !== '其他') {
          onModuleClick(params.name);
        }
      },
    }),
    [onModuleClick],
  );

  if (loading) {
    return (
      <div className="rounded-lg bg-white p-4 shadow">
        <h3 className="mb-3 text-base font-semibold">{title}</h3>
        <div className="flex h-80 items-center justify-center text-gray-400">加载中...</div>
      </div>
    );
  }

  if (!data || data.distribution.length === 0) {
    return (
      <div className="rounded-lg bg-white p-4 shadow">
        <h3 className="mb-3 text-base font-semibold">{title}</h3>
        <div className="flex h-80 items-center justify-center text-gray-400">
          所选时间范围内暂无数据
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-lg bg-white p-4 shadow">
      <h3 className="mb-3 text-base font-semibold">
        {title}
        <span className="ml-2 text-sm font-normal text-gray-400">
          共 {data.total} 条 | 模块 {data.distribution.length} 个
        </span>
      </h3>
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <ReactECharts option={barOption} style={{ height: Math.max(240, topModules.length * 36) }} onEvents={onEvents} />
        <ReactECharts option={pieOption} style={{ height: 320 }} onEvents={onEvents} />
      </div>
    </div>
  );
}
