# 共享类型定义

> 本文档定义了 AI Sheepdog 项目中所有模块共享的 TypeScript 类型/接口。
> 类型名称严格遵循 [glossary.md](../0-overall/glossary.md) 中的命名规范。
> 每个类型标注了**来源设计文档**，便于对照 review。

---

## 目录结构

```
src/types/
├── core.ts       # 基础枚举和原子类型
├── issue.ts      # 问题相关类型（ValidatedIssue、修复验证）
├── report.ts     # 审查报告类型（ReviewReport、Metrics）
├── plugin.ts     # Issue 插件类型（IssuePlugin、SyncContext）
├── git.ts        # Git 操作类型（Diff、Worktree）
├── agent.ts      # Agent 系统类型（Agent 定义、选择、去重）
├── config.ts     # 配置类型
└── index.ts      # 统一导出
```

---

## 1. core.ts — 基础枚举和原子类型

> 来源：glossary.md

```typescript
/** 问题严重程度（从高到低） */
type Severity = 'critical' | 'error' | 'warning' | 'suggestion';

/** 问题类别 */
type IssueCategory = 'security' | 'logic' | 'performance' | 'style';

/** 验证状态 — validator Agent 的判断结果 */
type ValidationStatus = 'confirmed' | 'rejected' | 'uncertain';

/** 修复状态 — fix-verifier Agent 的判断结果 */
type VerificationStatus = 'fixed' | 'missed' | 'false_positive' | 'obsolete' | 'uncertain';

/** 文件分类 */
type FileCategory = 'source' | 'config' | 'data' | 'asset' | 'lock' | 'generated';

/** 内置 Agent 类型 */
type AgentType =
  | 'security-reviewer'
  | 'logic-reviewer'
  | 'style-reviewer'
  | 'performance-reviewer'
  | 'validator'
  | 'fix-verifier';

/** 风险等级 */
type RiskLevel = 'high' | 'medium' | 'low';

/** Issue 同步状态 */
type IssueSyncStatusType = 'success' | 'partial' | 'failed';

/** 自定义 Agent 触发模式 */
type TriggerMode = 'rule' | 'llm';

/** 输出语言 */
type OutputLanguage = 'zh' | 'en';
```

---

## 2. issue.ts — 问题相关类型

> 来源：1-requirement/review.md §3.2, 1-requirement/incremental-review.md §3

```typescript
import type {
  Severity,
  IssueCategory,
  ValidationStatus,
  VerificationStatus,
  AgentType,
} from './core';

/** 符号查找记录 */
interface SymbolLookup {
  /** 符号名称（函数名、变量名、类名等） */
  name: string;
  /** 符号所在文件 */
  file: string;
  /** 符号所在行号 */
  line: number;
}

/** 已验证问题（核心数据结构） */
interface ValidatedIssue {
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
  source_agent: AgentType | string; // string 支持自定义 Agent

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
interface FixVerificationResult {
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
interface FixVerificationSummary {
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
```

---

## 3. report.ts — 审查报告类型

> 来源：1-requirement/review.md §3.1, 1-requirement/merge-decision.md §5

```typescript
import type {
  Severity,
  IssueCategory,
  RiskLevel,
  IssueSyncStatusType,
} from './core';
import type { ValidatedIssue, FixVerificationSummary } from './issue';

/** 检查清单项 */
interface ChecklistItem {
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
interface ReviewMetrics {
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
interface ReviewMetadata {
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

/** Issue 同步状态 */
interface IssueSyncStatus {
  /** 同步总体状态 */
  status: IssueSyncStatusType;
  /** 已同步成功的 issue ID */
  synced: string[];
  /** 未同步的 issue ID（下次增量 review 时重试） */
  pending: string[];
  /** 失败详情 */
  errors: SyncError[];
}

/** 同步错误记录 */
interface SyncError {
  /** 插件名称 */
  plugin: string;
  /** 问题 ID */
  issue_id: string;
  /** 错误信息 */
  error: string;
  /** 已重试次数 */
  retry_count: number;
}

/** 审查报告（完整输出） */
interface ReviewReport {
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
interface MergeDecision {
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
```

---

## 4. plugin.ts — Issue 插件类型

> 来源：2-design/issue-plugin.md §2-5

