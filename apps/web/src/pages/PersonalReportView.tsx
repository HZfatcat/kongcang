import React, { useMemo } from 'react';
import type { WeeklyMetrics } from './WeeklyReportPage';

const styles = {
  wrap: {
    maxWidth: 680,
    margin: '0 auto',
    padding: '16px 12px',
    fontFamily: "-apple-system, BlinkMacSystemFont, 'Microsoft YaHei', sans-serif",
    background: '#eef1f5',
    color: '#334155',
    lineHeight: 1.6,
  } as React.CSSProperties,
  header: {
    background: 'linear-gradient(135deg, #0f172a 0%, #1e3a5f 50%, #2563eb 100%)',
    borderRadius: 14,
    padding: '28px 24px 24px',
    color: '#fff',
    marginBottom: 16,
  } as React.CSSProperties,
  headerRow: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
  } as React.CSSProperties,
  sumCard: {
    flex: 1,
    background: '#fff',
    borderRadius: 10,
    padding: '14px 10px',
    textAlign: 'center' as const,
  } as React.CSSProperties,
  table: {
    width: '100%',
    borderCollapse: 'collapse' as const,
    fontSize: 12,
  } as React.CSSProperties,
  th: {
    textAlign: 'left' as const,
    padding: '6px 4px',
    color: '#64748b',
    fontWeight: 500,
  } as React.CSSProperties,
  td: {
    padding: '6px 4px',
    verticalAlign: 'middle' as const,
  } as React.CSSProperties,
};

interface Props {
  metrics: WeeklyMetrics;
  dateRange: [string, string];
  sections: Record<string, string>;
  agentName?: string;
  huaweiCloudUnbindInput: number | null;
}

function statusBadge(label: string, pass: boolean): React.ReactNode {
  return (
    <span style={{
      fontSize: 10,
      padding: '1px 8px',
      borderRadius: 8,
      fontWeight: 500,
      background: pass ? '#f0fdf4' : '#fef2f2',
      color: pass ? '#16a34a' : '#dc2626',
      whiteSpace: 'nowrap',
    }}>
      {pass ? '✅' : '❌'} {label}
    </span>
  );
}

