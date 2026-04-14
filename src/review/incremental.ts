/**
 * 增量审查编排 - 合并新旧问题并同步 Issue
 * @see .SPEC/1-requirement/incremental-review.md §4
 */

import type {
  ValidatedIssue,
  ReviewReport,
  VerificationStatus,
  IssueOperation,
  FixVerificationResult,
} from '../types/index.js';
import { runAgents } from '../agents/orchestrator.js';
import { validateIssues } from '../agents/validator.js';
import { deduplicateIssues } from '../agents/deduplicator.js';
import { verifyFixes } from './fix-verifier.js';
import { findPreviousReport } from '../report/persistence.js';
import { createJiraPlugin } from '../plugins/jira.js';
import type { RuntimeConfig } from '../types/index.js';

/** 增量审查选项 */
export interface IncrementalReviewOptions {
  /** 仓库路径 */
  repoPath: string;
  /** 项目名称 */
  projectName: string;
  /** 源分支 */
  sourceRef: string;
  /** 目标分支 */
  targetRef: string;
  /** Diff 内容 */
  diffContent: string;
  /** Diff 结果（用于 Agent） */
  diffResult: import('../types/index.js').DiffResult;
  /** 要运行的 Agent 列表 */
  agents: Array<
    | 'security-reviewer'
    | 'logic-reviewer'
    | 'style-reviewer'
    | 'performance-reviewer'
  >;
  /** LLM 配置 */
  llmConfig?: {
    baseUrl?: string;
    authToken?: string;
    model?: string;
  };
  /** 运行时配置 */
  runtimeConfig: RuntimeConfig;
}

/**
 * 生成 correlation_id
 */
function getCorrelationId(
  projectName: string,
  sourceRef: string,
  targetRef: string,
): string {
  return `${projectName}:${sourceRef}:${targetRef}`;
}

/**
 * 构建同步操作列表
 */
function buildSyncOperations(
  newIssues: ValidatedIssue[],
  fixVerificationResults: FixVerificationResult[],
): IssueOperation[] {
  const operations: IssueOperation[] = [];

  // 1. 处理新发现的问题
  for (const issue of newIssues) {
    if (issue.validation_status === 'confirmed') {
      operations.push({
        type: 'create',
        issue,
      });
    }
  }

  // 2. 处理之前问题的验证结果
  for (const result of fixVerificationResults) {
    switch (result.status) {
      case 'fixed':
      case 'false_positive':
      case 'obsolete':
        operations.push({
          type: 'close',
          issue_id: result.original_issue_id,
          reason: getCloseReason(result.status),
          status: result.status,
        });
        break;

      case 'missed':
        // 需要更新 issue
        if (result.updated_issue) {
          operations.push({
            type: 'update',
            issue_id: result.original_issue_id,
            issue: {
              // 构造一个包含更新信息的 issue
              id: result.original_issue_id,
              file: '', // 从原始 issue 获取
              line_start: 0,
              line_end: 0,
              category: 'logic',
              severity: 'warning',
              title: result.updated_issue.title,
              description: result.updated_issue.description,
              suggestion: result.updated_issue.suggestion,
              confidence: 0.5,
              source_agent: 'fix-verifier',
              validation_status: 'confirmed',
              final_confidence: result.confidence,
              grounding_evidence: {
                checked_files: result.evidence.checked_files,
                checked_symbols: [],
                reasoning: result.evidence.reasoning,
              },
            } as ValidatedIssue & {
              file: string;
              line_start: number;
              line_end: number;
            },
          });
        }
        break;

      case 'uncertain':
        // 不操作
        break;
    }
  }

  return operations;
}

/**
 * 获取关闭原因
 */
function getCloseReason(status: VerificationStatus): string {
  switch (status) {
    case 'fixed':
      return '问题已在代码中修复';
    case 'false_positive':
      return '此问题为误报，实际不存在';
    case 'obsolete':
      return '相关文件已删除或代码已重构';
    default:
      return '未知原因';
  }
}

/**
 * 重试待同步的 issue
 */
