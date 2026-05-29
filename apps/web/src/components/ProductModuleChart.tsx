import { Card } from 'antd';
import ReactECharts from 'echarts-for-react';
import { useMemo } from 'react';
import type { ProductModuleDistribution } from '../types/kpi';

interface Props {
  data: ProductModuleDistribution | null;
  loading?: boolean;
  title?: string;
  onModuleClick?: (module: string) => void;
  colorScheme?: 'purple' | 'red' | 'blue';
}

const glassCardStyle: React.CSSProperties = {
  borderRadius: 16,
  background: 'rgba(255,255,255,0.85)',
  backdropFilter: 'blur(20px)',
  border: '1px solid rgba(255,255,255,0.4)',
  boxShadow: '0 2px 12px rgba(0,0,0,0.05)',
};

// 三套配色方案
const palettes: Record<string, string[]> = {
  purple: [
    'rgba(99,102,241,0.85)',
    'rgba(129,140,248,0.85)',
    'rgba(165,180,252,0.85)',
    'rgba(148,163,184,0.75)',
    'rgba(100,116,139,0.75)',
    'rgba(71,85,105,0.75)',
    'rgba(79,70,229,0.7)',
    'rgba(67,56,202,0.7)',
    'rgba(55,48,163,0.7)',
    'rgba(203,213,225,0.7)',
    'rgba(148,163,184,0.5)',
    'rgba(100,116,139,0.5)',
    'rgba(71,85,105,0.5)',
    'rgba(51,65,85,0.5)',
    'rgba(30,41,59,0.5)',
  ],
  red: [
    'rgba(225,29,72,0.85)',
    'rgba(244,63,94,0.85)',
    'rgba(251,113,133,0.85)',
    'rgba(252,165,165,0.75)',
    'rgba(190,18,60,0.75)',
    'rgba(159,18,57,0.75)',
    'rgba(136,19,55,0.7)',
    'rgba(112,18,51,0.7)',
    'rgba(76,5,25,0.7)',
    'rgba(203,213,225,0.7)',
    'rgba(148,163,184,0.5)',
    'rgba(100,116,139,0.5)',
    'rgba(71,85,105,0.5)',
    'rgba(51,65,85,0.5)',
    'rgba(30,41,59,0.5)',
  ],
  blue: [
    'rgba(37,99,235,0.85)',
    'rgba(59,130,246,0.85)',
    'rgba(96,165,250,0.85)',
    'rgba(147,197,253,0.75)',
    'rgba(29,78,216,0.75)',
    'rgba(30,64,175,0.75)',
    'rgba(23,37,84,0.7)',
    'rgba(30,58,138,0.7)',
    'rgba(49,46,129,0.7)',
    'rgba(203,213,225,0.7)',
    'rgba(148,163,184,0.5)',
    'rgba(100,116,139,0.5)',
    'rgba(71,85,105,0.5)',
    'rgba(51,65,85,0.5)',
    'rgba(30,41,59,0.5)',
  ],
};