export function PersonalReportView({ metrics, dateRange, sections, agentName, huaweiCloudUnbindInput }: Props) {
  const [start, end] = dateRange;

  // 计算人效
  const efficiency = useMemo(() => {
    if (metrics.agentCount <= 0 || metrics.totalSessions <= 0) return '—';
    const avgSessions = metrics.totalSessions / metrics.agentCount;
    if (avgSessions <= 0) return '—';
    const eff = (metrics.consultationCount / avgSessions) * 100;
    return `${eff.toFixed(2)}%`;
  }, [metrics]);

  return (
    <div style={styles.wrap}>
      {/* ===== HEADER ===== */}
      <div style={styles.header}>
        <div style={styles.headerRow}>
          <div>
            <div style={{ fontSize: 22, fontWeight: 700 }}>🧑 个人周报</div>
            <div style={{ marginTop: 4, fontSize: 13, opacity: 0.7 }}>{start} ~ {end}</div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: 28, fontWeight: 700, lineHeight: 1 }}>{efficiency}</div>
            <div style={{ fontSize: 11, opacity: 0.7 }}>人效</div>
          </div>
        </div>
      </div>

      {/* ===== 人效汇总卡片 ===== */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
        <div style={styles.sumCard}>
          <div style={{ fontSize: 11, color: '#94a3b8', marginBottom: 2 }}>总工时</div>
          <div style={{ fontSize: 26, fontWeight: 700, color: '#1e293b' }}>
            {calcTotalHours(metrics)}<span style={{ fontSize: 14, fontWeight: 400, color: '#94a3b8', marginLeft: 2 }}>h</span>
          </div>
        </div>
        <div style={styles.sumCard}>
          <div style={{ fontSize: 11, color: '#94a3b8', marginBottom: 2 }}>人效</div>
          <div style={{ fontSize: 26, fontWeight: 700, color: '#10b981' }}>{efficiency}</div>
        </div>
        <div style={styles.sumCard}>
          <div style={{ fontSize: 11, color: '#94a3b8', marginBottom: 2 }}>满意度</div>
          <div style={{ fontSize: 26, fontWeight: 700, color: '#3b82f6' }}>{(metrics.satisfactionRate * 100).toFixed(1)}%</div>
        </div>
      </div>

      {/* ===== 一、客服核心指标 ===== */}
      <div style={{ background: '#fff', borderRadius: 10, padding: '16px 20px', marginBottom: 16 }}>
        <div style={{ fontSize: 14, fontWeight: 600, color: '#1e293b', marginBottom: 10 }}>📊 一、客服核心指标</div>
        <table style={styles.table}>
          <thead>
            <tr style={{ background: '#f8fafc' }}>
              <th style={styles.th}>维度</th>
              <th style={styles.th}>指标</th>
              <th style={{ textAlign: 'center', padding: '6px 4px', color: '#64748b', fontWeight: 500 }}>目标</th>
              <th style={{ textAlign: 'center', padding: '6px 4px', color: '#64748b', fontWeight: 500 }}>完成值</th>
              <th style={{ textAlign: 'center', padding: '6px 4px', color: '#64748b', fontWeight: 500 }}>状态</th>
            </tr>
          </thead>
          <tbody>
            <tr style={{ borderTop: '1px solid #e2e8f0' }}>
              <td rowSpan={3} style={{ textAlign: 'center', verticalAlign: 'middle', padding: '8px 4px', color: '#475569', fontWeight: 500 }}>闭环质量</td>
              <td style={{ padding: '6px 4px', color: '#334155' }}>总关单率</td>
              <td style={{ textAlign: 'center', padding: '6px 4px', color: '#94a3b8' }}>≥95%</td>
              <td style={{ textAlign: 'center', padding: '6px 4px', fontWeight: 600 }}>{(metrics.totalCloseRate * 100).toFixed(2)}%</td>
              <td style={{ textAlign: 'center', padding: '6px 4px' }}>
                {statusBadge('达标', metrics.totalCloseRate >= 0.95)}
              </td>
            </tr>
            <tr style={{ borderTop: '1px solid #e2e8f0' }}>
              <td style={{ padding: '6px 4px', color: '#334155' }}>需求关单率</td>
              <td style={{ textAlign: 'center', padding: '6px 4px', color: '#94a3b8' }}>≥95%</td>
              <td style={{ textAlign: 'center', padding: '6px 4px', fontWeight: 600 }}>{(metrics.demandCloseRate * 100).toFixed(2)}%</td>
              <td style={{ textAlign: 'center', padding: '6px 4px' }}>
                {statusBadge('达标', metrics.demandCloseRate >= 0.95)}
              </td>
            </tr>
            <tr style={{ borderTop: '1px solid #e2e8f0' }}>
              <td style={{ padding: '6px 4px', color: '#334155' }}>BUG 关单率</td>
              <td style={{ textAlign: 'center', padding: '6px 4px', color: '#94a3b8' }}>≥95%</td>
              <td style={{ textAlign: 'center', padding: '6px 4px', fontWeight: 600 }}>{(metrics.bugCloseRate * 100).toFixed(2)}%</td>
              <td style={{ textAlign: 'center', padding: '6px 4px' }}>
                {statusBadge('达标', metrics.bugCloseRate >= 0.95)}
              </td>
            </tr>
            {/* 体验指标 */}
            <tr style={{ borderTop: '1px solid #e2e8f0' }}>
              <td rowSpan={2} style={{ textAlign: 'center', verticalAlign: 'middle', padding: '8px 4px', color: '#475569', fontWeight: 500 }}>体验指标</td>
              <td style={{ padding: '6px 4px', color: '#334155' }}>满意度</td>
              <td style={{ textAlign: 'center', padding: '6px 4px', color: '#94a3b8' }}>≥95%</td>
              <td style={{ textAlign: 'center', padding: '6px 4px', fontWeight: 600 }}>{(metrics.satisfactionRate * 100).toFixed(2)}%</td>
              <td style={{ textAlign: 'center', padding: '6px 4px' }}>
                {statusBadge('达标', metrics.satisfactionRate >= 0.95)}
              </td>
            </tr>
            <tr style={{ borderTop: '1px solid #e2e8f0' }}>
              <td style={{ padding: '6px 4px', color: '#334155' }}>问题解决率</td>
              <td style={{ textAlign: 'center', padding: '6px 4px', color: '#94a3b8' }}>≥90%</td>
              <td style={{ textAlign: 'center', padding: '6px 4px', fontWeight: 600 }}>{(metrics.problemResolutionRate * 100).toFixed(2)}%</td>
              <td style={{ textAlign: 'center', padding: '6px 4px' }}>
                {statusBadge('达标', metrics.problemResolutionRate >= 0.90)}
              </td>
            </tr>
            {/* 响应效率 */}
            <tr style={{ borderTop: '1px solid #e2e8f0' }}>
              <td rowSpan={2} style={{ textAlign: 'center', verticalAlign: 'middle', padding: '8px 4px', color: '#475569', fontWeight: 500 }}>响应效率</td>
              <td style={{ padding: '6px 4px', color: '#334155' }}>平均首次响应时长</td>
              <td style={{ textAlign: 'center', padding: '6px 4px', color: '#94a3b8' }}>≤60s</td>
              <td style={{ textAlign: 'center', padding: '6px 4px', fontWeight: 600 }}>
                {metrics.avgFirstResponseTime !== null ? `${Math.round(metrics.avgFirstResponseTime)}s` : '—'}
              </td>
              <td style={{ textAlign: 'center', padding: '6px 4px' }}>
                {metrics.avgFirstResponseTime !== null
                  ? statusBadge('达标', metrics.avgFirstResponseTime <= 60)
                  : <span style={{ fontSize: 10, color: '#94a3b8' }}>待接入</span>}
              </td>
            </tr>
            <tr style={{ borderTop: '1px solid #e2e8f0' }}>
              <td style={{ padding: '6px 4px', color: '#334155' }}>平均响应时长</td>
              <td style={{ textAlign: 'center', padding: '6px 4px', color: '#94a3b8' }}>≤120s</td>
              <td style={{ textAlign: 'center', padding: '6px 4px', fontWeight: 600 }}>
                {metrics.avgResponseTime !== null ? `${Math.round(metrics.avgResponseTime)}s` : '—'}
              </td>
              <td style={{ textAlign: 'center', padding: '6px 4px' }}>
                {metrics.avgResponseTime !== null
                  ? statusBadge('达标', metrics.avgResponseTime <= 120)
                  : <span style={{ fontSize: 10, color: '#94a3b8' }}>待接入</span>}
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      {/* ===== 二、工作量明细含工时 ===== */}
      <div style={{ background: '#fff', borderRadius: 10, padding: '16px 20px', marginBottom: 16, overflowX: 'auto' }}>
        <div style={{ fontSize: 14, fontWeight: 600, color: '#1e293b', marginBottom: 10 }}>⏱ 二、工作量明细含工时</div>
        <table style={{ ...styles.table, minWidth: 500 }}>
          <thead>
            <tr style={{ background: '#f8fafc' }}>
              <th style={styles.th}>分类</th>
              <th style={styles.th}>事项</th>
              <th style={{ textAlign: 'center', padding: '6px 4px', color: '#64748b', fontWeight: 500 }}>完成值</th>
              <th style={{ textAlign: 'center', padding: '6px 4px', color: '#64748b', fontWeight: 500 }}>工时(h)</th>
              <th style={{ textAlign: 'center', padding: '6px 4px', color: '#64748b', fontWeight: 500 }}>状态</th>
            </tr>
          </thead>
          <tbody>
            <tr style={{ borderTop: '1px solid #e2e8f0' }}>
              <td style={{ padding: '6px 4px', color: '#3b82f6', fontWeight: 500 }}>咨询承接</td>
              <td style={{ padding: '6px 4px', color: '#334155' }}>用户主动咨询量/次</td>
              <td style={{ textAlign: 'center', padding: '6px 4px', fontWeight: 600 }}>{metrics.consultationCount}</td>
              <td style={{ textAlign: 'center', padding: '6px 4px', fontWeight: 600, color: '#3b82f6' }}>
                {calcConsultHours(metrics.consultationCount, metrics.avgSessionDuration)}
              </td>
              <td style={{ textAlign: 'center', padding: '6px 4px' }}>
                <span style={{ fontSize: 10, padding: '1px 8px', borderRadius: 8, background: '#f0fdf4', color: '#16a34a', fontWeight: 500 }}>✅ 已完成</span>
              </td>
            </tr>
            <tr style={{ borderTop: '1px solid #e2e8f0' }}>
              <td style={{ padding: '6px 4px', color: '#3b82f6', fontWeight: 500 }}>咨询承接</td>
              <td style={{ padding: '6px 4px', color: '#334155' }}>回访次数/次</td>
              <td style={{ textAlign: 'center', padding: '6px 4px', fontWeight: 600 }}>{metrics.returnVisitCount ?? 0}</td>
              <td style={{ textAlign: 'center', padding: '6px 4px', fontWeight: 600, color: '#3b82f6' }}>
                {metrics.returnVisitCount ? ((metrics.returnVisitCount * 5) / 60).toFixed(1) : '—'}
              </td>
              <td style={{ textAlign: 'center', padding: '6px 4px' }}>
                <span style={{ fontSize: 10, padding: '1px 8px', borderRadius: 8, background: '#f0fdf4', color: '#16a34a', fontWeight: 500 }}>✅ 已完成</span>
              </td>
            </tr>
            <tr style={{ borderTop: '1px solid #e2e8f0' }}>
              <td style={{ padding: '6px 4px', color: '#8b5cf6', fontWeight: 500 }}>专项业务</td>
              <td style={{ padding: '6px 4px', color: '#334155' }}>申请解绑华为云数量</td>
              <td style={{ textAlign: 'center', padding: '6px 4px', fontWeight: 600 }}>{huaweiCloudUnbindInput ?? 0}</td>
              <td style={{ textAlign: 'center', padding: '6px 4px', fontWeight: 600, color: '#8b5cf6' }}>
                {huaweiCloudUnbindInput ? ((huaweiCloudUnbindInput * 1) / 60).toFixed(1) : '—'}
              </td>
              <td style={{ textAlign: 'center', padding: '6px 4px' }}>
                <span style={{ fontSize: 10, padding: '1px 8px', borderRadius: 8, background: huaweiCloudUnbindInput ? '#f0fdf4' : '#f1f5f9', color: huaweiCloudUnbindInput ? '#16a34a' : '#94a3b8', fontWeight: 500 }}>
                  {huaweiCloudUnbindInput ? '✅ 已完成' : '待接入'}
                </span>
              </td>
            </tr>
            <tr style={{ borderTop: '1px solid #e2e8f0' }}>
              <td style={{ padding: '6px 4px', color: '#d97706', fontWeight: 500 }}>问题转化</td>
              <td style={{ padding: '6px 4px', color: '#334155' }}>新增需求数/个</td>
              <td style={{ textAlign: 'center', padding: '6px 4px', fontWeight: 600 }}>{metrics.newDemands}</td>
              <td style={{ textAlign: 'center', padding: '6px 4px', fontWeight: 600, color: '#d97706' }}>
                {(metrics.newDemands * 0.5).toFixed(1)}
              </td>
              <td style={{ textAlign: 'center', padding: '6px 4px' }}>
                <span style={{ fontSize: 10, padding: '1px 8px', borderRadius: 8, background: '#f0fdf4', color: '#16a34a', fontWeight: 500 }}>✅ 已录入</span>
              </td>
            </tr>
            <tr style={{ borderTop: '1px solid #e2e8f0' }}>
              <td style={{ padding: '6px 4px', color: '#d97706', fontWeight: 500 }}>问题转化</td>
              <td style={{ padding: '6px 4px', color: '#334155' }}>新增 BUG 数/个</td>
              <td style={{ textAlign: 'center', padding: '6px 4px', fontWeight: 600 }}>{metrics.newBugs}</td>
              <td style={{ textAlign: 'center', padding: '6px 4px', fontWeight: 600, color: '#d97706' }}>
                {(metrics.newBugs * 0.5).toFixed(1)}
              </td>
              <td style={{ textAlign: 'center', padding: '6px 4px' }}>
                <span style={{ fontSize: 10, padding: '1px 8px', borderRadius: 8, background: '#f0fdf4', color: '#16a34a', fontWeight: 500 }}>✅ 已录入</span>
              </td>
            </tr>
            <tr style={{ borderTop: '1px solid #e2e8f0' }}>
              <td style={{ padding: '6px 4px', color: '#16a34a', fontWeight: 500 }}>问题闭环</td>
              <td style={{ padding: '6px 4px', color: '#334155' }}>已闭环需求数/个</td>
              <td style={{ textAlign: 'center', padding: '6px 4px', fontWeight: 600 }}>{metrics.closedDemands}</td>
              <td style={{ textAlign: 'center', padding: '6px 4px', fontWeight: 600, color: '#16a34a' }}>
                {(metrics.closedDemands * 0.25).toFixed(1)}
              </td>
              <td style={{ textAlign: 'center', padding: '6px 4px' }}>
                <span style={{ fontSize: 10, padding: '1px 8px', borderRadius: 8, background: '#f0fdf4', color: '#16a34a', fontWeight: 500 }}>✅ 已闭环</span>
              </td>
            </tr>
            <tr style={{ borderTop: '1px solid #e2e8f0' }}>
              <td style={{ padding: '6px 4px', color: '#16a34a', fontWeight: 500 }}>问题闭环</td>
              <td style={{ padding: '6px 4px', color: '#334155' }}>已闭环 BUG 数/个</td>
              <td style={{ textAlign: 'center', padding: '6px 4px', fontWeight: 600 }}>{metrics.closedBugs}</td>
              <td style={{ textAlign: 'center', padding: '6px 4px', fontWeight: 600, color: '#16a34a' }}>
                {(metrics.closedBugs * 0.25).toFixed(1)}
              </td>
              <td style={{ textAlign: 'center', padding: '6px 4px' }}>
                <span style={{ fontSize: 10, padding: '1px 8px', borderRadius: 8, background: '#f0fdf4', color: '#16a34a', fontWeight: 500 }}>✅ 已闭环</span>
              </td>
            </tr>
          </tbody>
        </table>
        <div style={{ marginTop: 8, fontSize: 10, color: '#94a3b8' }}>注：以上数据排除长期演进单</div>
      </div>

      {/* ===== 积压备注 ===== */}
      <div style={{
        background: '#fff8f0',
        borderRadius: 10,
        padding: '16px 20px',
        marginBottom: 16,
        border: '1px solid #fed7aa',
      }}>
        <div style={{ fontSize: 14, fontWeight: 600, color: '#9a3412', marginBottom: 8 }}>📌 积压备注</div>
        <div style={{ fontSize: 12, color: '#78350f', lineHeight: 1.6 }}>
          需求闭环进度滞后，当前仍有{metrics.newDemands - metrics.closedDemands}个需求、{metrics.newBugs - metrics.closedBugs}个BUG待跟进处理，需加快闭环节奏。
        </div>
      </div>

      {/* ===== 三、其他工作事项 ===== */}
      <div style={{ background: '#fff', borderRadius: 10, padding: '16px 20px', marginBottom: 16 }}>
        <div style={{ fontSize: 14, fontWeight: 600, color: '#1e293b', marginBottom: 10 }}>📝 三、其他工作事项</div>
        {sections.otherWork ? (
          sections.otherWork.split('\n').filter(Boolean).map((item, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 6, padding: '3px 0', fontSize: 12 }}>
              <span style={{ color: '#64748b' }}>•</span>
              <span style={{ color: '#334155' }}>{item}</span>
            </div>
          ))
        ) : (
          <div style={{ fontSize: 12, color: '#94a3b8' }}>（暂无记录）</div>
        )}
      </div>

      {/* ===== 四、下周工作计划 ===== */}
      <div style={{
        background: '#f0f9ff',
        borderRadius: 10,
        padding: '16px 20px',
        marginBottom: 16,
        border: '1px solid #bae6fd',
      }}>
        <div style={{ fontSize: 14, fontWeight: 600, color: '#0369a1', marginBottom: 8 }}>📅 四、下周工作计划</div>
        {sections.nextPlan ? (
          sections.nextPlan.split('\n').filter(Boolean).map((plan, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 6, padding: '4px 0', fontSize: 12 }}>
              <span style={{
                width: 18, height: 18,
                borderRadius: '50%',
                background: '#0ea5e9',
                color: '#fff',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: 10,
                fontWeight: 600,
                flexShrink: 0,
              }}>{i + 1}</span>
              <span style={{ color: '#0c4a6e' }}>{plan.replace(/^\d+[.、]\s*/, '')}</span>
            </div>
          ))
        ) : (
          <div style={{ fontSize: 12, color: '#94a3b8' }}>（暂无记录）</div>
        )}
      </div>

      <div style={{ textAlign: 'center', padding: '10px 0 4px', fontSize: 10, color: '#94a3b8' }}>
        个人周报 · 自动生成
      </div>
    </div>
  );
}

// 工时计算（与 WeeklyReportPage 一致）
function calcConsultHours(count: number, avgSessionSec: number | null): string {
  if (!count || !avgSessionSec || avgSessionSec <= 600) return '—';
  const hours = count * (avgSessionSec - 600) / 3600;
  return hours.toFixed(1);
}

function calcTotalHours(metrics: WeeklyMetrics): string {
  let total = 0;
  // 咨询工时
  if (metrics.consultationCount && metrics.avgSessionDuration && metrics.avgSessionDuration > 600) {
    total += metrics.consultationCount * (metrics.avgSessionDuration - 600) / 3600;
  }
  // 回访 (5min 每个)
  if (metrics.returnVisitCount) total += metrics.returnVisitCount * 5 / 60;
  // 需求/BUG 录入 (30min 每个)
  total += (metrics.newDemands + metrics.newBugs) * 0.5;
  // 需求/BUG 闭环 (15min 每个)
  total += (metrics.closedDemands + metrics.closedBugs) * 0.25;
  // 商机 (30min 每个)
  total += metrics.opportunityWon * 0.5;
  return total.toFixed(1);
}
