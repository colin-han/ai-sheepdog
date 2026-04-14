/**
 * 报告生成器
 * @see .SPEC/1-requirement/review.md §3.1
 */

import type {
  ReviewReport,
  ReviewMetrics,
  ReviewMetadata,
  RiskLevel,
  Severity,
  IssueCategory,
  ValidatedIssue,
  ChecklistItem,
} from '../types/index.js';

/**
 * 生成报告的选项
 */
export interface ReportGenerationOptions {
  /** 关联 ID */
  correlationId: string;
  /** 审查分支 */
  sourceRef: string;
  /** 基准分支 */
  targetRef: string;
  /** 仓库路径 */
  repoPath: string;
  /** 项目名称 */
  projectName: string;
  /** 验证后的问题列表 */
  issues: ValidatedIssue[];
  /** 检查清单 */
  checklist: ChecklistItem[];
  /** 使用的 Agent */
  agentsUsed: string[];
  /** 审查耗时（毫秒） */
  reviewTimeMs: number;
  /** Token 消耗 */
  tokensUsed: number;
  /** 是否为增量审查 */
  isIncremental: boolean;
  /** LLM 模型信息 */
  models: {
    agent_model: string;
    light_model?: string;
  };
}

/**
 * 计算风险等级
 *
 * 规则：
 * - 有 critical → high
 * - 有 error → medium
 * - 其余 → low
 */
export function calculateRiskLevel(issues: ValidatedIssue[]): RiskLevel {
  for (const issue of issues) {
    if (issue.severity === 'critical') {
      return 'high';
    }
  }

  for (const issue of issues) {
    if (issue.severity === 'error') {
      return 'medium';
    }
  }

  return 'low';
}

/**
 * 计算审查统计指标
 */
export function calculateMetrics(
  issues: ValidatedIssue[],
  filesReviewed: number,
): ReviewMetrics {
  const metrics: ReviewMetrics = {
    total_scanned: issues.length,
    confirmed: 0,
    rejected: 0,
    uncertain: 0,
    by_severity: {
      critical: 0,
      error: 0,
      warning: 0,
      suggestion: 0,
    },
    by_category: {
      security: 0,
      logic: 0,
      performance: 0,
      style: 0,
    },
    files_reviewed: filesReviewed,
  };

  for (const issue of issues) {
    // 统计验证状态
    switch (issue.validation_status) {
      case 'confirmed':
        metrics.confirmed++;
        break;
      case 'rejected':
        metrics.rejected++;
        break;
      case 'uncertain':
        metrics.uncertain++;
        break;
    }

    // 统计严重程度
    metrics.by_severity[issue.severity]++;

    // 统计类别
    metrics.by_category[issue.category]++;
  }

  return metrics;
}

/**
 * 生成报告摘要
 */
export function generateSummary(
  riskLevel: RiskLevel,
  metrics: ReviewMetrics,
): string {
  const { confirmed, rejected, uncertain } = metrics;

  const parts: string[] = [];

  // 风险等级
  const riskLevelText: Record<RiskLevel, string> = {
    high: '高风险',
    medium: '中等风险',
    low: '低风险',
  };
  parts.push(`本次审查发现 ${riskLevelText[riskLevel]}`);

  // 问题统计
  if (confirmed > 0) {
    parts.push(`确认 ${confirmed} 个问题`);
  }
  if (uncertain > 0) {
    parts.push(`${uncertain} 个问题需要进一步确认`);
  }
  if (rejected > 0) {
    parts.push(`排除了 ${rejected} 个误报`);
  }

  return parts.join('，') + '。';
}

/**
 * 生成审查报告
 */
export function generateReport(options: ReportGenerationOptions): ReviewReport {
  const {
    correlationId,
    sourceRef,
    targetRef,
    repoPath,
    projectName,
    issues,
    checklist,
    agentsUsed,
    reviewTimeMs,
    tokensUsed,
    isIncremental,
    models,
  } = options;

  // 计算风险等级
  const risk_level = calculateRiskLevel(issues);

  // 计算统计指标
  const files_reviewed = new Set(issues.map((i) => i.file)).size;
  const metrics = calculateMetrics(issues, files_reviewed);

  // 生成摘要
  const summary = generateSummary(risk_level, metrics);

  // 构建元数据
  const metadata: ReviewMetadata = {
    correlation_id: correlationId,
    timestamp: new Date().toISOString(),
    source_ref: sourceRef,
    target_ref: targetRef,
    repo_path: repoPath,
    project_name: projectName,
    agents_used: agentsUsed,
    review_time_ms: reviewTimeMs,
    tokens_used: tokensUsed,
    is_incremental: isIncremental,
    models,
  };

  return {
    summary,
    risk_level,
    issues,
    checklist,
    metrics,
    metadata,
  };
}

/**
 * 根据严重程度过滤问题
 */
export function filterIssuesBySeverity(
  issues: ValidatedIssue[],
  minSeverity: Severity,
): ValidatedIssue[] {
  const severityOrder: Record<Severity, number> = {
    critical: 4,
    error: 3,
    warning: 2,
    suggestion: 1,
  };

  return issues.filter(
    (issue) => severityOrder[issue.severity] >= severityOrder[minSeverity],
  );
}

/**
 * 根据类别过滤问题
 */
export function filterIssuesByCategory(
  issues: ValidatedIssue[],
  category: IssueCategory,
): ValidatedIssue[] {
  return issues.filter((issue) => issue.category === category);
}

/**
 * 根据验证状态过滤问题
 */
export function filterIssuesByValidationStatus(
  issues: ValidatedIssue[],
  status: 'confirmed' | 'rejected' | 'uncertain',
): ValidatedIssue[] {
  return issues.filter((issue) => issue.validation_status === status);
}
