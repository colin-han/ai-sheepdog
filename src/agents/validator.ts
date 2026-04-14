/**
 * Validator Agent - 验证 Agent 发现的问题
 * @see .SPEC/1-requirement/review.md §5.2
 */

import type { ValidatedIssue, ValidationStatus } from '../types/index.js';

/**
 * 待验证的 Issue
 */
interface IssueToValidate {
  id: string;
  file: string;
  line_start: number;
  line_end: number;
  title: string;
  description: string;
  category: string;
  severity: string;
  code_snippet?: string;
}

/**
 * 验证结果
 */
interface ValidationResult {
  id: string;
  status: ValidationStatus;
  confidence: number;
  reasoning: string;
  checked_files: string[];
}

/**
 * 验证单个 Issue
 *
 * 注意：这是简化版本，实际实现需要访问文件系统和 LLM
 */
export async function validateIssue(
  issue: IssueToValidate,
  _context: {
    repoPath: string;
    diffContent: string;
  },
): Promise<ValidationResult> {
  // 简化版本：基于规则进行初步验证
  // 实际实现需要调用 LLM 进行深度分析

  const { file, line_start, description } = issue;

  // 基本验证规则
  let status: ValidationStatus = 'uncertain';
  let confidence = 0.5;
  const reasoning: string[] = [];

  // 检查 1: 文件路径是否有效
  if (!file || file === 'unknown') {
    reasoning.push('文件路径无效');
    status = 'rejected';
    confidence = 0.8;
  } else {
    reasoning.push('文件路径有效');
  }

  // 检查 2: 行号是否合理
  if (line_start <= 0) {
    reasoning.push('行号无效');
    status = 'rejected';
    confidence = 0.9;
  } else {
    reasoning.push('行号有效');
  }

  // 检查 3: 描述是否具体
  if (!description || description.length < 10) {
    reasoning.push('问题描述过于简单');
    confidence = Math.max(0.3, confidence - 0.2);
  } else {
    reasoning.push('问题描述具体');
    confidence = Math.min(0.95, confidence + 0.1);
  }

  // 如果没有明确拒绝，标记为不确定
  if (status === 'uncertain') {
    reasoning.push('需要进一步人工审查');
  }

  return {
    id: issue.id,
    status,
    confidence,
    reasoning: reasoning.join('; '),
    checked_files: [file],
  };
}

/**
 * 批量验证 Issues
 *
 * @param issues - 待验证的 Issue 列表
 * @param context - 验证上下文
 * @returns 验证后的 Issue 列表
 */
export async function validateIssues(
  issues: IssueToValidate[],
  context: {
    repoPath: string;
    diffContent: string;
  },
): Promise<ValidatedIssue[]> {
  const validatedIssues: ValidatedIssue[] = [];

  for (const issue of issues) {
    const result = await validateIssue(issue, context);

    validatedIssues.push({
      ...issue,
      confidence: 0.5, // 添加必需字段
      source_agent: 'validator', // 添加必需字段
      validation_status: result.status,
      final_confidence: result.confidence,
      grounding_evidence: {
        checked_files: result.checked_files,
        checked_symbols: [],
        reasoning: result.reasoning,
      },
    } as ValidatedIssue);
  }

  return validatedIssues;
}

/**
 * 过滤掉被拒绝的 Issues
 *
 * @param issues - 验证后的 Issue 列表
 * @returns 未被拒绝的 Issue 列表
 */
export function filterRejectedIssues(
  issues: ValidatedIssue[],
): ValidatedIssue[] {
  return issues.filter((issue) => issue.validation_status !== 'rejected');
}

/**
 * 统计验证结果
 */
export interface ValidationStats {
  total: number;
  confirmed: number;
  rejected: number;
  uncertain: number;
}

export function getValidationStats(issues: ValidatedIssue[]): ValidationStats {
  const stats: ValidationStats = {
    total: issues.length,
    confirmed: 0,
    rejected: 0,
    uncertain: 0,
  };

  for (const issue of issues) {
    switch (issue.validation_status) {
      case 'confirmed':
        stats.confirmed++;
        break;
      case 'rejected':
        stats.rejected++;
        break;
      case 'uncertain':
        stats.uncertain++;
        break;
    }
  }

  return stats;
}
