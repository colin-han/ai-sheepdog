/**
 * Markdown 报告格式化器
 * @see .SPEC/1-requirement/review.md §3.2
 */

import type { ReviewReport, ValidatedIssue } from '../types/index.js';

/**
 * 严重程度的图标
 */
const SEVERITY_ICONS: Record<string, string> = {
  critical: '🔴',
  error: '🟠',
  warning: '🟡',
  suggestion: '🔵',
};

/**
 * 验证状态的图标
 */
const VALIDATION_ICONS: Record<string, string> = {
  confirmed: '✅',
  rejected: '❌',
  uncertain: '❓',
};

/**
 * 格式化单个 Issue 为 Markdown
 */
function formatIssue(issue: ValidatedIssue): string {
  const lines: string[] = [];

  // 标题
  const validationIcon = VALIDATION_ICONS[issue.validation_status] || '❓';
  lines.push(`### ${validationIcon} ${issue.id}: ${issue.title}`);

  // 元信息
  lines.push('');
  lines.push(`**文件**: \`${issue.file}:${issue.line_start}\``);
  lines.push(`**类别**: ${issue.category}`);
  lines.push(`**严重程度**: ${issue.severity}`);
  lines.push(`**置信度**: ${(issue.final_confidence * 100).toFixed(0)}%`);
  lines.push(`**来源**: ${issue.source_agent}`);

  // 描述
  lines.push('');
  lines.push('**描述**');
  lines.push(issue.description);

  // 代码片段
  if (issue.code_snippet) {
    lines.push('');
    lines.push('**代码**');
    lines.push('```');
    lines.push(issue.code_snippet);
    lines.push('```');
  }

  // 建议
  if (issue.suggestion) {
    lines.push('');
    lines.push('**建议**');
    lines.push(issue.suggestion);
  }

  // 验证依据
  if (issue.grounding_evidence) {
    lines.push('');
    lines.push('**验证依据**');
    if (issue.grounding_evidence.reasoning) {
      lines.push(issue.grounding_evidence.reasoning);
    }
    if (issue.grounding_evidence.checked_files.length > 0) {
      lines.push(
        `检查文件: ${issue.grounding_evidence.checked_files.join(', ')}`,
      );
    }
  }

  return lines.join('\n');
}

/**
 * 格式化指标统计为 Markdown
 */
function formatMetrics(report: ReviewReport): string {
  const lines: string[] = [];
  const { metrics } = report;

  lines.push('## 📊 审查统计');
  lines.push('');

  // 总体统计
  lines.push('- 验证前问题总数: ' + metrics.total_scanned);
  lines.push('- ✅ 已确认: ' + metrics.confirmed);
  lines.push('- ❌ 已拒绝: ' + metrics.rejected);
  lines.push('- ❓ 不确定: ' + metrics.uncertain);
  lines.push('');

  // 按严重程度分布
  lines.push('### 按严重程度');
  lines.push('');
  lines.push('| 严重程度 | 数量 |');
  lines.push('|---------|------|');
  lines.push(`| 🔴 Critical | ${metrics.by_severity.critical} |`);
  lines.push(`| 🟠 Error | ${metrics.by_severity.error} |`);
  lines.push(`| 🟡 Warning | ${metrics.by_severity.warning} |`);
  lines.push(`| 🔵 Suggestion | ${metrics.by_severity.suggestion} |`);
  lines.push('');

  // 按类别分布
  lines.push('### 按类别');
  lines.push('');
  lines.push('| 类别 | 数量 |');
  lines.push('|------|------|');
  lines.push(`| 🔒 安全 | ${metrics.by_category.security} |`);
  lines.push(`| 🧠 逻辑 | ${metrics.by_category.logic} |`);
  lines.push(`| ⚡ 性能 | ${metrics.by_category.performance} |`);
  lines.push(`| 🎨 风格 | ${metrics.by_category.style} |`);
  lines.push('');

  return lines.join('\n');
}

/**
 * 格式化检查清单为 Markdown
 */