export function ProductModuleChart({ data, loading, title = '产品模块分布', onModuleClick, colorScheme = 'purple' }: Props) {
  const topModules = useMemo(() => {
    if (!data) return [];
    return data.distribution.slice(0, 15);
  }, [data]);

  const barOption = useMemo(
    () => ({
      tooltip: {
        trigger: 'axis' as const,
        axisPointer: { type: 'shadow' as const },
        backgroundColor: 'rgba(255,255,255,0.95)',
        borderColor: 'rgba(0,0,0,0.06)',
        borderWidth: 1,
        borderRadius: 8,
        padding: [10, 14],
        textStyle: { fontSize: 13, color: '#1e293b' },
        formatter: (params: Array<{ name: string; value: number }>) => {
          const p = params[0];
          const total = topModules.reduce((sum, m) => sum + m.count, 0);
          const percent = total > 0 ? ((p.value / total) * 100).toFixed(1) : '0.0';
          return `<strong>${p.name}</strong><br/>数量: ${p.value}<br/>占比: ${percent}%`;
        },
      },
      grid: { left: 130, right: 50, top: 16, bottom: 30 },
      xAxis: {
        type: 'value' as const,
        splitLine: { lineStyle: { color: 'rgba(0,0,0,0.05)', type: 'dashed' as const } },
        axisLabel: { color: '#94a3b8', fontSize: 11 },
        axisLine: { show: false },
        axisTick: { show: false },
      },
      yAxis: {
        type: 'category' as const,
        data: topModules.map((m) => m.module).reverse(),
        axisLabel: {
          width: 110,
          overflow: 'truncate' as const,
          color: '#475569',
          fontSize: 12,
          fontWeight: 500,
        },
        axisLine: { show: false },
        axisTick: { show: false },
      },
      series: [
        {
          type: 'bar',
          data: topModules
            .map((m, i) => ({
              value: m.count,
              itemStyle: {
                color: palettes[colorScheme][i % palettes[colorScheme].length],
                borderRadius: [0, 4, 4, 0] as [number, number, number, number],
              },
            }))
            .reverse(),
          barMaxWidth: 28,
          label: {
            show: true,
            position: 'right' as const,
            color: '#64748b',
            fontSize: 12,
            fontWeight: 600,
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
        backgroundColor: 'rgba(255,255,255,0.95)',
        borderColor: 'rgba(0,0,0,0.06)',
        borderWidth: 1,
        borderRadius: 8,
        padding: [10, 14],
        textStyle: { fontSize: 13, color: '#1e293b' },
        formatter: (p: { name: string; value: number; percent: number }) =>
          `<strong>${p.name}</strong><br/>数量: ${p.value}<br/>占比: ${p.percent}%`,
      },
      series: [
        {
          type: 'pie',
          radius: ['35%', '65%'],
          center: ['50%', '55%'],
          data: topModules.map((m, i) => ({
            name: m.module,
            value: m.count,
            itemStyle: { color: palettes[colorScheme][i % palettes[colorScheme].length] },
          })),
          label: {
            show: true,
            color: '#475569',
            fontSize: 11,
            fontWeight: 500,
            formatter: (p: { name: string; percent: number }) => {
              if (p.percent < 3) return '';
              return `${p.name}\n${p.percent}%`;
            },
          },
          labelLine: { lineStyle: { color: 'rgba(0,0,0,0.1)' } },
          emphasis: {
            itemStyle: {
              shadowBlur: 12,
              shadowOffsetX: 0,
              shadowColor: 'rgba(79,70,229,0.2)',
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

  const cardTitle = title ? (
    <span style={{ fontSize: 15, fontWeight: 600, color: '#1a1a2e' }}>{title}</span>
  ) : undefined;

  if (loading) {
    return (
      <Card
        title={cardTitle}
        bodyStyle={{ padding: '40px 24px', textAlign: 'center' }}
        style={glassCardStyle}
      >
        <span style={{ color: '#94a3b8', fontSize: 14 }}>加载中...</span>
      </Card>
    );
  }

  if (!data || data.distribution.length === 0) {
    return (
      <Card
        title={cardTitle}
        bodyStyle={{ padding: '40px 24px', textAlign: 'center' }}
        style={glassCardStyle}
      >
        <span style={{ color: '#94a3b8', fontSize: 14 }}>所选时间范围内暂无数据</span>
      </Card>
    );
  }

  return (
    <div style={{ display: 'flex', gap: 16 }}>
      <div style={{ flex: 1, ...glassCardStyle, padding: '20px 16px' }}>
        <ReactECharts option={barOption} style={{ height: Math.max(240, topModules.length * 34) }} onEvents={onEvents} />
      </div>
      <div style={{ flex: 1, ...glassCardStyle, padding: '16px 16px' }}>
        <ReactECharts option={pieOption} style={{ height: 320 }} onEvents={onEvents} />
      </div>
    </div>
  );
}
