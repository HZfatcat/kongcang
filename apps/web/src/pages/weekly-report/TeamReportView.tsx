import React, { useState, useCallback } from 'react';
import type { WeeklyMetrics } from './WeeklyReportPage';
import { generateRisks, generateSuggestions, generateNextPlan } from '../../utils/reportAI';

// ====== 工具样式 ======
const styles = {
  wrap: {
    maxWidth: 760,
    margin: '0 auto',
    padding: '20px',
    fontFamily: "-apple-system, BlinkMacSystemFont, 'Microsoft YaHei', sans-serif",
    background: '#f1f5f9',
    color: '#334155',
    lineHeight: 1.6,
  } as React.CSSProperties,
  // Header
  header: {
    background: 'linear-gradient(135deg, #0f172a 0%, #1e293b 50%, #334155 100%)',
    color: '#fff',
    padding: '28px 30px',
    borderRadius: 16,
    marginBottom: 24,
  } as React.CSSProperties,
  headerRow: {
    display: 'flex',
    alignItems: 'center',
    gap: 12,
  } as React.CSSProperties,
  headerIcon: {
    width: 44,
    height: 44,
    background: '#3b82f6',
    borderRadius: 12,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: 22,
  } as React.CSSProperties,
  headerTitle: {
    fontSize: 24,
    fontWeight: 700,
  } as React.CSSProperties,
  headerMeta: {
    display: 'flex',
    gap: 10,
    flexWrap: 'wrap' as const,
    marginTop: 14,
  } as React.CSSProperties,
  metaItem: {
    display: 'flex',
    alignItems: 'center',
    gap: 6,
    background: 'rgba(255,255,255,0.1)',
    padding: '6px 14px',
    borderRadius: 20,
    fontSize: 13,
  } as React.CSSProperties,
  // Section
  section: {
    background: '#fff',
    borderRadius: 12,
    padding: '20px 22px',
    marginBottom: 20,
    border: '1px solid #e2e8f0',
  } as React.CSSProperties,
  sectionHeader: {
    display: 'flex',
    alignItems: 'center',
    gap: 10,
    marginBottom: 18,
  } as React.CSSProperties,
  sectionIcon: (bg: string, color: string): React.CSSProperties => ({
    width: 32,
    height: 32,
    borderRadius: 8,
    background: bg,
    color: color,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: 15,
  }),
  sectionTitle: {
    fontSize: 16,
    fontWeight: 700,
    color: '#1e293b',
  } as React.CSSProperties,
  // Metric card
  metricGrid: {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr',
    gap: 12,
  } as React.CSSProperties,
  metricCard: {
    border: '1px solid #e2e8f0',
    borderRadius: 10,
    padding: 16,
  } as React.CSSProperties,
  metricCardHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  } as React.CSSProperties,
  metricCardTitle: {
    fontSize: 13,
    fontWeight: 600,
    color: '#475569',
  } as React.CSSProperties,
  metricStatus: (pass: boolean): React.CSSProperties => ({
    fontSize: 11,
    padding: '2px 10px',
    borderRadius: 10,
    fontWeight: 500,
    background: pass ? '#f0fdf4' : '#fef2f2',
    color: pass ? '#16a34a' : '#dc2626',
  }),
  metricCardBody: {
    display: 'flex',
    alignItems: 'baseline',
    gap: 8,
    marginBottom: 10,
  } as React.CSSProperties,
  metricCardValue: {
    fontSize: 26,
    fontWeight: 700,
    color: '#1e293b',
  } as React.CSSProperties,
  metricCardTarget: {
    fontSize: 12,
    color: '#94a3b8',
  } as React.CSSProperties,
  metricBarLabel: {
    display: 'flex',
    justifyContent: 'space-between',
    fontSize: 11,
    color: '#94a3b8',
    marginBottom: 4,
  } as React.CSSProperties,
  metricBar: {
    background: '#f1f5f9',
    height: 6,
    borderRadius: 3,
    overflow: 'hidden',
  } as React.CSSProperties,
  metricBarFill: (width: number, color: string): React.CSSProperties => ({
    height: '100%',
    borderRadius: 3,
    width: `${Math.min(width, 100)}%`,
    background: color === 'amber'
      ? 'linear-gradient(90deg, #f59e0b, #fbbf24)'
      : 'linear-gradient(90deg, #10b981, #34d399)',
    transition: 'width 0.3s',
  }),
  // Rel metric
  relGrid: {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr 1fr',
    gap: 10,
  } as React.CSSProperties,
  relCard: {
    border: '1px solid #e2e8f0',
    borderRadius: 8,
    padding: 14,
    textAlign: 'center' as const,
  } as React.CSSProperties,
  relCardTitle: {
    fontSize: 12,
    color: '#64748b',
    marginBottom: 6,
  } as React.CSSProperties,
  relCardValue: {
    fontSize: 22,
    fontWeight: 700,
    color: '#1e293b',
  } as React.CSSProperties,
  relUnit: {
    fontSize: 13,
    fontWeight: 400,
    color: '#94a3b8',
  } as React.CSSProperties,
  relCardTarget: {
    fontSize: 11,
    color: '#94a3b8',
    marginTop: 4,
  } as React.CSSProperties,
  relBar: {
    marginTop: 8,
    background: '#f1f5f9',
    height: 5,
    borderRadius: 3,
    overflow: 'hidden',
  } as React.CSSProperties,
  relBarFill: (width: number, color: string): React.CSSProperties => ({
    height: '100%',
    borderRadius: 3,
    width: `${Math.min(width, 100)}%`,
    background: color,
  }),
  // Done cards
  doneRow: {
    display: 'flex',
    gap: 10,
    flexWrap: 'wrap' as const,
    marginBottom: 12,
  } as React.CSSProperties,
};

