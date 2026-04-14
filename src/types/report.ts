/**
 * 审查报告类型
 * @see .SPEC/1-requirement/review.md §3.1
 * @see .SPEC/1-requirement/merge-decision.md §5
 */
import type {
  Severity,
  IssueCategory,
  RiskLevel,
  IssueSyncStatusType,
} from './core.js';
import type { ValidatedIssue, FixVerificationSummary } from './issue.js';

/** 检查清单项 */
export interface ChecklistItem {
  /** 清单项 ID（如 "sec-chk-01"） */
  id: string;
  /** 对应的问题类别 */
  category: IssueCategory;
  /** 检查问题 */
  question: string;
  /** 检查结果 */
  result: 'pass' | 'fail';
  /** 详细说明 */
  details?: string;
  /** 关联的 issue ID */
  related_issues?: string[];
}

/** 审查统计指标 */
export interface ReviewMetrics {
  /** 验证前的问题总数 */
  total_scanned: number;
  /** 确认的问题数 */
  confirmed: number;
  /** 拒绝的问题数 */
  rejected: number;
  /** 不确定的问题数 */
  uncertain: number;
  /** 按严重程度分布 */
  by_severity: Record<Severity, number>;
  /** 按类别分布 */
  by_category: Record<IssueCategory, number>;
  /** 审查的文件数 */
  files_reviewed: number;
}

/** 审查元数据 */
export interface ReviewMetadata {
  /** 关联标识 */
  correlation_id: string;
  /** 审查时间（ISO 8601） */
  timestamp: string;
  /** 审查分支 */
  source_ref: string;
  /** 基准分支 */
  target_ref: string;
  /** 项目路径 */
  repo_path: string;
  /** 项目名称 */
  project_name: string;
  /** 使用的 Agent 列表 */
  agents_used: string[];
  /** 审查耗时（毫秒） */
  review_time_ms: number;
  /** Token 消耗总量 */
  tokens_used: number;
  /** 是否为增量审查 */
  is_incremental: boolean;
  /** LLM 模型信息 */
  models: {
    agent_model: string;
    light_model?: string;
  };
}

/** 同步错误记录 */
export interface SyncError {
  /** 插件名称 */
  plugin: string;
  /** 问题 ID */
  issue_id: string;
  /** 错误信息 */
  error: string;
  /** 已重试次数 */
  retry_count: number;
}

/** Issue 同步状态 */
export interface IssueSyncStatus {
  /** 同步总体状态 */
  status: IssueSyncStatusType;
  /** 已同步成功的 issue ID */
  synced: string[];
  /** 未同步的 issue ID（下次增量 review 时重试） */
  pending: string[];
  /** 失败详情 */
  errors: SyncError[];
}

/** 审查报告（完整输出） */
export interface ReviewReport {
  /** 审查摘要 */
  summary: string;
  /** 风险等级 */
  risk_level: RiskLevel;
  /** 已验证的问题列表 */
  issues: ValidatedIssue[];
  /** 检查清单结果 */
  checklist: ChecklistItem[];
  /** 审查统计指标 */
  metrics: ReviewMetrics;
  /** 审查元数据 */
  metadata: ReviewMetadata;
  /** 修复验证结果（增量审查时） */
  fix_verification?: FixVerificationSummary;
  /** Issue 同步状态 */
  issue_sync?: IssueSyncStatus;
}

/** 合并决策（status 命令输出） */
export interface MergeDecision {
  /** 关联标识 */
  correlation_id: string;
  /** 是否可以合并 */
  can_merge: boolean;
  /** 未关闭的 issue 数量 */
  open_issues: number;
  /** 总 issue 数量 */
  total_issues: number;
  /** 允许的最高严重程度 */
  allow_severity?: Severity;
  /** issue 列表（含状态） */
  issues: Array<{
    id: string;
    is_closed: boolean;
    severity: Severity;
    title: string;
    remote_id?: string;
  }>;
}
