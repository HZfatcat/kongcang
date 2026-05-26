/**
 * 周报 AI 生成工具（前端规则引擎）
 * 基于业务指标数据自动分析问题、建议和计划
 */
import type { WeeklyMetrics } from '../pages/WeeklyReportPage';

/** 根据指标数据生成问题与阻碍列表 */
export function generateRisks(metrics: WeeklyMetrics): string[] {
  const risks: string[] = [];

  if (metrics.totalCloseRate < 0.95) {
    const rate = (metrics.totalCloseRate * 100).toFixed(2);
    risks.push(`关单率不达标（${rate}%），需关注需求/缺陷闭环进度`);
  }
  if (metrics.satisfactionRate < 0.95) {
    const rate = (metrics.satisfactionRate * 100).toFixed(2);
    risks.push(`客户满意度偏低（${rate}%），需提升服务质量和沟通技巧`);
  }
  if (metrics.problemResolutionRate < 0.90) {
    const rate = (metrics.problemResolutionRate * 100).toFixed(2);
    risks.push(`问题解决率未达标（${rate}%），需加强知识库支撑和培训`);
  }
  if (metrics.avgFirstResponseTime !== null && metrics.avgFirstResponseTime > 30) {
    risks.push(`首次响应时长偏高（${Math.round(metrics.avgFirstResponseTime)}s），需优化值班排班策略`);
  }
  if (metrics.avgResponseTime !== null && metrics.avgResponseTime > 120) {
    risks.push(`平均响应时长超标（${Math.round(metrics.avgResponseTime)}s），需加快处理速度、简化流程`);
  }
  if (metrics.newDemands > 0 && metrics.closedDemands / metrics.newDemands < 0.5) {
    risks.push(`需求闭环滞后 — 当前${metrics.newDemands}个新增需求中仅闭环${metrics.closedDemands}个，需推进排期`);
  }
  if (metrics.newBugs > 0 && metrics.closedBugs / metrics.newBugs < 0.5) {
    risks.push(`缺陷修复进度滞后 — 新增${metrics.newBugs}个BUG中仅闭环${metrics.closedBugs}个，需加快处理`);
  }
  if (metrics.returnVisitCount !== null && metrics.returnVisitCount === 0) {
    risks.push('本周回访次数为零，需安排客户回访计划');
  }

  // 如果没有什么明显问题，给一个通用提示
  if (risks.length === 0) {
    risks.push('各项指标基本达标，需持续关注数据变化趋势');
  }

  return risks;
}

/** 根据指标数据和问题列表生成改进建议 */
export function generateSuggestions(metrics: WeeklyMetrics, risks: string[]): string[] {
  const suggestions: string[] = [];

  if (metrics.satisfactionRate < 0.95) {
    suggestions.push('优化服务话术，加强客户沟通技巧培训，提升客户满意度');
  }
  if (metrics.totalCloseRate < 0.95) {
    suggestions.push('建立需求/缺陷闭环跟踪机制，设定明确排期和负责人');
  }
  if (metrics.avgFirstResponseTime !== null && metrics.avgFirstResponseTime > 30) {
    suggestions.push('优化平台自助帮助中心，引导用户自助解决常见高频问题');
  }
  if (metrics.avgResponseTime !== null && metrics.avgResponseTime > 120) {
    suggestions.push('梳理常见问题知识库，提升客服人员查询和响应效率');
  }
  if (metrics.problemResolutionRate < 0.90) {
    suggestions.push('完善 SOP 流程文档，定期组织业务知识培训和案例分享');
  }
  if (metrics.returnVisitCount !== null && metrics.returnVisitCount === 0) {
    suggestions.push('制定定期回访计划，主动了解客户使用体验和潜在需求');
  }

  // 通用建议
  if (metrics.consultationCount > 50) {
    suggestions.push('关注高频咨询问题趋势，推动产品侧优化以降低客服压力');
  }
  if (metrics.opportunityCount > 0 && metrics.opportunityWon / metrics.opportunityCount < 0.3) {
    suggestions.push('分析商机转化链路，排查转化瓶颈并制定优化策略');
  }

  // 如果建议太少，补充通用建议
  if (suggestions.length < 2) {
    suggestions.push('持续优化自助服务能力，减少人工重复咨询量');
  }

  return suggestions;
}

/** 根据指标数据生成下周工作计划（多行文本） */
export function generateNextPlan(metrics: WeeklyMetrics): string {
  const plans: string[] = [];

  if (metrics.totalCloseRate < 0.95) {
    plans.push('推进未闭环需求/缺陷的排期和跟踪，提升关单率');
  }
  if (metrics.satisfactionRate < 0.95 || metrics.problemResolutionRate < 0.90) {
    plans.push('开展服务质量提升专项，组织业务知识培训');
  }
  if (metrics.avgFirstResponseTime !== null && metrics.avgFirstResponseTime > 30) {
    plans.push('优化排班方案，确保高峰时段响应速度');
  }
  if (metrics.returnVisitCount !== null && metrics.returnVisitCount === 0) {
    plans.push('安排客户回访工作，主动收集使用反馈');
  }
  if (metrics.newDemands > 0 && metrics.closedDemands / metrics.newDemands < 0.5) {
    plans.push('推动产品侧确认需求排期，跟进闭环进度');
  }

  // 通用计划项
  plans.push('梳理本周高频问题，更新知识库内容');
  plans.push('按计划完成各项日常客服工作');

  return plans.map((p, i) => `${i + 1}. ${p}`).join('\n');
}
