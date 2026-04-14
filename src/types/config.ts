/**
 * 配置类型
 * @see .SPEC/2-design/cli.md §5.2
 * @see .SPEC/2-design/customization.md §5
 */
import type { Severity, OutputLanguage } from './core.js';

/** 全局配置结构 */
export interface GlobalConfig {
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
export interface ProjectConfig {
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
export interface ConfigSource {
  /** 配置键 */
  key: string;
  /** 配置值 */
  value: string;
  /** 来源：env / global / project / default */
  source: 'env' | 'global' | 'project' | 'default';
}

/** 合并后的运行时配置 */
export interface RuntimeConfig {
  /** 全局配置 */
  global: GlobalConfig;
  /** 项目配置 */
  project: ProjectConfig;
  /** 配置解析来源（调试用） */
  sources: ConfigSource[];
}