```typescript
import type { Severity, VerificationStatus } from './core';
import type { ValidatedIssue } from './issue';

/** Issue 操作（联合类型） */
type IssueOperation =
  | { type: 'create'; issue: ValidatedIssue }
  | { type: 'close'; issue_id: string; reason: string; status: VerificationStatus }
  | { type: 'update'; issue_id: string; issue: ValidatedIssue };

/** 同步上下文（插件输入） */
interface SyncContext {
  /** 关联标识：项目名称 + reviewBranch + baseBranch */
  correlation_id: string;
  /** 本次同步的问题操作列表 */
  operations: IssueOperation[];
}

/** 操作结果 */
interface OperationResult {
  /** 对应的本地 issue ID */
  local_issue_id: string;
  /** 远程系统的 issue ID（如 JIRA issue key） */
  remote_issue_id?: string;
  /** 操作类型 */
  operation: IssueOperation['type'];
  /** 是否成功 */
  success: boolean;
  /** 错误信息 */
  error?: string;
}

/** 同步结果（插件输出） */
interface SyncResult {
  /** 操作结果列表 */
  results: OperationResult[];
  /** 是否全部成功 */
  success: boolean;
  /** 错误信息 */
  errors?: string[];
}

/** 远程 issue 信息 */
interface RemoteIssue {
  /** 远程系统中的 issue ID */
  remote_id: string;
  /** 本地 issue ID */
  local_id: string;
  /** 是否已关闭 */
  is_closed: boolean;
  /** 远程系统中的状态 */
  remote_status: string;
  /** 标题 */
  title: string;
}

/** Issue 状态查询结果（CI Gate 使用） */
interface IssueStatusResult {
  /** 关联标识 */
  correlation_id: string;
  /** 关联的所有 issue */
  issues: RemoteIssue[];
  /** 是否全部关闭 */
  all_closed: boolean;
  /** 未关闭的 issue 数量 */
  open_count: number;
}

/** 插件配置 */
interface PluginConfig {
  /** 远程系统连接配置 */
  connection: Record<string, string>;
  /** severity → issue priority 映射 */
  severity_mapping?: Record<Severity, string>;
  /** 关联标识前缀 */
  correlation_prefix?: string;
}

/** Issue 插件接口 */
interface IssuePlugin {
  /** 插件名称 */
  name: string;

  /** 初始化配置 */
  initialize(config: PluginConfig): Promise<void>;

  /**
   * 批量同步问题到 issue management system
   */
  sync(context: SyncContext): Promise<SyncResult>;

  /**
   * 查询关联的 issue 状态（用于 CI Gate）
   */
  getStatus(correlationId: string): Promise<IssueStatusResult>;
}
```

---

## 5. git.ts — Git 操作类型

> 来源：1-requirement/review.md §5.1, 0-overall/glossary.md

```typescript
import type { FileCategory } from './core';

/** Ref 类型 */
type RefType = 'branch' | 'commit';

/** Diff 策略 */
type DiffStrategy = 'three-dot' | 'two-dot';

/** Diff 中的一个 hunk（变更块） */
interface DiffHunk {
  /** 在旧文件中的起始行号 */
  old_start: number;
  /** 在旧文件中的行数 */
  old_count: number;
  /** 在新文件中的起始行号 */
  new_start: number;
  /** 在新文件中的行数 */
  new_count: number;
  /** 变更内容 */
  content: string;
}

/** Diff 中的单个文件 */
interface DiffFile {
  /** 文件路径 */
  path: string;
  /** 旧文件路径（重命名时） */
  old_path?: string;
  /** 变更类型 */
  change_type: 'added' | 'modified' | 'deleted' | 'renamed';
  /** 文件分类 */
  category: FileCategory;
  /** 是否为纯空白变更 */
  is_whitespace_only: boolean;
  /** 变更的 hunks */
  hunks: DiffHunk[];
  /** 文件完整 diff 内容 */
  diff_content: string;
}

/** Diff 获取选项 */
interface DiffOptions {
  /** 仓库路径 */
  repo_path: string;
  /** 审查分支 */
  source_ref: string;
  /** 基准分支 */
  target_ref: string;
}

/** Diff 结果 */
interface DiffResult {
  /** 解析后的文件列表 */
  files: DiffFile[];
  /** 原始 diff 输出 */
  raw_diff: string;
  /** 使用的 diff 策略 */
  strategy: DiffStrategy;
  /** ref 类型 */
  ref_type: RefType;
}

/** Worktree 信息 */
interface WorktreeInfo {
  /** worktree 路径 */
  path: string;
  /** 关联的分支或 commit */
  ref: string;
  /** 创建时间 */
  created_at: Date;
  /** 是否为复用 */
  reused: boolean;
}

/** Worktree 管理选项 */
interface WorktreeOptions {
  /** 仓库路径 */
  repo_path: string;
  /** 审查分支 */
  ref: string;
  /** worktree 存储根目录 */
  worktree_dir?: string;
}
```

