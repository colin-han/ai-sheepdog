/**
 * 基础枚举和原子类型
 * @see .SPEC/0-overall/glossary.md
 */

/** 问题严重程度（从高到低） */
export type Severity = 'critical' | 'error' | 'warning' | 'suggestion';

/** 问题类别 */
export type IssueCategory = 'security' | 'logic' | 'performance' | 'style';

/** 验证状态 — validator Agent 的判断结果 */
export type ValidationStatus = 'confirmed' | 'rejected' | 'uncertain';

/** 修复状态 — fix-verifier Agent 的判断结果 */
export type VerificationStatus =
  | 'fixed'
  | 'missed'
  | 'false_positive'
  | 'obsolete'
  | 'uncertain';

/** 文件分类 */
export type FileCategory =
  | 'source'
  | 'config'
  | 'data'
  | 'asset'
  | 'lock'
  | 'generated';

/** 内置 Agent 类型 */
export type AgentType =
  | 'security-reviewer'
  | 'logic-reviewer'
  | 'style-reviewer'
  | 'performance-reviewer'
  | 'validator'
  | 'fix-verifier';

/** 风险等级 */
export type RiskLevel = 'high' | 'medium' | 'low';

/** Issue 同步状态 */
export type IssueSyncStatusType = 'success' | 'partial' | 'failed';

/** 自定义 Agent 触发模式 */
export type TriggerMode = 'rule' | 'llm';

/** 输出语言 */
export type OutputLanguage = 'zh' | 'en';

/** 内置 Agent 名称列表 */
export const BUILTIN_AGENTS: readonly string[] = [
  'security-reviewer',
  'logic-reviewer',
  'style-reviewer',
  'performance-reviewer',
] as const;

/** 特殊 Agent 名称 */
export const VALIDATOR_AGENT = 'validator' as const;
export const FIX_VERIFIER_AGENT = 'fix-verifier' as const;

/** 严重程度排序（从高到低） */
export const SEVERITY_ORDER: Record<Severity, number> = {
  critical: 4,
  error: 3,
  warning: 2,
  suggestion: 1,
} as const;

/** 默认 severity → JIRA priority 映射 */
export const DEFAULT_SEVERITY_TO_JIRA_PRIORITY: Record<Severity, string> = {
  critical: 'Highest',
  error: 'High',
  warning: 'Medium',
  suggestion: 'Low',
} as const;

/** 默认配置值 */
export const DEFAULT_CONFIG = {
  'worktree-dir': '~/.cache/sheepdog/worktrees',
  model: 'claude-sonnet-4-5-20250929',
  'agent-model': 'claude-sonnet-4-5-20250929',
  'light-model': 'claude-haiku-4-5-20251001',
} as const;

/** 环境变量前缀 */
export const ENV_PREFIX = 'SHEEPDOG_' as const;

/** 环境变量映射 */
export const ENV_MAPPING: Record<string, string> = {
  SHEEPDOG_JIRA_URL: 'jira.url',
  SHEEPDOG_JIRA_TOKEN: 'jira.token',
  SHEEPDOG_JIRA_EMAIL: 'jira.email',
  SHEEPDOG_JIRA_PROJECT: 'jira.project',
  SHEEPDOG_GITLAB_URL: 'gitlab.url',
  SHEEPDOG_GITLAB_TOKEN: 'gitlab.token',
  SHEEPDOG_MODEL: 'model',
  SHEEPDOG_AGENT_MODEL: 'agent-model',
  SHEEPDOG_LIGHT_MODEL: 'light-model',
  SHEEPDOG_WORKTREE_DIR: 'worktree-dir',
  SHEEPDOG_STATUS_ALLOW_SEVERITY: 'status.allow-severity',
} as const;