async function retryPendingSync(
  pendingIssues: string[],
  previousReport: ReviewReport,
  runtimeConfig: RuntimeConfig,
  correlationId: string,
): Promise<{
  synced: string[];
  stillPending: string[];
  errors: Array<{ issueId: string; error: string }>;
}> {
  const synced: string[] = [];
  const stillPending: string[] = [];
  const errors: Array<{ issueId: string; error: string }> = [];

  if (pendingIssues.length === 0) {
    return { synced: [], stillPending: [], errors: [] };
  }

  // 检查重试次数
  const maxRetries = 3;
  const issuesToRetry: Array<{ issueId: string; retryCount: number }> = [];

  for (const issueId of pendingIssues) {
    const error = previousReport.issue_sync?.errors.find(
      (e) => e.issue_id === issueId,
    );
    const retryCount = error?.retry_count || 0;

    if (retryCount < maxRetries) {
      issuesToRetry.push({ issueId, retryCount: retryCount + 1 });
    } else {
      stillPending.push(issueId);
      errors.push({
        issueId,
        error: `超过最大重试次数 (${maxRetries})`,
      });
    }
  }

  if (issuesToRetry.length === 0) {
    return { synced, stillPending, errors };
  }

  // 查找原始 issue 并重试同步
  const plugin = createJiraPlugin();

  try {
    // 初始化插件
    const jiraConfig = runtimeConfig.global.jira;
    if (
      !jiraConfig?.url ||
      !jiraConfig.token ||
      !jiraConfig.email ||
      !jiraConfig.project
    ) {
      throw new Error('JIRA 配置不完整');
    }

    await plugin.initialize({
      connection: {
        url: jiraConfig.url,
        token: jiraConfig.token,
        email: jiraConfig.email,
        project: jiraConfig.project,
      },
    });

    // 构建重试操作
    const operations: IssueOperation[] = [];
    for (const { issueId } of issuesToRetry) {
      const issue = previousReport.issues.find((i) => i.id === issueId);
      if (issue && issue.validation_status === 'confirmed') {
        operations.push({ type: 'create', issue });
      }
    }

    if (operations.length > 0) {
      const syncResult = await plugin.sync({
        correlation_id: correlationId,
        operations,
      });

      for (const result of syncResult.results) {
        if (result.success) {
          synced.push(result.local_issue_id);
        } else {
          stillPending.push(result.local_issue_id);
          errors.push({
            issueId: result.local_issue_id,
            error: result.error || '未知错误',
          });
        }
      }
    }
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : '未知错误';
    for (const { issueId } of issuesToRetry) {
      errors.push({ issueId, error: errorMsg });
      stillPending.push(issueId);
    }
  }

  return { synced, stillPending, errors };
}

/**
 * 执行增量审查
 */