---

## 6. agent.ts — Agent 系统类型

> 来源：2-design/customization.md §3, 1-requirement/review.md §5.2

```typescript
import type { IssueCategory, Severity, TriggerMode, AgentType } from './core';
import type { DiffFile } from './git';

/** 触发规则条件 */
interface TriggerRules {
  /** 文件匹配模式（glob） */
  files?: string[];
  /** 排除文件模式 */
  exclude_files?: string[];
  /** 内容正则匹配（任一匹配即触发） */
  content_patterns?: string[];
  /** 最少匹配文件数 */
  min_files?: number;
  /** 匹配模式 */
  match_mode?: 'all' | 'any';
}

/** Agent LLM 配置 */
interface AgentLlmConfig {
  /** API 地址 */
  base_url?: string;
  /** 认证 token（支持 ${ENV_VAR} 环境变量引用） */
  auth_token?: string;
  /** 模型名称 */
  model?: string;
}

/** Agent 输出配置 */
interface AgentOutputConfig {
  /** 默认问题类别 */
  category: IssueCategory;
  /** 默认严重程度 */
  default_severity: Severity;
  /** 严重程度权重 (0-2) */
  severity_weight?: number;
}

/** 内置 Agent 定义 */
interface BuiltinAgentDefinition {
  /** Agent 类型标识 */
  name: AgentType;
  /** 描述 */
  description: string;
  /** 可用工具列表 */
  tools: string[];
  /** 模型 */
  model: string;
  /** 系统提示词 */
  prompt: string;
}

/** 自定义 Agent 定义（从 .sheepdog/agents/*.md 加载） */
interface CustomAgentDefinition {
  /** Agent 名称 */
  name: string;
  /** 描述 */
  description: string;
  /** 触发模式 */
  trigger_mode: TriggerMode;
  /** 规则触发条件（trigger_mode=rule 时使用） */
  triggers?: TriggerRules;
  /** LLM 触发判断提示词（trigger_mode=llm 时使用） */
  trigger_prompt?: string;
  /** Agent LLM 配置（可选，未设置时使用全局配置） */
  llm?: AgentLlmConfig;
  /** 输出配置 */
  output: AgentOutputConfig;
  /** 是否启用 */
  enabled: boolean;
  /** 标签 */
  tags?: string[];
  /** Markdown 正文作为系统提示词 */
  prompt: string;
  /** 来源文件路径 */
  source_file: string;
}

/** Agent 选择结果 */
interface AgentSelection {
  /** 被选中的内置 Agent */
  builtin_agents: AgentType[];
  /** 被选中的自定义 Agent */
  custom_agents: CustomAgentDefinition[];
  /** 选择原因（调试用） */
  reasons: Record<string, string>;
}

/** Agent 运行结果 */
interface AgentRunResult {
  /** Agent 名称 */
  agent_name: string;
  /** 发现的问题（JSON 输出） */
  issues: Array<Record<string, unknown>>;
  /** 检查清单结果 */
  checklist: Array<Record<string, unknown>>;
  /** 运行耗时（毫秒） */
  elapsed_ms: number;
  /** 是否成功 */
  success: boolean;
  /** 错误信息 */
  error?: string;
}

/** 去重结果 */
interface DeduplicationResult {
  /** 去重后的 issue 列表 */
  issues: Array<Record<string, unknown>>;
  /** 被合并的重复 issue 数量 */
  duplicates_removed: number;
}
```

---

## 7. config.ts — 配置类型

> 来源：2-design/cli.md §5.2, 2-design/customization.md §5

```typescript
import type { Severity, OutputLanguage } from './core';

/** 全局配置结构 */
interface GlobalConfig {
  /** JIRA 配置 */
  jira?: {
    url?: string;
    token?: string;
    email?: string;
    project?: string;
  };
  /** GitLab 配置 */
  gitlab?: {
    url?: string;
    token?: string;
  };
  /** 共享默认模型 */
  model?: string;
  /** Agent 审查模型 */
  'agent-model'?: string;
  /** 轻量模型（选择器、去重） */
  'light-model'?: string;
  /** Worktree 存储目录 */
  'worktree-dir'?: string;
  /** Status 默认允许的最高严重程度 */
  status?: {
    'allow-severity'?: Severity;
  };
}

/** 项目配置结构（.sheepdog/config.yaml） */
interface ProjectConfig {
  /** 项目名称 */
  project_name?: string;
  /** 审查语言 */
  language?: OutputLanguage;
  /** 忽略文件模式 */
  ignore_patterns?: string[];
  /** 严重程度覆盖 */
  severity_overrides?: Record<string, Severity>;
  /** Agent 启用/禁用 */
  agents?: Record<string, boolean>;
  /** Status 配置 */
  status?: {
    allow_severity?: Severity;
  };
}

/** 配置来源（用于调试） */
interface ConfigSource {
  /** 配置键 */
  key: string;
  /** 配置值 */
  value: string;
  /** 来源：env / global / project / default */
  source: 'env' | 'global' | 'project' | 'default';
}

/** 合并后的运行时配置 */
interface RuntimeConfig {
  /** 全局配置 */
  global: GlobalConfig;
  /** 项目配置 */
  project: ProjectConfig;
  /** 配置解析来源（调试用） */
  sources: ConfigSource[];
}
```

