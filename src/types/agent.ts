/**
 * Agent 系统类型
 * @see .SPEC/2-design/customization.md §3
 * @see .SPEC/1-requirement/review.md §5.2
 */
import type {
  IssueCategory,
  Severity,
  TriggerMode,
  AgentType,
} from './core.js';

/** 触发规则条件 */
export interface TriggerRules {
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
export interface AgentLlmConfig {
  /** API 地址 */
  base_url?: string;
  /** 认证 token（支持 ${ENV_VAR} 环境变量引用） */
  auth_token?: string;
  /** 模型名称 */
  model?: string;
}

/** Agent 输出配置 */
export interface AgentOutputConfig {
  /** 默认问题类别 */
  category: IssueCategory;
  /** 默认严重程度 */
  default_severity: Severity;
  /** 严重程度权重 (0-2) */
  severity_weight?: number;
}

/** 内置 Agent 定义 */
export interface BuiltinAgentDefinition {
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
export interface CustomAgentDefinition {
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
export interface AgentSelection {
  /** 被选中的内置 Agent */
  builtin_agents: AgentType[];
  /** 被选中的自定义 Agent */
  custom_agents: CustomAgentDefinition[];
  /** 选择原因（调试用） */
  reasons: Record<string, string>;
}

/** Agent 运行结果 */
export interface AgentRunResult {
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
export interface DeduplicationResult {
  /** 去重后的 issue 列表 */
  issues: Array<Record<string, unknown>>;
  /** 被合并的重复 issue 数量 */
  duplicates_removed: number;
}
