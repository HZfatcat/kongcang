import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { KpiService } from '../kpi/kpi.service';
import * as nodemailer from 'nodemailer';
import * as dns from 'dns';
import * as net from 'net';
import * as tls from 'tls';
dns.setDefaultResultOrder('ipv4first');

// ====== 类型 ======
export interface ReportOptions {
  startDate?: string;
  endDate?: string;
  summary?: string;
  nextPlan?: string;
  type?: 'team' | 'personal';
  agentName?: string;
  /** 高频问题TOP5 */
  topQuestions?: { name: string; count: number; pct: number }[];
  /** 问题与阻碍 */
  risks?: string[];
  /** 改进建议 */
  suggestions?: string[];
}

export interface EmailOptions {
  to: string;
  subject: string;
  html: string;
}

@Injectable()
export class WeeklyReportService {
  constructor(
    private readonly kpiService: KpiService,
    private readonly configService: ConfigService,
  ) {}

  /**
   * 从 KPI 服务获取原始数据
   */
  private async fetchKpiData(startDate?: string, endDate?: string) {
    const [overview, demand, funnel, agentOverview, productModule] =
      await Promise.all([
        this.kpiService.getOverview(startDate, endDate),
        this.kpiService.getDemandOverview(startDate, endDate),
        this.kpiService.getConsultationFunnel(
          startDate,
          endDate,
          'week' as any,
        ),
        this.kpiService.getAgentOverview(startDate, endDate),
        this.kpiService.getProductModuleDistribution(
          startDate,
          endDate,
          undefined,
        ),
      ]);
    return { overview, demand, funnel, agentOverview, productModule };
  }

