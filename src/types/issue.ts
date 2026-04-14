/**
 * 问题相关类型
 * @see .SPEC/1-requirement/review.md §3.2
 * @see .SPEC/1-requirement/incremental-review.md §3
 */
import type {
  Severity,
  IssueCategory,
  ValidationStatus,
  VerificationStatus,
  AgentType,
} from './core.js';

/** 符号查找记录 */
export interface SymbolLookup {
  /** 符号名称（函数名、变量名、类名等） */
  name: string;
  /** 符号所在文件 */
  file: string;
  /** 符号所在行号 */
  line: number;
}

/** 已验证问题（核心数据结构） */
export interface ValidatedIssue {
  /** 唯一标识（如 "sec-001"） */
  id: string;
  /** 文件路径 */
  file: string;
  /** 起始行号 */
  line_start: number;
  /** 结束行号 */
  line_end: number;
  /** 问题类别 */
  category: IssueCategory;
  /** 严重程度 */
  severity: Severity;
  /** 问题标题 */
  title: string;
  /** 详细描述 */
  description: string;
  /** 修复建议 */
  suggestion?: string;
  /** 问题代码片段 */
  code_snippet?: string;
  /** 初始置信度 (0-1) */
  confidence: number;
  /** 来源 Agent */
  source_agent: AgentType | string;

  // 验证后字段
  /** 验证状态 */
  validation_status: ValidationStatus;
  /** 验证后置信度 (0-1) */
  final_confidence: number;
  /** 验证依据 */
  grounding_evidence: {
    checked_files: string[];
    checked_symbols: SymbolLookup[];
    reasoning: string;
  };

  // Issue 同步字段
  /** 远程系统中的 ID（如 JIRA issue key "PROJ-123"），同步成功后填充 */
  remote_id?: string;
}

/** 修复验证结果（单个 issue） */
export interface FixVerificationResult {
  /** 原始 issue ID */
  original_issue_id: string;
  /** 验证状态 */
  status: VerificationStatus;
  /** 置信度 */
  confidence: number;
  /** 验证依据 */
  evidence: {
    checked_files: string[];
    examined_code: string[];
    related_changes: string;
    reasoning: string;
  };
  /** 更新后的问题信息（仅 status=missed 时） */
  updated_issue?: {
    title: string;
    description: string;
    suggestion: string;
  };
  /** 误报原因（仅 status=false_positive 时） */
  false_positive_reason?: string;
}

/** 修复验证摘要 */
export interface FixVerificationSummary {
  /** 验证的问题总数 */
  total_verified: number;
  /** 按状态统计 */
  by_status: Record<VerificationStatus, number>;
  /** 详细的验证结果 */
  results: FixVerificationResult[];
  /** 验证耗时（毫秒） */
  verification_time_ms: number;
  /** Token 消耗量 */
  tokens_used: number;
}