// ====== 操作按钮和编辑框样式 ======
const btnBase: React.CSSProperties = {
  fontSize: 11,
  fontWeight: 500,
  padding: '4px 10px',
  borderRadius: 6,
  border: '1px solid transparent',
  cursor: 'pointer',
  lineHeight: 1.4,
  transition: 'all 0.15s',
};
const btnPrimary: React.CSSProperties = {
  ...btnBase,
  background: '#2563eb',
  color: '#fff',
  borderColor: '#2563eb',
};
const btnSecondary: React.CSSProperties = {
  ...btnBase,
  background: '#fff',
  color: '#64748b',
  borderColor: '#d1d5db',
};
const btnGhost: React.CSSProperties = {
  ...btnBase,
  background: 'transparent',
  color: '#64748b',
  borderColor: '#d1d5db',
  opacity: 0.85,
};
const textareaStyle: React.CSSProperties = {
  width: '100%',
  boxSizing: 'border-box',
  padding: 10,
  fontSize: 12,
  border: '1px solid #d1d5db',
  borderRadius: 8,
  resize: 'vertical',
  fontFamily: 'inherit',
  lineHeight: 1.6,
  outline: 'none',
};

// 根据关单率确定颜色
function rateColor(v: number): 'green' | 'amber' {
  return v >= 0.95 ? 'green' : 'amber';
}

// 完成比例 (0-100)
function ratePct(v: number): number {
  return Math.min(100, (v / 0.95) * 100);
}

interface Props {
  metrics: WeeklyMetrics;
  dateRange: [string, string];
  sections: Record<string, string>;
  teamEditable: {
    topQuestions: { name: string; count: number; pct: number }[];
    risks: string[];
    suggestions: string[];
  };
  onUpdateRisks?: (risks: string[]) => void;
  onUpdateSuggestions?: (suggestions: string[]) => void;
  onUpdateNextPlan?: (nextPlan: string) => void;
}

const doneCardThemes: Record<string, { color: string; categoryColor: string }> = {
  咨询承接: { color: '#3b82f6', categoryColor: '#3b82f6' },
  专项业务: { color: '#8b5cf6', categoryColor: '#8b5cf6' },
  问题转化: { color: '#f59e0b', categoryColor: '#f59e0b' },
  问题闭环: { color: '#22c55e', categoryColor: '#22c55e' },
  商机转换: { color: '#14b8a6', categoryColor: '#14b8a6' },
};