export async function runIncrementalReview(
  options: IncrementalReviewOptions,
): Promise<{
  report: ReviewReport;
  allIssues: ValidatedIssue[];
}> {
  const correlationId = getCorrelationId(
    options.projectName,
    options.sourceRef,
    options.targetRef,
  );

  const startTime = Date.now();
  let totalTokens = 0;

  // 1. 加载之前的审查报告
  const previousReport = findPreviousReport(options.repoPath, correlationId);
  const previousIssues = previousReport?.issues || [];

  // 2. 处理待同步的 issue（重试）
  let retrySynced: string[] = [];
  let retryErrors: Array<{ issueId: string; error: string }> = [];
  if (previousReport?.issue_sync?.pending.length) {
    const retryResult = await retryPendingSync(
      previousReport.issue_sync.pending,
      previousReport,
      options.runtimeConfig,
      correlationId,
    );
    retrySynced = retryResult.synced;
    retryErrors = retryResult.errors;
  }

  // 3. 如果有之前的问题，运行修复验证
  let fixVerification;
  if (previousIssues.length > 0) {
    fixVerification = await verifyFixes(
      previousIssues,
      options.diffContent,
      [], // 新问题在后面发现，这里先传空
      {
        repoPath: options.repoPath,
        llmConfig: options.llmConfig,
      },
    );
    totalTokens += fixVerification.tokens_used;
  }

  // 4. 运行 Agent 发现新问题
  const agentResults = await runAgents({
    diffResult: options.diffResult,
    agents: options.agents,
    llmConfig: options.llmConfig,
  });

  // 5. 验证新发现的问题
  const rawIssues = agentResults.flatMap((r) => r.issues);
  const newValidatedIssues = await validateIssues(
    rawIssues as Array<{
      id: string;
      file: string;
      line_start: number;
      line_end: number;
      title: string;
      description: string;
      category: string;
      severity: string;
      code_snippet?: string;
    }>,
    {
      repoPath: options.repoPath,
      diffContent: options.diffContent,
    },
  );

  // 6. 去重
  const deduplicationResult = deduplicateIssues(
    newValidatedIssues as unknown as Array<Record<string, unknown>>,
  );
  const allNewIssues =
    deduplicationResult.uniqueIssues as unknown as ValidatedIssue[];

  // 7. 合并新旧问题
  const allIssues: ValidatedIssue[] = [];
  const keptPreviousIssueIds = new Set<string>();

  if (fixVerification) {
    for (const result of fixVerification.results) {
      if (result.status === 'missed') {
        // 未修复的问题需要保留
        const originalIssue = previousIssues.find(
          (i) => i.id === result.original_issue_id,
        );
        if (originalIssue) {
          // 如果有更新信息，更新 issue
          if (result.updated_issue) {
            allIssues.push({
              ...originalIssue,
              title: result.updated_issue.title,
              description: result.updated_issue.description,
              suggestion: result.updated_issue.suggestion,
            });
          } else {
            allIssues.push(originalIssue);
          }
          keptPreviousIssueIds.add(originalIssue.id);
        }
      }
      // fixed, false_positive, obsolete 的问题不保留
    }
  }

  // 添加新问题
  for (const newIssue of allNewIssues) {
    // 检查是否与保留的旧问题重复
    const isDuplicate = allIssues.some(
      (existing) =>
        existing.file === newIssue.file &&
        Math.abs(existing.line_start - newIssue.line_start) < 10 &&
        existing.category === newIssue.category,
    );

    if (!isDuplicate) {
      allIssues.push(newIssue);
    }
  }

  // 8. 构建同步操作
  const syncOperations = buildSyncOperations(
    allNewIssues,
    fixVerification?.results || [],
  );

  // 9. 执行同步
  let syncResult: {
    synced: string[];
    pending: string[];
    errors: Array<{
      plugin: string;
      issue_id: string;
      error: string;
      retry_count: number;
    }>;
  } = {
    synced: [...retrySynced],
    pending: [],
    errors: retryErrors.map((e) => ({
      plugin: 'jira',
      issue_id: e.issueId,
      error: e.error,
      retry_count: 1,
    })),
  };

  if (syncOperations.length > 0) {
    const plugin = createJiraPlugin();

    try {
      const jiraConfig = options.runtimeConfig.global.jira;
      if (
        jiraConfig?.url &&
        jiraConfig.token &&
        jiraConfig.email &&
        jiraConfig.project
      ) {
        await plugin.initialize({
          connection: {
            url: jiraConfig.url,
            token: jiraConfig.token,
            email: jiraConfig.email,
            project: jiraConfig.project,
          },
        });

        const result = await plugin.sync({
          correlation_id: correlationId,
          operations: syncOperations,
        });

        for (const r of result.results) {
          if (r.success) {
            syncResult.synced.push(r.local_issue_id);
          } else {
            syncResult.pending.push(r.local_issue_id);
            syncResult.errors.push({
              plugin: 'jira',
              issue_id: r.local_issue_id,
              error: r.error || '未知错误',
              retry_count: 0,
            });
          }
        }
      }
    } catch (error) {
      // 同步失败不影响审查结果
      console.warn('Issue 同步失败:', error);
    }
  }

  // 10. 生成报告
  const elapsed_ms = Date.now() - startTime;

  const report: ReviewReport = {
    summary: generateSummary(allIssues, fixVerification),
    risk_level: calculateRiskLevel(allIssues),
    issues: allIssues,
    checklist: [], // TODO: 生成检查清单
    metrics: {
      total_scanned: rawIssues.length,
      confirmed: allIssues.filter((i) => i.validation_status === 'confirmed')
        .length,
      rejected: allIssues.filter((i) => i.validation_status === 'rejected')
        .length,
      uncertain: allIssues.filter((i) => i.validation_status === 'uncertain')
        .length,
      by_severity: {
        critical: allIssues.filter((i) => i.severity === 'critical').length,
        error: allIssues.filter((i) => i.severity === 'error').length,
        warning: allIssues.filter((i) => i.severity === 'warning').length,
        suggestion: allIssues.filter((i) => i.severity === 'suggestion').length,
      },
      by_category: {
        security: allIssues.filter((i) => i.category === 'security').length,
        logic: allIssues.filter((i) => i.category === 'logic').length,
        performance: allIssues.filter((i) => i.category === 'performance')
          .length,
        style: allIssues.filter((i) => i.category === 'style').length,
      },
      files_reviewed: options.diffResult.files.length,
    },
    metadata: {
      correlation_id: correlationId,
      timestamp: new Date().toISOString(),
      source_ref: options.sourceRef,
      target_ref: options.targetRef,
      repo_path: options.repoPath,
      project_name: options.projectName,
      agents_used: options.agents,
      review_time_ms: elapsed_ms,
      tokens_used: totalTokens,
      is_incremental: previousIssues.length > 0,
      models: {
        agent_model: options.llmConfig?.model || 'claude-sonnet-4-5-20250929',
      },
    },
    fix_verification: fixVerification,
    issue_sync: {
      status: syncResult.pending.length === 0 ? 'success' : 'partial',
      synced: syncResult.synced,
      pending: syncResult.pending,
      errors: syncResult.errors,
    },
  };

  return { report, allIssues };
}