---

## 8. 常量定义

```typescript
/** 内置 Agent 名称列表 */
const BUILTIN_AGENTS: readonly string[] = [
  'security-reviewer',
  'logic-reviewer',
  'style-reviewer',
  'performance-reviewer',
] as const;

/** 特殊 Agent 名称 */
const VALIDATOR_AGENT = 'validator' as const;
const FIX_VERIFIER_AGENT = 'fix-verifier' as const;

/** 严重程度排序（从高到低） */
const SEVERITY_ORDER: Record<Severity, number> = {
  critical: 4,
  error: 3,
  warning: 2,
  suggestion: 1,
} as const;

/** 默认 severity → JIRA priority 映射 */
const DEFAULT_SEVERITY_TO_JIRA_PRIORITY: Record<Severity, string> = {
  critical: 'Highest',
  error: 'High',
  warning: 'Medium',
  suggestion: 'Low',
} as const;

/** 默认配置值 */
const DEFAULT_CONFIG = {
  'worktree-dir': '~/.cache/sheepdog/worktrees',
  'model': 'claude-sonnet-4-5-20250929',
  'agent-model': 'claude-sonnet-4-5-20250929',
  'light-model': 'claude-haiku-4-5-20251001',
} as const;

/** 环境变量前缀 */
const ENV_PREFIX = 'SHEEPDOG_' as const;

/** 环境变量映射 */
const ENV_MAPPING: Record<string, string> = {
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
```

---

## 类型依赖关系图

```
core.ts（无依赖）
  ├── issue.ts
  │     └── report.ts
  │           └── MergeDecision
  ├── git.ts
  ├── agent.ts ── git.ts
  ├── plugin.ts ── issue.ts, core.ts
  └── config.ts ── core.ts
```

无循环依赖。所有类型最终依赖 `core.ts` 中的基础枚举。

---

## 与设计文档的映射表

| TypeScript 类型 | 来源设计文档 |
|----------------|-------------|
| `Severity` | glossary.md — 严重程度 |
| `IssueCategory` | glossary.md — 问题类别 |
| `ValidationStatus` | glossary.md — 验证状态 |
| `VerificationStatus` | glossary.md — 修复状态 |
| `FileCategory` | glossary.md — 文件分类 |
| `AgentType` | glossary.md — 内置 Agent |
| `ValidatedIssue` | review.md §3.2 |
| `SymbolLookup` | review.md §3.2 grounding_evidence |
| `ReviewReport` | review.md §3.1 |
| `ReviewMetrics` | review.md §3.3 |
| `ReviewMetadata` | review.md §3.1 (metadata) |
| `ChecklistItem` | review.md §3.1 (checklist) |
| `FixVerificationResult` | incremental-review.md §3 |
| `FixVerificationSummary` | incremental-review.md §3 |
| `MergeDecision` | merge-decision.md §5 (JSON 输出) |
| `IssuePlugin` | issue-plugin.md §2 |
| `SyncContext` | issue-plugin.md §3.1 |
| `SyncResult` | issue-plugin.md §3.2 |
| `OperationResult` | issue-plugin.md §3.2 |
| `IssueOperation` | issue-plugin.md §3.1 |
| `IssueStatusResult` | issue-plugin.md §3.3 |
| `RemoteIssue` | issue-plugin.md §3.3 |
| `IssueSyncStatus` | issue-plugin.md §5.2 |
| `SyncError` | issue-plugin.md §5.2 |
| `PluginConfig` | issue-plugin.md §3.4 |
| `CustomAgentDefinition` | customization.md §3.1 |
| `AgentLlmConfig` | customization.md §3.2 |
| `TriggerRules` | customization.md §3.1 triggers |
| `DiffFile` / `DiffHunk` | review.md §5.1.2 |
| `GlobalConfig` | cli.md §5.2 |
| `ProjectConfig` | customization.md §5 |