function DoneCard({ category, label, value, unit }: { category: string; label: string; value: string | number; unit?: string }) {
  const theme = doneCardThemes[category] || doneCardThemes['咨询承接'];
  const barStyle: React.CSSProperties = {
    position: 'absolute',
    top: 0, left: 0, right: 0,
    height: 3,
    background: `linear-gradient(90deg, ${theme.color}, ${theme.color}88)`,
  };
  return (
    <div style={{
      flex: '1 1 calc(50% - 10px)',
      minWidth: 180,
    }}>
      <div style={{
        position: 'relative',
        borderRadius: 10,
        overflow: 'hidden',
        padding: '16px 16px 14px',
        border: `1px solid ${theme.color}44`,
        background: `linear-gradient(135deg, ${theme.color}11, #fff 100%)`,
      }}>
        <div style={barStyle} />
        <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            <span style={{ fontSize: 10, fontWeight: 600, color: theme.color, textTransform: 'uppercase' }}>
              {category}
            </span>
            <span style={{ fontSize: 12, color: '#64748b', display: 'flex', alignItems: 'center', gap: 4 }}>
              {label}
            </span>
          </div>
          <span style={{ fontSize: 24, fontWeight: 700, color: '#1e293b', lineHeight: 1.2, flexShrink: 0, marginLeft: 8 }}>
            {value}
            {unit && <span style={{ fontWeight: 400, color: '#94a3b8', fontSize: 12, marginLeft: 2 }}>{unit}</span>}
          </span>
        </div>
      </div>
    </div>
  );
}