/**
 * 生成审查摘要
 */
function generateSummary(
  issues: ValidatedIssue[],
  fixVerification?: import('../types/index.js').FixVerificationSummary,
): string {
  const lines: string[] = [];

  const confirmedIssues = issues.filter(
    (i) => i.validation_status === 'confirmed',
  );

  if (fixVerification) {
    lines.push(`## 增量审查结果`);
    lines.push(`- 已验证问题: ${fixVerification.total_verified} 个`);
    lines.push(`- 已修复: ${fixVerification.by_status.fixed} 个`);
    lines.push(`- 未修复: ${fixVerification.by_status.missed} 个`);
    lines.push(`- 误报: ${fixVerification.by_status.false_positive} 个`);
    lines.push(`- 过时: ${fixVerification.by_status.obsolete} 个`);
    lines.push('');
  }

  lines.push(`## 发现的问题`);
  lines.push(`- 总计: ${confirmedIssues.length} 个已确认问题`);

  if (confirmedIssues.length > 0) {
    const criticalCount = confirmedIssues.filter(
      (i) => i.severity === 'critical',
    ).length;
    const errorCount = confirmedIssues.filter(
      (i) => i.severity === 'error',
    ).length;

    if (criticalCount > 0) {
      lines.push(`- **严重问题: ${criticalCount} 个** (需要立即修复)`);
    }
    if (errorCount > 0) {
      lines.push(`- **错误: ${errorCount} 个** (建议修复)`);
    }
  }

  return lines.join('\n');
}

/**
 * 计算风险等级
 */
function calculateRiskLevel(
  issues: ValidatedIssue[],
): 'high' | 'medium' | 'low' {
  const confirmedIssues = issues.filter(
    (i) => i.validation_status === 'confirmed',
  );

  const criticalCount = confirmedIssues.filter(
    (i) => i.severity === 'critical',
  ).length;
  const errorCount = confirmedIssues.filter(
    (i) => i.severity === 'error',
  ).length;

  if (criticalCount > 0 || errorCount >= 5) {
    return 'high';
  }
  if (errorCount > 0 || confirmedIssues.length >= 10) {
    return 'medium';
  }
  return 'low';
}
