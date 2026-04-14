/**
 * Issue 插件接口导出和工具函数
 * @see .SPEC/2-design/issue-plugin.md
 */

import type { IssueOperation, PluginConfig } from '../types/plugin.js';
import type { ValidatedIssue } from '../types/issue.js';

// 重新导出核心类型
export type {
  IssuePlugin,
  SyncContext,
  SyncResult,
  IssueStatusResult,
  IssueOperation,
  PluginConfig,
} from '../types/plugin.js';

/**
 * 从 ValidatedIssue 生成 JIRA issue 描述
 * @param issue 已验证的问题
 * @param correlation_id 关联标识
 * @returns 格式化的 issue 描述
 */
export function formatIssueDescription(
  issue: ValidatedIssue,
  correlation_id: string,
): string {
  const parts: string[] = [];

  parts.push('## 问题描述');
  parts.push(issue.description);
  parts.push('');

  parts.push('## 代码位置');
  parts.push(`文件: ${issue.file}`);
  parts.push(`行号: ${issue.line_start} - ${issue.line_end}`);
  parts.push('');

  if (issue.code_snippet) {
    parts.push('## 问题代码');
    parts.push('```');
    parts.push(issue.code_snippet);
    parts.push('```');
    parts.push('');
  }

  if (issue.suggestion) {
    parts.push('## 修复建议');
    parts.push(issue.suggestion);
    parts.push('');
  }

  parts.push('## 审查信息');
  parts.push(`- 类别: ${issue.category}`);
  parts.push(`- 严重程度: ${issue.severity}`);
  parts.push(`- 来源: ${issue.source_agent}`);
  parts.push(`- 置信度: ${issue.final_confidence.toFixed(2)}`);
  parts.push(`- 关联 PR: ${correlation_id}`);

  return parts.join('\n');
}

/**
 * 生成 JIRA label 从 correlation_id
 * @param correlation_id 关联标识
 * @returns JIRA label（带前缀）
 */
export function formatCorrelationLabel(correlation_id: string): string {
  return `sheepdog:${correlation_id}`;
}

/**
 * 验证插件配置是否完整
 * @param config 插件配置
 * @param requiredFields 必需的字段列表
 * @returns 是否验证通过
 */
export function validateConfig(
  config: PluginConfig,
  requiredFields: string[],
): { valid: boolean; missing?: string[] } {
  const missing: string[] = [];

  for (const field of requiredFields) {
    if (!config.connection[field]) {
      missing.push(field);
    }
  }

  return {
    valid: missing.length === 0,
    missing: missing.length > 0 ? missing : undefined,
  };
}

/**
 * 从操作类型和 issue 构建 JIRA issue 标题
 * @param operation Issue 操作
 * @returns JIRA issue 标题
 */
export function formatIssueTitle(operation: IssueOperation): string {
  if (operation.type === 'create') {
    return `[${operation.issue.id}] ${operation.issue.title}`;
  }
  if (operation.type === 'update') {
    return `[${operation.issue.id}] ${operation.issue.title}`;
  }
  // close 操作不创建新 issue
  return '';
}