export function TeamReportView({ metrics, dateRange, sections, teamEditable, onUpdateRisks, onUpdateSuggestions, onUpdateNextPlan }: Props) {
  const [start, end] = dateRange;
  const closeRatePass = metrics.totalCloseRate >= 0.95;
  const satPass = metrics.satisfactionRate >= 0.95;

  // 编辑状态
  const [editingRisks, setEditingRisks] = useState(false);
  const [editingSuggestions, setEditingSuggestions] = useState(false);
  const [editingNextPlan, setEditingNextPlan] = useState(false);
  const [editRisksText, setEditRisksText] = useState('');
  const [editSuggestionsText, setEditSuggestionsText] = useState('');
  const [editNextPlanText, setEditNextPlanText] = useState('');
  const [generatingRisks, setGeneratingRisks] = useState(false);
  const [generatingSuggestions, setGeneratingSuggestions] = useState(false);
  const [generatingNextPlan, setGeneratingNextPlan] = useState(false);

  // AI 生成
  const handleGenerateRisks = useCallback(async () => {
    setGeneratingRisks(true);
    try {
      await new Promise(r => setTimeout(r, 600));
      const result = generateRisks(metrics);
      onUpdateRisks?.(result);
    } catch (err) {
      console.error('AI 生成「问题与阻碍」失败:', err);
    } finally {
      setGeneratingRisks(false);
    }
  }, [metrics, onUpdateRisks]);

  const handleGenerateSuggestions = useCallback(async () => {
    setGeneratingSuggestions(true);
    try {
      await new Promise(r => setTimeout(r, 600));
      const result = generateSuggestions(metrics, teamEditable.risks);
      onUpdateSuggestions?.(result);
    } catch (err) {
      console.error('AI 生成「改进建议」失败:', err);
    } finally {
      setGeneratingSuggestions(false);
    }
  }, [metrics, teamEditable.risks, onUpdateSuggestions]);

  const handleGenerateNextPlan = useCallback(async () => {
    setGeneratingNextPlan(true);
    try {
      await new Promise(r => setTimeout(r, 600));
      const result = generateNextPlan(metrics);
      onUpdateNextPlan?.(result);
    } catch (err) {
      console.error('AI 生成「下周计划」失败:', err);
    } finally {
      setGeneratingNextPlan(false);
    }
  }, [metrics, onUpdateNextPlan]);

  // 编辑操作
  const startEditRisks = () => {
    setEditRisksText(teamEditable.risks.join('\n'));
    setEditingRisks(true);
  };
  const saveEditRisks = () => {
    onUpdateRisks?.(editRisksText.split('\n').filter(Boolean));
    setEditingRisks(false);
  };
  const cancelEditRisks = () => setEditingRisks(false);

  const startEditSuggestions = () => {
    setEditSuggestionsText(teamEditable.suggestions.join('\n'));
    setEditingSuggestions(true);
  };
  const saveEditSuggestions = () => {
    onUpdateSuggestions?.(editSuggestionsText.split('\n').filter(Boolean));
    setEditingSuggestions(false);
  };
  const cancelEditSuggestions = () => setEditingSuggestions(false);

  const startEditNextPlan = () => {
    setEditNextPlanText(sections.nextPlan || '');
    setEditingNextPlan(true);
  };
  const saveEditNextPlan = () => {
    onUpdateNextPlan?.(editNextPlanText);
    setEditingNextPlan(false);
  };
  const cancelEditNextPlan = () => setEditingNextPlan(false);

  return (
    <div style={styles.wrap}>
      {/* ===== HEADER ===== */}
      <div style={styles.header}>
        <div style={styles.headerRow}>
          <div style={styles.headerIcon}>🎧</div>
          <h1 style={styles.headerTitle}>客服部周报</h1>
        </div>
        <div style={styles.headerMeta}>
          <div style={styles.metaItem}>
            <span>📅</span>
            <span>统计周期: {start} ~ {end}</span>
          </div>
          <div style={styles.metaItem}>
            <span>🏢</span>
            <span>客服部</span>
          </div>
        </div>
      </div>

      {/* ===== 业务指标 ===== */}
      <div style={styles.section}>
        <div style={styles.sectionHeader}>
          <div style={styles.sectionIcon('#dbeafe', '#2563eb')}>📊</div>
          <span style={styles.sectionTitle}>业务指标</span>
        </div>
        <div style={styles.metricGrid}>
          {/* 总关单率 */}
          <div style={styles.metricCard}>
            <div style={styles.metricCardHeader}>
              <span style={styles.metricCardTitle}>总关单率</span>
              <span style={styles.metricStatus(closeRatePass)}>
                {closeRatePass ? '达标' : '未达标'}
              </span>
            </div>
            <div style={styles.metricCardBody}>
              <span style={styles.metricCardValue}>{(metrics.totalCloseRate * 100).toFixed(2)}</span>
              <span style={{ fontSize: 16, fontWeight: 700, color: '#1e293b' }}>%</span>
              <span style={styles.metricCardTarget}>目标 ≥95%</span>
            </div>
            <div style={styles.metricBarLabel}>
              <span>完成率</span>
              <span>{ratePct(metrics.totalCloseRate).toFixed(1)}%</span>
            </div>
            <div style={styles.metricBar}>
              <div style={styles.metricBarFill(ratePct(metrics.totalCloseRate), rateColor(metrics.totalCloseRate))} />
            </div>
          </div>
          {/* 满意度 */}
          <div style={styles.metricCard}>
            <div style={styles.metricCardHeader}>
              <span style={styles.metricCardTitle}>满意度</span>
              <span style={styles.metricStatus(satPass)}>
                {satPass ? '达标' : '未达标'}
              </span>
            </div>
            <div style={styles.metricCardBody}>
              <span style={styles.metricCardValue}>{(metrics.satisfactionRate * 100).toFixed(2)}</span>
              <span style={{ fontSize: 16, fontWeight: 700, color: '#1e293b' }}>%</span>
              <span style={styles.metricCardTarget}>目标 ≥95%</span>
            </div>
            <div style={styles.metricBarLabel}>
              <span>完成率</span>
              <span>{ratePct(metrics.satisfactionRate).toFixed(1)}%</span>
            </div>
            <div style={styles.metricBar}>
              <div style={styles.metricBarFill(ratePct(metrics.satisfactionRate), rateColor(metrics.satisfactionRate))} />
            </div>
          </div>
        </div>
      </div>

      {/* ===== 关联指标 ===== */}
      <div style={styles.section}>
        <div style={styles.sectionHeader}>
          <div style={styles.sectionIcon('#dcfce7', '#16a34a')}>🔗</div>
          <span style={styles.sectionTitle}>关联指标</span>
        </div>
        <div style={styles.relGrid}>
          <div style={styles.relCard}>
            <div style={styles.relCardTitle}>需求关单率</div>
            <div style={styles.relCardValue}>
              {(metrics.demandCloseRate * 100).toFixed(2)}
              <span style={styles.relUnit}>%</span>
            </div>
            <div style={styles.relCardTarget}>目标 ≥95%</div>
            <div style={styles.relBar}>
              <div style={styles.relBarFill(ratePct(metrics.demandCloseRate), metrics.demandCloseRate >= 0.95 ? '#10b981' : '#f59e0b')} />
            </div>
          </div>
          <div style={styles.relCard}>
            <div style={styles.relCardTitle}>BUG 关单率</div>
            <div style={styles.relCardValue}>
              {(metrics.bugCloseRate * 100).toFixed(2)}
              <span style={styles.relUnit}>%</span>
            </div>
            <div style={styles.relCardTarget}>目标 ≥95%</div>
            <div style={styles.relBar}>
              <div style={styles.relBarFill(ratePct(metrics.bugCloseRate), metrics.bugCloseRate >= 0.95 ? '#10b981' : '#f59e0b')} />
            </div>
          </div>
          <div style={styles.relCard}>
            <div style={styles.relCardTitle}>问题解决率</div>
            <div style={styles.relCardValue}>
              {(metrics.problemResolutionRate * 100).toFixed(2)}
              <span style={styles.relUnit}>%</span>
            </div>
            <div style={styles.relCardTarget}>目标 ≥90%</div>
            <div style={styles.relBar}>
              <div style={styles.relBarFill(ratePct(metrics.problemResolutionRate), metrics.problemResolutionRate >= 0.90 ? '#10b981' : '#f59e0b')} />
            </div>
          </div>
          <div style={styles.relCard}>
            <div style={styles.relCardTitle}>平均首次响应时长</div>
            <div style={styles.relCardValue}>
              {metrics.avgFirstResponseTime !== null ? Math.round(metrics.avgFirstResponseTime) : '—'}
              <span style={styles.relUnit}>s</span>
            </div>
            <div style={styles.relCardTarget}>目标 ≤30s</div>
            <div style={styles.relBar}>
              <div style={styles.relBarFill(metrics.avgFirstResponseTime !== null && metrics.avgFirstResponseTime <= 30 ? 100 : 40, metrics.avgFirstResponseTime !== null && metrics.avgFirstResponseTime <= 30 ? '#10b981' : '#f59e0b')} />
            </div>
          </div>
          <div style={styles.relCard}>
            <div style={styles.relCardTitle}>平均响应时长</div>
            <div style={styles.relCardValue}>
              {metrics.avgResponseTime !== null ? Math.round(metrics.avgResponseTime) : '—'}
              <span style={styles.relUnit}>s</span>
            </div>
            <div style={styles.relCardTarget}>目标 ≤120s</div>
            <div style={styles.relBar}>
              <div style={styles.relBarFill(metrics.avgResponseTime !== null && metrics.avgResponseTime <= 120 ? 100 : 30, metrics.avgResponseTime !== null && metrics.avgResponseTime <= 120 ? '#10b981' : '#f59e0b')} />
            </div>
          </div>
          <div style={styles.relCard}>
            <div style={styles.relCardTitle}>咨询量</div>
            <div style={styles.relCardValue}>
              {metrics.consultationCount}
              <span style={styles.relUnit}>次</span>
            </div>
            <div style={styles.relCardTarget}>周汇总</div>
          </div>
        </div>
      </div>

      {/* ===== 本周工作完成情况 ===== */}
      <div style={styles.section}>
        <div style={styles.sectionHeader}>
          <div style={styles.sectionIcon('#f3e8ff', '#9333ea')}>✅</div>
          <span style={styles.sectionTitle}>本周工作完成情况</span>
        </div>
        <div style={styles.doneRow}>
          <DoneCard category="咨询承接" label="用户主动咨询量" value={metrics.consultationCount} unit="次" />
          <DoneCard category="咨询承接" label="回访次数" value={metrics.returnVisitCount ?? 0} unit="次" />
        </div>
        <div style={styles.doneRow}>
          <DoneCard category="专项业务" label="申请解绑华为云" value={metrics.huaweiCloudUnbind ?? 0} unit="个" />
        </div>
        <div style={styles.doneRow}>
          <DoneCard category="问题转化" label="新增需求数" value={metrics.newDemands} unit="个" />
          <DoneCard category="问题转化" label="新增 BUG 数" value={metrics.newBugs} unit="个" />
        </div>
        <div style={styles.doneRow}>
          <DoneCard category="问题闭环" label="已闭环需求数" value={metrics.closedDemands} unit="个" />
          <DoneCard category="问题闭环" label="已闭环 BUG 数" value={metrics.closedBugs} unit="个" />
        </div>
        <div style={styles.doneRow}>
          <DoneCard category="商机转换" label="商机转换数" value={metrics.opportunityWon} unit="个" />
        </div>
      </div>

      {/* ===== 高频问题 TOP5 ===== */}
      <div style={styles.section}>
        <div style={styles.sectionHeader}>
          <div style={styles.sectionIcon('#fef2f2', '#dc2626')}>🔥</div>
          <span style={styles.sectionTitle}>高频问题 TOP5</span>
        </div>
        {teamEditable.topQuestions.length === 0 ? (
          <div style={{ fontSize: 12, color: '#64748b', padding: 8 }}>暂无数据</div>
        ) : (
          teamEditable.topQuestions.slice(0, 5).map((q, i) => {
            const rankBg = ['#fef2f2', '#fff7ed', '#fefce8', '#f0fdf4', '#eff6ff'][i] || '#f8fafc';
            const rankColor = ['#dc2626', '#ea580c', '#ca8a04', '#16a34a', '#2563eb'][i] || '#64748b';
            const pctColor = q.pct >= 30 ? '#dc2626' : q.pct >= 10 ? '#ea580c' : '#64748b';
            return (
              <div key={i} style={{
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                padding: '8px 12px',
                borderBottom: i < Math.min(teamEditable.topQuestions.length, 5) - 1 ? '1px solid #f1f5f9' : 'none',
              }}>
                <div style={{
                  width: 24, height: 24, borderRadius: '50%', background: rankBg,
                  color: rankColor, fontSize: 11, fontWeight: 700,
                  display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                }}>
                  {i + 1}
                </div>
                <div style={{ flex: 1, fontSize: 13, color: '#1e293b' }}>{q.name}</div>
                <span style={{ fontSize: 12, color: '#94a3b8', whiteSpace: 'nowrap' }}>{q.count} 次</span>
                <span style={{
                  fontSize: 11, fontWeight: 500, padding: '1px 8px', borderRadius: 10,
                  background: q.pct >= 30 ? '#fef2f2' : q.pct >= 10 ? '#fff7ed' : '#f1f5f9',
                  color: pctColor, whiteSpace: 'nowrap',
                }}>{q.pct}%</span>
              </div>
            );
          })
        )}
      </div>

      {/* ===== 问题与阻碍 ===== */}
      <div style={styles.section}>
        <div style={{ ...styles.sectionHeader, flexWrap: 'wrap', gap: 6 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div style={styles.sectionIcon('#fef3c7', '#d97706')}>⚠️</div>
            <span style={styles.sectionTitle}>问题与阻碍</span>
          </div>
          <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
            {onUpdateRisks && (
              editingRisks ? (
                <>
                  <button onClick={saveEditRisks} style={btnPrimary}>✅ 保存</button>
                  <button onClick={cancelEditRisks} style={btnSecondary}>取消</button>
                </>
              ) : (
                <>
                  <button onClick={handleGenerateRisks} disabled={generatingRisks} style={btnGhost}>
                    {generatingRisks ? '⏳ 生成中...' : '🤖 AI 生成'}
                  </button>
                  <button onClick={startEditRisks} style={btnGhost}>✏️ 编辑</button>
                </>
              )
            )}
          </div>
        </div>
        {editingRisks ? (
          <textarea
            value={editRisksText}
            onChange={e => setEditRisksText(e.target.value)}
            style={textareaStyle}
            placeholder="每行一条问题与阻碍"
            rows={6}
          />
        ) : teamEditable.risks.length === 0 ? (
          <div style={{ fontSize: 12, color: '#64748b', padding: 8 }}>暂无记录</div>
        ) : (
          teamEditable.risks.map((risk, i) => (
            <div key={i} style={{
              background: '#fef2f2',
              border: '1px solid #fecaca',
              borderRadius: 8,
              padding: '12px 14px',
              marginBottom: 8,
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, fontWeight: 600, color: '#dc2626', marginBottom: 4 }}>
                ⚠️ {risk}
              </div>
            </div>
          ))
        )}
      </div>

      {/* ===== 改进建议 ===== */}
      <div style={styles.section}>
        <div style={{ ...styles.sectionHeader, flexWrap: 'wrap', gap: 6 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div style={styles.sectionIcon('#dbeafe', '#2563eb')}>💡</div>
            <span style={styles.sectionTitle}>改进建议</span>
          </div>
          <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
            {onUpdateSuggestions && (
              editingSuggestions ? (
                <>
                  <button onClick={saveEditSuggestions} style={btnPrimary}>✅ 保存</button>
                  <button onClick={cancelEditSuggestions} style={btnSecondary}>取消</button>
                </>
              ) : (
                <>
                  <button onClick={handleGenerateSuggestions} disabled={generatingSuggestions} style={btnGhost}>
                    {generatingSuggestions ? '⏳ 生成中...' : '🤖 AI 生成'}
                  </button>
                  <button onClick={startEditSuggestions} style={btnGhost}>✏️ 编辑</button>
                </>
              )
            )}
          </div>
        </div>
        {editingSuggestions ? (
          <textarea
            value={editSuggestionsText}
            onChange={e => setEditSuggestionsText(e.target.value)}
            style={textareaStyle}
            placeholder="每行一条改进建议"
            rows={6}
          />
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {teamEditable.suggestions.length === 0 ? (
              <div style={{ fontSize: 12, color: '#64748b', padding: 8 }}>暂无记录</div>
            ) : (
              teamEditable.suggestions.map((s, i) => (
                <div key={i} style={{
                  display: 'flex',
                  alignItems: 'flex-start',
                  gap: 10,
                  padding: '10px 12px',
                  background: '#f9fafb',
                  border: '1px solid #e5e7eb',
                  borderRadius: 8,
                }}>
                  <span style={{
                    width: 22, height: 22,
                    borderRadius: '50%',
                    background: '#1e6dc7',
                    color: '#fff',
                    fontSize: 11,
                    fontWeight: 700,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexShrink: 0,
                  }}>{i + 1}</span>
                  <span style={{ fontSize: 12, color: '#374151', lineHeight: 1.5 }}>{s}</span>
                </div>
              ))
            )}
          </div>
        )}
      </div>

      {/* ===== 下周计划 ===== */}
      <div style={styles.section}>
        <div style={{ ...styles.sectionHeader, flexWrap: 'wrap', gap: 6 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div style={styles.sectionIcon('#ccfbf1', '#0d9488')}>📅</div>
            <span style={styles.sectionTitle}>下周计划</span>
          </div>
          <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
            {onUpdateNextPlan && (
              editingNextPlan ? (
                <>
                  <button onClick={saveEditNextPlan} style={btnPrimary}>✅ 保存</button>
                  <button onClick={cancelEditNextPlan} style={btnSecondary}>取消</button>
                </>
              ) : (
                <>
                  <button onClick={handleGenerateNextPlan} disabled={generatingNextPlan} style={btnGhost}>
                    {generatingNextPlan ? '⏳ 生成中...' : '🤖 AI 生成'}
                  </button>
                  <button onClick={startEditNextPlan} style={btnGhost}>✏️ 编辑</button>
                </>
              )
            )}
          </div>
        </div>
        {editingNextPlan ? (
          <textarea
            value={editNextPlanText}
            onChange={e => setEditNextPlanText(e.target.value)}
            style={textareaStyle}
            placeholder="每行一项下周计划"
            rows={6}
          />
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {sections.nextPlan ? (
              sections.nextPlan.split('\n').filter(Boolean).map((plan, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
                  <span style={{
                    width: 22, height: 22,
                    borderRadius: '50%',
                    background: '#2563eb',
                    color: '#fff',
                    fontSize: 11,
                    fontWeight: 700,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexShrink: 0,
                  }}>{i + 1}</span>
                  <span style={{ fontSize: 12, color: '#1e3a5f', lineHeight: 1.5, paddingTop: 2 }}>{plan.replace(/^\d+[.、]\s*/, '')}</span>
                </div>
              ))
            ) : (
              <div style={{ fontSize: 12, color: '#64748b', padding: 8 }}>暂无记录</div>
            )}
          </div>
        )}
      </div>

      {/* ===== Footer ===== */}
      <div style={{ textAlign: 'center', padding: 20, color: '#94a3b8', fontSize: 12 }}>
        团队周报 · 自动生成
      </div>
    </div>
  );
}