  /**
   * 生成精美的 Dashboard 风格 HTML 周报
   */
  async generateHtml(opts: ReportOptions): Promise<string> {
    const data = await this.fetchKpiData(opts.startDate, opts.endDate);

    const { overview, demand, funnel, agentOverview, productModule } = data;

    // 日期范围
    const rangeLabel = opts.startDate && opts.endDate
      ? `${opts.startDate} ~ ${opts.endDate}`
      : '近 90 天';

    // 满意度
    const satPct = ((overview.satisfactionRate ?? 0) * 100).toFixed(1);
    const satOk = (overview.satisfactionRate ?? 0) >= 0.9;

    // 需求完成率
    const completionPct = ((demand.completionRate ?? 0) * 100).toFixed(1);

    // 产品模块分布
    const moduleRows = (productModule?.distribution ?? []).slice(0, 8);
    const maxModuleCount = moduleRows.length > 0
      ? Math.max(...moduleRows.map((m) => m.count))
      : 1;

    // 客服排行（Top 10）
    const agentRows = (agentOverview?.rows ?? []).slice(0, 10);

    // 漏斗数据
    const funnelPeriods = funnel?.periods ?? [];

    // 本月各周漏斗（取最近4周）
    const recentWeeks = funnelPeriods.slice(-4);

    // 指标定义
    const totalDemand = demand.totalIdentifiedCount ?? 0;
    const completedDemand = demand.completedCount ?? 0;
    const rejected = demand.rejectedCount ?? 0;
    const bugTotal = demand.bugCount ?? 0;
    const bugCompleted = demand.bugCompletedCount ?? 0;

    // ====== 计算指标 ======
    // BUG关单率
    const bugClosureRate = bugTotal > 0
      ? ((bugCompleted / bugTotal) * 100).toFixed(1)
      : '0.0';
    // 总关单率 = (已完成需求 + 已完成Bug) / (总需求 + 总Bug)
    const totalClosureRate = (totalDemand + bugTotal) > 0
      ? (((completedDemand + bugCompleted) / (totalDemand + bugTotal)) * 100).toFixed(1)
      : '0.0';
    // 问题解决率 - 从漏斗计算：完成的需求 / 识别的需求
    const totalConsultToReq = funnelPeriods.reduce((sum: number, w: any) => sum + (w.requirementIdentifiedCount ?? 0), 0);
    const totalReqCompleted = funnelPeriods.reduce((sum: number, w: any) => sum + (w.requirementCompletedCount ?? 0), 0);
    const resolutionRate = totalConsultToReq > 0
      ? ((totalReqCompleted / totalConsultToReq) * 100).toFixed(1)
      : '0.0';
    // 响应时长（从 agentOverview 估算平均）
    const avgResponseTime = agentOverview?.rows?.length > 0
      ? agentOverview.rows.reduce((sum: number, r: any) => sum + (r.avgResponseTime ?? 0), 0) / agentOverview.rows.length
      : 'N/A';
    // 人效值 = 需求数 / 客服人数
    const agentCount = agentRows.length || 1;
    const efficiencyPerAgent = ((totalDemand + bugTotal) / agentCount).toFixed(1);

    // 本周完成统计
    const totalConsultCount = funnelPeriods.reduce((sum: number, w: any) => sum + (w.consultationCount ?? 0), 0);
    // 回访数、华为云、闭环、商机 - 使用 demand 中的可用数据
    const revisitCount = demand.followUpCount ?? 0;
    const hwCloudCount = 0; // 暂无数据源
    const closedLoopCount = demand.completedCount ?? 0;
    const opportunityCount = 0; // 暂无数据源

    // ====== 漂亮 v2 风格 HTML 模板 ======
    return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>客服部周报</title>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body {
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'PingFang SC', 'Hiragino Sans GB', 'Microsoft YaHei', sans-serif;
    background: #f0f2f5;
    color: #333;
    padding: 20px;
  }
  .container { max-width: 800px; margin: 0 auto; }
  /* ===== Header ===== */
  .header {
    background: linear-gradient(135deg, #1a1a2e 0%, #16213e 50%, #0f3460 100%);
    border-radius: 16px;
    padding: 32px 40px;
    color: #fff;
    margin-bottom: 24px;
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    position: relative;
    overflow: hidden;
  }
  .header::before {
    content: '';
    position: absolute;
    top: -60%;
    right: -10%;
    width: 350px;
    height: 350px;
    background: radial-gradient(circle, rgba(255,255,255,0.06) 0%, transparent 70%);
    border-radius: 50%;
  }
  .header-left { position: relative; z-index: 1; }
  .header-left h1 { font-size: 26px; margin-bottom: 6px; letter-spacing: 1px; }
  .header-left .sub { opacity: 0.8; font-size: 14px; }
  .header-left .badge {
    display: inline-block;
    background: rgba(255,255,255,0.15);
    padding: 3px 14px;
    border-radius: 20px;
    font-size: 12px;
    margin-top: 8px;
  }
  .header-right { position: relative; z-index: 1; text-align: right; }
  .header-right .efficiency-label { font-size: 11px; opacity: 0.7; margin-bottom: 2px; }
  .header-right .efficiency-value { font-size: 28px; font-weight: 700; }
  .header-right .efficiency-unit { font-size: 13px; opacity: 0.8; }
  /* ===== 业务指标双卡片 ===== */
  .biz-row { display: flex; gap: 16px; margin-bottom: 20px; }
  .biz-card {
    flex: 1;
    background: #fff;
    border-radius: 14px;
    padding: 24px;
    box-shadow: 0 2px 8px rgba(0,0,0,0.05);
    position: relative;
    overflow: hidden;
  }
  .biz-card .biz-icon {
    width: 44px; height: 44px;
    border-radius: 12px;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 22px;
    margin-bottom: 12px;
  }
  .biz-card .biz-label { font-size: 13px; color: #888; margin-bottom: 4px; }
  .biz-card .biz-value { font-size: 36px; font-weight: 700; line-height: 1.2; }
  .biz-card .biz-value.green { color: #22c55e; }
  .biz-card .biz-value.blue { color: #3b82f6; }
  .biz-card .biz-value.orange { color: #f59e0b; }
  .biz-card .biz-value.red { color: #ef4444; }
  .biz-card .biz-sub { font-size: 12px; color: #aaa; margin-top: 4px; }
  .biz-card .biz-bar {
    height: 4px;
    background: #e5e7eb;
    border-radius: 2px;
    margin-top: 12px;
    overflow: hidden;
  }
  .biz-card .biz-bar .fill {
    height: 100%;
    border-radius: 2px;
    transition: width 0.6s ease;
  }
  .biz-card .biz-bar .fill.green-bg { background: linear-gradient(90deg, #22c55e, #16a34a); }
  .biz-card .biz-bar .fill.orange-bg { background: linear-gradient(90deg, #f59e0b, #d97706); }
  .biz-card .biz-bar .fill.blue-bg { background: linear-gradient(90deg, #3b82f6, #6366f1); }
  /* ===== 关联指标四宫格 ===== */
  .metric-grid {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 12px;
    margin-bottom: 20px;
  }
  .metric-item {
    background: #fff;
    border-radius: 12px;
    padding: 16px 14px;
    box-shadow: 0 1px 4px rgba(0,0,0,0.04);
    text-align: center;
  }
  .metric-item .m-icon { font-size: 20px; margin-bottom: 6px; }
  .metric-item .m-label { font-size: 12px; color: #999; margin-bottom: 4px; }
  .metric-item .m-value { font-size: 22px; font-weight: 700; }
  .metric-item .m-value.green { color: #22c55e; }
  .metric-item .m-value.blue { color: #3b82f6; }
  .metric-item .m-value.orange { color: #f59e0b; }
  .metric-item .m-value.red { color: #ef4444; }
  .metric-item .m-bar {
    height: 3px;
    background: #f0f0f0;
    border-radius: 2px;
    margin-top: 8px;
    overflow: hidden;
  }
  .metric-item .m-bar .fill { height: 100%; border-radius: 2px; }
  .metric-item .m-bar .fill.green-bg { background: #22c55e; }
  .metric-item .m-bar .fill.blue-bg { background: #3b82f6; }
  .metric-item .m-bar .fill.orange-bg { background: #f59e0b; }
  .metric-item .m-bar .fill.red-bg { background: #ef4444; }
  /* ===== 通用卡片 ===== */
  .card {
    background: #fff;
    border-radius: 14px;
    padding: 24px;
    box-shadow: 0 2px 8px rgba(0,0,0,0.05);
    margin-bottom: 20px;
  }
  .card-title {
    font-size: 15px;
    font-weight: 600;
    color: #333;
    margin-bottom: 16px;
    padding-bottom: 10px;
    border-bottom: 2px solid #f0f2f5;
    display: flex;
    align-items: center;
    gap: 8px;
  }
  .card-title .icon { font-size: 18px; }
  /* ===== 高频问题 ===== */
  .topq-item {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 8px 0;
    border-bottom: 1px solid #f5f5f5;
  }
  .topq-item:last-child { border-bottom: none; }
  .topq-rank {
    width: 24px; height: 24px;
    border-radius: 50%;
    background: #eef2ff;
    color: #4f46e5;
    font-size: 12px;
    font-weight: 700;
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
  }
  .topq-rank.gold { background: #fef3c7; color: #d97706; }
  .topq-rank.silver { background: #f1f5f9; color: #64748b; }
  .topq-rank.bronze { background: #fef2e6; color: #c2410c; }
  .topq-name { flex: 1; font-size: 14px; color: #333; }
  .topq-count { font-size: 13px; color: #888; white-space: nowrap; }
  .topq-bar { width: 80px; height: 6px; background: #f0f0f0; border-radius: 3px; overflow: hidden; flex-shrink: 0; }
  .topq-bar .fill { height: 100%; border-radius: 3px; background: linear-gradient(90deg, #6366f1, #8b5cf6); }
  /* ===== 本周完成统计 ===== */
  .stat-grid {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 10px;
  }
  .stat-item {
    background: #f9fafb;
    border-radius: 10px;
    padding: 14px 12px;
    text-align: center;
  }
  .stat-item .s-icon { font-size: 18px; margin-bottom: 4px; }
  .stat-item .s-label { font-size: 12px; color: #999; }
  .stat-item .s-value { font-size: 20px; font-weight: 700; color: #333; margin-top: 2px; }
  /* ===== 列表项（问题与阻碍、改进建议） ===== */
  .list-item {
    display: flex;
    gap: 10px;
    padding: 6px 0;
    font-size: 14px;
    line-height: 1.6;
  }
  .list-item .bullet {
    width: 6px; height: 6px;
    border-radius: 50%;
    margin-top: 8px;
    flex-shrink: 0;
  }
  .list-item .bullet.red { background: #ef4444; }
  .list-item .bullet.green { background: #22c55e; }
  .list-item .text { color: #555; }
  /* ===== 下周计划 ===== */
  .section-text { font-size: 14px; line-height: 1.8; color: #555; white-space: pre-wrap; }
  /* ===== 产品模块 ===== */
  .module-bar { display: flex; align-items: center; gap: 8px; margin-bottom: 6px; }
  .module-bar .name { width: 90px; font-size: 12px; color: #666; text-align: right; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .module-bar .track { flex: 1; height: 18px; background: #f3f4f6; border-radius: 4px; overflow: hidden; }
  .module-bar .track .fill { height: 100%; border-radius: 4px; background: linear-gradient(90deg, #6366f1, #8b5cf6); transition: width 0.5s ease; }
  .module-bar .count { width: 40px; font-size: 12px; color: #888; text-align: right; }
  /* ===== 客服排行表格 ===== */
  table { width: 100%; border-collapse: collapse; font-size: 13px; }
  table th {
    text-align: left;
    padding: 10px 12px;
    border-bottom: 2px solid #e5e7eb;
    color: #666;
    font-weight: 600;
    font-size: 12px;
    white-space: nowrap;
  }
  table td {
    padding: 10px 12px;
    border-bottom: 1px solid #f3f4f6;
  }
  table tr:hover td { background: #f9fafb; }
  .tag {
    display: inline-block;
    padding: 2px 10px;
    border-radius: 12px;
    font-size: 12px;
    font-weight: 500;
  }
  .tag.green { background: #dcfce7; color: #16a34a; }
  .tag.red { background: #fee2e2; color: #dc2626; }
  .tag.blue { background: #dbeafe; color: #2563eb; }
  .tag.yellow { background: #fef3c7; color: #d97706; }
  /* ===== 咨询漏斗 ===== */
  .funnel-row { display: flex; align-items: center; gap: 12px; margin-bottom: 10px; }
  .funnel-row .funnel-label { width: 100px; font-size: 13px; color: #666; text-align: right; }
  .funnel-row .funnel-bar { flex: 1; height: 26px; background: #f3f4f6; border-radius: 6px; overflow: hidden; }
  .funnel-row .funnel-bar .fill { height: 100%; border-radius: 6px; display: flex; align-items: center; padding-left: 10px; font-size: 12px; color: #fff; font-weight: 500; }
  .funnel-row .funnel-val { width: 60px; font-size: 13px; font-weight: 600; color: #333; }
  /* ===== 页脚 ===== */
  .footer {
    text-align: center;
    color: #aaa;
    font-size: 12px;
    padding: 20px;
    border-top: 1px solid #eee;
    margin-top: 10px;
  }
  @media (max-width: 640px) {
    body { padding: 12px; }
    .header { flex-direction: column; padding: 24px 20px; }
    .header-right { text-align: left; margin-top: 12px; }
    .header-left h1 { font-size: 20px; }
    .biz-row { flex-direction: column; }
    .metric-grid { grid-template-columns: repeat(2, 1fr); }
    .stat-grid { grid-template-columns: repeat(2, 1fr); }
  }
</style>
</head>
<body>
<div class="container">

  <!-- ====== Header 头部 ====== -->
  <div class="header">
    <div class="header-left">
      <h1>📋 客服部${opts.type === 'personal' ? '个人' : '团队'}周报</h1>
      <div class="sub">${rangeLabel}${opts.agentName ? ` · ${opts.agentName}` : ''}</div>
      <div class="badge">📅 ${new Date().toLocaleDateString('zh-CN')}</div>
    </div>
    <div class="header-right">
      <div class="efficiency-label">人效值</div>
      <div class="efficiency-value">${efficiencyPerAgent}</div>
      <div class="efficiency-unit">需求+Bug / 人</div>
    </div>
  </div>

  <!-- ====== 业务指标：总关单率 + 满意度 ====== -->
  <div class="biz-row">
    <div class="biz-card">
      <div class="biz-icon" style="background:#eef2ff;">📊</div>
      <div class="biz-label">总关单率</div>
      <div class="biz-value ${Number(totalClosureRate) >= 70 ? 'green' : Number(totalClosureRate) >= 50 ? 'orange' : 'red'}">${totalClosureRate}%</div>
      <div class="biz-sub">已完成 ${completedDemand + bugCompleted} / 总计 ${totalDemand + bugTotal}</div>
      <div class="biz-bar"><div class="fill ${Number(totalClosureRate) >= 70 ? 'green-bg' : 'orange-bg'}" style="width:${totalClosureRate}%"></div></div>
    </div>
    <div class="biz-card">
      <div class="biz-icon" style="background:#fef2f2;">😊</div>
      <div class="biz-label">客户满意度</div>
      <div class="biz-value ${satOk ? 'green' : 'red'}">${satPct}%</div>
      <div class="biz-sub">${overview.ratedSessions ?? 0} 条评分 · ${overview.satisfactionRate ?? 0 >= 0.9 ? '优秀' : overview.satisfactionRate ?? 0 >= 0.8 ? '良好' : '待提升'}</div>
      <div class="biz-bar"><div class="fill ${satOk ? 'green-bg' : 'orange-bg'}" style="width:${satPct}%"></div></div>
    </div>
  </div>

  <!-- ====== 关联指标四宫格 ====== -->
  <div class="metric-grid">
    <div class="metric-item">
      <div class="m-icon">📝</div>
      <div class="m-label">需求关单率</div>
      <div class="m-value ${demand.completionRate >= 0.6 ? 'green' : 'orange'}">${completionPct}%</div>
      <div class="m-bar"><div class="fill ${demand.completionRate >= 0.6 ? 'green-bg' : 'orange-bg'}" style="width:${completionPct}%"></div></div>
    </div>
    <div class="metric-item">
      <div class="m-icon">🐛</div>
      <div class="m-label">BUG关单率</div>
      <div class="m-value ${Number(bugClosureRate) >= 70 ? 'green' : Number(bugClosureRate) >= 40 ? 'orange' : 'red'}">${bugClosureRate}%</div>
      <div class="m-bar"><div class="fill ${Number(bugClosureRate) >= 70 ? 'green-bg' : 'orange-bg'}" style="width:${bugClosureRate}%"></div></div>
    </div>
    <div class="metric-item">
      <div class="m-icon">✅</div>
      <div class="m-label">问题解决率</div>
      <div class="m-value ${Number(resolutionRate) >= 70 ? 'green' : Number(resolutionRate) >= 50 ? 'orange' : 'red'}">${resolutionRate}%</div>
      <div class="m-bar"><div class="fill ${Number(resolutionRate) >= 70 ? 'green-bg' : 'orange-bg'}" style="width:${resolutionRate}%"></div></div>
    </div>
    <div class="metric-item">
      <div class="m-icon">⏱️</div>
      <div class="m-label">平均响应时长</div>
      <div class="m-value blue">${typeof avgResponseTime === 'number' ? avgResponseTime.toFixed(1) + 's' : avgResponseTime}</div>
      <div class="m-bar"><div class="fill blue-bg" style="width:60%"></div></div>
    </div>
  </div>

  <!-- ====== 本周工作综述 ====== -->
  ${opts.summary ? `
  <div class="card">
    <div class="card-title"><span class="icon">📌</span> 本周工作综述</div>
    <div class="section-text">${opts.summary}</div>
  </div>` : ''}

  <!-- ====== 高频问题 TOP5 ====== -->
  ${opts.topQuestions && opts.topQuestions.length > 0 ? `
  <div class="card">
    <div class="card-title"><span class="icon">🔝</span> 高频问题 TOP${opts.topQuestions.length}</div>
    ${opts.topQuestions.map((q, i) => {
      const rankClass = i === 0 ? 'gold' : i === 1 ? 'silver' : i === 2 ? 'bronze' : '';
      return `<div class="topq-item">
        <div class="topq-rank ${rankClass}">${i + 1}</div>
        <div class="topq-name">${q.name}</div>
        <div class="topq-bar"><div class="fill" style="width:${q.pct}%"></div></div>
        <div class="topq-count">${q.count}次 · ${q.pct}%</div>
      </div>`;
    }).join('')}
  </div>` : ''}

  <!-- ====== 本周完成统计 ====== -->
  <div class="card">
    <div class="card-title"><span class="icon">✅</span> 本周完成</div>
    <div class="stat-grid">
      <div class="stat-item">
        <div class="s-icon">💬</div>
        <div class="s-label">咨询量</div>
        <div class="s-value">${totalConsultCount}</div>
      </div>
      <div class="stat-item">
        <div class="s-icon">📞</div>
        <div class="s-label">回访</div>
        <div class="s-value">${revisitCount}</div>
      </div>
      <div class="stat-item">
        <div class="s-icon">☁️</div>
        <div class="s-label">华为云</div>
        <div class="s-value">${hwCloudCount}</div>
      </div>
      <div class="stat-item">
        <div class="s-icon">📋</div>
        <div class="s-label">需求</div>
        <div class="s-value">${totalDemand}</div>
      </div>
      <div class="stat-item">
        <div class="s-icon">🐛</div>
        <div class="s-label">BUG</div>
        <div class="s-value">${bugTotal}</div>
      </div>
      <div class="stat-item">
        <div class="s-icon">🔄</div>
        <div class="s-label">闭环</div>
        <div class="s-value">${closedLoopCount}</div>
      </div>
      <div class="stat-item">
        <div class="s-icon">💼</div>
        <div class="s-label">商机</div>
        <div class="s-value">${opportunityCount}</div>
      </div>
    </div>
  </div>

  <!-- ====== 咨询漏斗 ====== -->
  ${recentWeeks.length > 0 ? `
  <div class="card">
    <div class="card-title"><span class="icon">🔁</span> 咨询转化漏斗（最近 ${recentWeeks.length} 周）</div>
    <table>
      <thead>
        <tr>
          <th>周次</th>
          <th>咨询量</th>
          <th>转需求</th>
          <th>需求完成</th>
          <th>转化率</th>
        </tr>
      </thead>
      <tbody>
        ${recentWeeks.slice().reverse().map((w: any) => {
          const consultRate = w.consultationCount > 0
            ? ((w.requirementIdentifiedCount / w.consultationCount) * 100).toFixed(1)
            : '0.0';
          const completionRate = w.requirementIdentifiedCount > 0
            ? ((w.requirementCompletedCount / w.requirementIdentifiedCount) * 100).toFixed(1)
            : '0.0';
          return `<tr>
            <td>${w.periodLabel ?? w.periodStart ?? '-'}</td>
            <td>${w.consultationCount ?? 0}</td>
            <td>${w.requirementIdentifiedCount ?? 0}</td>
            <td>${w.requirementCompletedCount ?? 0}</td>
            <td>咨询→需求 ${consultRate}% / 完成 ${completionRate}%</td>
          </tr>`;
        }).join('')}
      </tbody>
    </table>
  </div>` : ''}

  <!-- ====== 产品模块分布 ====== -->
  ${moduleRows.length > 0 ? `
  <div class="card">
    <div class="card-title"><span class="icon">📦</span> 产品模块 Top ${moduleRows.length}</div>
    ${moduleRows.map((m) => `
      <div class="module-bar">
        <div class="name">${m.module}</div>
        <div class="track"><div class="fill" style="width:${(m.count / maxModuleCount) * 100}%"></div></div>
        <div class="count">${m.count}</div>
      </div>`).join('')}
  </div>` : ''}

  <!-- ====== 问题与阻碍 ====== -->
  ${opts.risks && opts.risks.length > 0 ? `
  <div class="card">
    <div class="card-title"><span class="icon">⚠️</span> 问题与阻碍</div>
    ${opts.risks.map((r) => `
      <div class="list-item">
        <div class="bullet red"></div>
        <div class="text">${r}</div>
      </div>`).join('')}
  </div>` : ''}

  <!-- ====== 改进建议 ====== -->
  ${opts.suggestions && opts.suggestions.length > 0 ? `
  <div class="card">
    <div class="card-title"><span class="icon">💡</span> 改进建议</div>
    ${opts.suggestions.map((s) => `
      <div class="list-item">
        <div class="bullet green"></div>
        <div class="text">${s}</div>
      </div>`).join('')}
  </div>` : ''}

  <!-- ====== 下周计划 ====== -->
  ${opts.nextPlan ? `
  <div class="card">
    <div class="card-title"><span class="icon">🎯</span> 下周工作计划</div>
    <div class="section-text">${opts.nextPlan}</div>
  </div>` : ''}

  <!-- ====== 客服排行 ====== -->
  ${agentRows.length > 0 ? `
  <div class="card">
    <div class="card-title"><span class="icon">🏆</span> 客服需求排行 Top ${agentRows.length}</div>
    <table>
      <thead>
        <tr>
          <th>#</th>
          <th>客服</th>
          <th>需求数</th>
          <th>已完成</th>
          <th>已驳回</th>
          <th>长期演进</th>
          <th>完成率</th>
          <th>Bug</th>
          <th>Bug完成</th>
        </tr>
      </thead>
      <tbody>
        ${agentRows.map((r: any, i: number) => `
          <tr>
            <td>${i + 1}</td>
            <td><strong>${r.agentName}</strong></td>
            <td>${r.reqCreated}</td>
            <td>${r.reqCompleted}</td>
            <td>${r.reqRejected}</td>
            <td>${r.reqLongTerm}</td>
            <td>${(r.reqCompletionRate * 100).toFixed(0)}%</td>
            <td>${r.bugCreated}</td>
            <td>${r.bugCompleted}</td>
          </tr>`).join('')}
      </tbody>
    </table>
  </div>` : ''}

  <!-- ====== 页脚 ====== -->
  <div class="footer">
    GitCode 客服团队 · 自动生成 · ${new Date().toLocaleString('zh-CN')}
  </div>

</div>
</body>
</html>`;
  }

  /**
   * 通过 SMTP 发送邮件（nodemailer）
   */
  async sendEmail(opts: EmailOptions): Promise<void> {
    const host = this.configService.get<string>('SMTP_HOST');
    const port = this.configService.get<number>('SMTP_PORT');
    const user = this.configService.get<string>('SMTP_USER');
    const pass = this.configService.get<string>('SMTP_PASS');
    const from = this.configService.get<string>('SMTP_FROM');

    if (!host || !user || !pass) {
      throw new Error(
        'SMTP 未配置，请在 .env 中设置 SMTP_HOST / SMTP_PORT / SMTP_USER / SMTP_PASS / SMTP_FROM',
      );
    }

    try {
      // 使用操作系统 DNS 解析主机名（Node 内部 c-ares 在某些网络环境对 QQ 邮箱超时）
      const { address: smtpIp } = await dns.promises.lookup(host, { family: 4 });
      const useSsl = (port ?? 587) === 465;

      // 手动创建 TCP + TLS 连接，等待连接完成后再传给 nodemailer
      const socket = await new Promise<net.Socket>((resolve, reject) => {
        let sock: net.Socket;
        if (useSsl) {
          const tcp = net.connect(port ?? 465, smtpIp);
          tcp.once('error', reject);
          const tlsSock = tls.connect(
            { socket: tcp, host, servername: host, rejectUnauthorized: false },
            () => resolve(tlsSock),
          );
          tlsSock.once('error', reject);
        } else {
          sock = net.connect(port ?? 587, smtpIp);
          sock.once('connect', () => resolve(sock));
          sock.once('error', reject);
        }
      });

      const transporter = nodemailer.createTransport({
        connection: socket,
        auth: { user, pass },
        secure: true,
        tls: { servername: host },
      });

      await transporter.sendMail({
        from: from ?? user,
        to: opts.to,
        subject: opts.subject,
        html: opts.html,
      });
    } catch (e: any) {
      throw new Error(`邮件发送失败: ${e.message}`);
    }
  }
}