function formatChecklist(report: ReviewReport): string {
  if (report.checklist.length === 0) {
    return '';
  }

  const lines: string[] = [];

  lines.push('## ✓ 检查清单');
  lines.push('');

  for (const item of report.checklist) {
    const icon = item.result === 'pass' ? '✅' : '❌';
    lines.push(`- ${icon} **${item.id}**: ${item.question}`);
  }

  lines.push('');

  return lines.join('\n');
}

/**
 * 格式化元数据为 Markdown
 */
function formatMetadata(report: ReviewReport): string {
  const lines: string[] = [];
  const { metadata } = report;

  lines.push('## 元数据');
  lines.push('');
  lines.push(`- **关联 ID**: \`${metadata.correlation_id}\``);
  lines.push(`- **审查时间**: ${metadata.timestamp}`);
  lines.push(`- **审查分支**: ${metadata.source_ref}`);
  lines.push(`- **基准分支**: ${metadata.target_ref}`);
  lines.push(`- **项目**: ${metadata.project_name}`);
  lines.push(`- **使用的 Agent**: ${metadata.agents_used.join(', ')}`);
  lines.push(`- **审查耗时**: ${(metadata.review_time_ms / 1000).toFixed(2)}s`);
  lines.push(`- **Token 消耗**: ${metadata.tokens_used}`);
  lines.push(`- **增量审查**: ${metadata.is_incremental ? '是' : '否'}`);
  lines.push(
    `- **模型**: ${metadata.models.agent_model}${metadata.models.light_model ? ` (轻量: ${metadata.models.light_model})` : ''}`,
  );
  lines.push('');

  return lines.join('\n');
}

/**
 * 格式化整个报告为 Markdown
 */
export function formatReportAsMarkdown(report: ReviewReport): string {
  const lines: string[] = [];

  // 标题
  const riskIcon: Record<string, string> = {
    high: '🔴',
    medium: '🟠',
    low: '🟢',
  };
  lines.push(`# ${riskIcon[report.risk_level]} 代码审查报告`);
  lines.push('');

  // 摘要
  lines.push('## 摘要');
  lines.push('');
  lines.push(report.summary);
  lines.push('');

  // 风险等级
  lines.push(`**风险等级**: ${report.risk_level.toUpperCase()}`);
  lines.push('');

  // 指标统计
  lines.push(formatMetrics(report));

  // 检查清单
  lines.push(formatChecklist(report));

  // 问题列表
  if (report.issues.length > 0) {
    lines.push('## 🔍 发现的问题');
    lines.push('');

    for (const issue of report.issues) {
      lines.push(formatIssue(issue));
      lines.push('---');
      lines.push('');
    }
  } else {
    lines.push('## ✅ 未发现问题');
    lines.push('');
    lines.push('太棒了！没有发现需要处理的问题。');
    lines.push('');
  }

  // 元数据
  lines.push(formatMetadata(report));

  return lines.join('\n');
}

/**
 * 格式化简短报告（用于终端输出）
 */
export function formatShortReport(report: ReviewReport): string {
  const lines: string[] = [];

  const riskIcon: Record<string, string> = {
    high: '🔴',
    medium: '🟠',
    low: '🟢',
  };

  lines.push(
    `${riskIcon[report.risk_level]} 风险等级: ${report.risk_level.toUpperCase()}`,
  );
  lines.push(`📋 ${report.summary}`);
  lines.push('');

  // 统计
  const { metrics } = report;
  lines.push(
    `✅ 已确认: ${metrics.confirmed} | ❓ 不确定: ${metrics.uncertain} | ❌ 已拒绝: ${metrics.rejected}`,
  );

  // 问题列表（仅确认的问题）
  const confirmedIssues = report.issues.filter(
    (i) => i.validation_status === 'confirmed',
  );
  if (confirmedIssues.length > 0) {
    lines.push('');
    lines.push('确认的问题:');
    for (const issue of confirmedIssues) {
      const icon = SEVERITY_ICONS[issue.severity] || '⚪';
      lines.push(
        `  ${icon} ${issue.id}: ${issue.title} (${issue.file}:${issue.line_start})`,
      );
    }
  }

  return lines.join('\n');
}
