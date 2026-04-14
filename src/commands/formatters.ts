/**
 * Status 命令输出格式化
 * @see .SPEC/1-requirement/merge-decision.md §5
 */

import type { MergeDecision } from '../types/report.js';
import { SEVERITY_ORDER } from '../types/core.js';

/**
 * 格式化默认 CLI 输出
 */
export function formatStatusOutput(decision: MergeDecision): string {
  const lines: string[] = [];

  lines.push('@ AI Sheepdog - Status Check');
  lines.push('═'.repeat(48));

  // 解析 correlation_id 获取项目信息和分支信息
  const parts = decision.correlation_id.split(':');
  const projectName = parts[0] || 'unknown';
  const sourceBranch = parts[1] || 'unknown';
  const targetBranch = parts[2] || 'unknown';

  lines.push(`Repo:    ${projectName}`);
  lines.push(`Branch:  ${sourceBranch} → ${targetBranch}`);
  lines.push('═'.repeat(48));
  lines.push('');

  // 统计 blocking issues
  const blockingIssues = decision.issues.filter((issue) => {
    if (issue.is_closed) {
      return false;
    }
    if (!decision.allow_severity) {
      return true;
    }
    const severityLevel = SEVERITY_ORDER[issue.severity];
    const allowLevel = SEVERITY_ORDER[decision.allow_severity];
    return severityLevel > allowLevel;
  });

  const openIssues = decision.issues.filter((i) => !i.is_closed);

  lines.push(
    `Issues: ${blockingIssues.length} blocking / ${openIssues.length} open / ${decision.total_issues} total`,
  );

  if (decision.issues.length > 0) {
    lines.push('');

    // 排序：未关闭在前，然后按严重程度排序
    const sortedIssues = [...decision.issues].sort((a, b) => {
      // 未关闭的在前
      if (a.is_closed !== b.is_closed) {
        return a.is_closed ? 1 : -1;
      }
      // 按严重程度排序
      const aLevel = SEVERITY_ORDER[a.severity];
      const bLevel = SEVERITY_ORDER[b.severity];
      if (aLevel !== bLevel) {
        return bLevel - aLevel; // 高严重程度在前
      }
      return a.id.localeCompare(b.id);
    });

    for (const issue of sortedIssues) {
      const status = issue.is_closed ? 'CLOSED' : 'OPEN';
      const isIgnored =
        !issue.is_closed &&
        decision.allow_severity &&
        SEVERITY_ORDER[issue.severity] <=
          SEVERITY_ORDER[decision.allow_severity];

      const ignoredMark = isIgnored ? ' ← ignored' : '';

      lines.push(
        `  [${status.padStart(6)}]  ${issue.id.padEnd(10)}  ${issue.title.substring(0, 60)}${ignoredMark}`,
      );
    }
  }

  lines.push('');
  lines.push('');

  if (decision.can_merge) {
    lines.push(`Status: PASS | All blocking issues resolved. Safe to merge.`);
  } else {
    lines.push(
      `Status: BLOCKED | ${blockingIssues.length} blocking issue(s) must be resolved.`,
    );
  }

  return lines.join('\n');
}

/**
 * 格式化 JSON 输出
 */
export function formatJsonOutput(decision: MergeDecision): string {
  return JSON.stringify(decision, null, 2);
}
