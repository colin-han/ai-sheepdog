/**
 * 合并决策逻辑
 * @see .SPEC/1-requirement/merge-decision.md
 */

import type { Severity } from '../types/core.js';
import type { IssueStatusResult } from '../types/plugin.js';
import type { MergeDecision } from '../types/report.js';
import { SEVERITY_ORDER } from '../types/core.js';

/**
 * 判断是否为 blocking issue
 * @param severity Issue 严重程度
 * @param allowSeverity 允许的最高严重程度
 * @returns 是否阻止合并
 */
export function isBlockingIssue(
  severity: Severity,
  allowSeverity?: Severity,
): boolean {
  // 如果没有设置允许的严重程度，所有未关闭的 issue 都是 blocking
  if (!allowSeverity) {
    return true;
  }

  // blocking 定义：severity 严格高于 allow_severity
  const severityLevel = SEVERITY_ORDER[severity];
  const allowLevel = SEVERITY_ORDER[allowSeverity];

  return severityLevel > allowLevel;
}

/**
 * 生成分并决策
 * @param statusResult Issue 状态查询结果
 * @param issueSeverities Issue ID 到 Severity 的映射
 * @param allowSeverity 允许的最高严重程度
 * @returns 合并决策
 */
export function generateMergeDecision(
  statusResult: IssueStatusResult,
  issueSeverities: Map<string, Severity>,
  allowSeverity?: Severity,
): MergeDecision {
  const issues = statusResult.issues.map((issue) => ({
    id: issue.local_id,
    is_closed: issue.is_closed,
    severity: issueSeverities.get(issue.remote_id || issue.local_id) || 'error',
    title: issue.title,
    remote_id: issue.remote_id,
  }));

  // 计算 blocking issue 数量
  const blockingIssues = issues.filter(
    (issue) =>
      !issue.is_closed && isBlockingIssue(issue.severity, allowSeverity),
  );

  const openIssues = issues.filter((issue) => !issue.is_closed);

  return {
    correlation_id: statusResult.correlation_id,
    can_merge: blockingIssues.length === 0,
    open_issues: openIssues.length,
    total_issues: issues.length,
    allow_severity: allowSeverity,
    issues,
  };
}

/**
 * 解析 severity 字符串
 * @param value severity 字符串
 * @returns 有效的 Severity 或 undefined
 */
export function parseSeverity(value: string): Severity | undefined {
  const validSeverities: Severity[] = [
    'critical',
    'error',
    'warning',
    'suggestion',
  ];
  if (validSeverities.includes(value as Severity)) {
    return value as Severity;
  }
  return undefined;
}
