/**
 * 统一导出所有类型
 */

// Core types
export type {
  Severity,
  IssueCategory,
  ValidationStatus,
  VerificationStatus,
  FileCategory,
  AgentType,
  RiskLevel,
  IssueSyncStatusType,
  TriggerMode,
  OutputLanguage,
} from './core.js';

export {
  BUILTIN_AGENTS,
  VALIDATOR_AGENT,
  FIX_VERIFIER_AGENT,
  SEVERITY_ORDER,
  DEFAULT_SEVERITY_TO_JIRA_PRIORITY,
  DEFAULT_CONFIG,
  ENV_PREFIX,
  ENV_MAPPING,
} from './core.js';

// Issue types
export type {
  SymbolLookup,
  ValidatedIssue,
  FixVerificationResult,
  FixVerificationSummary,
} from './issue.js';

// Report types
export type {
  ChecklistItem,
  ReviewMetrics,
  ReviewMetadata,
  SyncError,
  IssueSyncStatus,
  ReviewReport,
  MergeDecision,
} from './report.js';

// Plugin types
export type {
  IssueOperation,
  SyncContext,
  OperationResult,
  SyncResult,
  RemoteIssue,
  IssueStatusResult,
  PluginConfig,
  IssuePlugin,
} from './plugin.js';

// Git types
export type {
  RefType,
  DiffStrategy,
  DiffHunk,
  DiffFile,
  DiffOptions,
  DiffResult,
  WorktreeInfo,
  WorktreeOptions,
} from './git.js';

// Agent types
export type {
  TriggerRules,
  AgentLlmConfig,
  AgentOutputConfig,
  BuiltinAgentDefinition,
  CustomAgentDefinition,
  AgentSelection,
  AgentRunResult,
  DeduplicationResult,
} from './agent.js';

// Config types
export type {
  GlobalConfig,
  ProjectConfig,
  ConfigSource,
  RuntimeConfig,
} from './config.js';
