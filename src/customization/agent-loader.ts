/**
 * 自定义 Agent 加载器
 * 从 .sheepdog/agents/*.md 加载自定义 Agent 定义
 * @see .SPEC/2-design/customization.md §3
 */

import fs from 'node:fs';
import path from 'node:path';
import yaml from 'js-yaml';
import type { CustomAgentDefinition, TriggerMode } from '../types/index.js';

/** 加载错误 */
export interface LoadError {
  /** 文件路径 */
  file: string;
  /** 错误信息 */
  error: string;
}

/** Agent 加载结果 */
export interface CustomAgentLoadResult {
  /** 成功加载的 Agent 列表 */
  agents: CustomAgentDefinition[];
  /** 加载错误列表 */
  errors: LoadError[];
}

/** YAML frontmatter 解析结果 */

/**
 * 解析 Markdown 文件的 YAML frontmatter
 * @param content 文件内容
 * @returns [frontmatter, markdown正文]
 */
function parseFrontmatter(
  content: string,
): [Record<string, unknown> | null, string] {
  const trimmed = content.trimStart();
  if (!trimmed.startsWith('---')) {
    return [null, content];
  }

  const endMarker = trimmed.indexOf('\n---', 4);
  if (endMarker === -1) {
    return [null, content];
  }

  const yamlText = trimmed.slice(4, endMarker);
  const markdown = trimmed.slice(endMarker + 4).trimStart();

  try {
    const result = yaml.load(yamlText) as Record<string, unknown>;
    return [result || null, markdown];
  } catch {
    return [null, content];
  }
}

/**
 * 替换环境变量引用
 * 支持 ${ENV_VAR} 格式
 */
function expandEnvVariables(value: string | undefined): string | undefined {
  if (!value) {
    return value;
  }
  return value.replace(/\$\{([A-Z_][A-Z0-9_]*)\}/g, (_, envVar) => {
    return process.env[envVar] || `\${${envVar}}`;
  });
}

/**
 * 验证 Agent 定义必须字段
 */
function validateAgentDefinition(data: Record<string, unknown>): string | null {
  const requiredFields = ['name', 'description', 'trigger_mode', 'output'];
  for (const field of requiredFields) {
    if (!(field in data) || data[field] === undefined || data[field] === null) {
      return `Missing required field: ${field}`;
    }
  }

  const triggerMode = data.trigger_mode as string;
  if (triggerMode !== 'rule' && triggerMode !== 'llm') {
    return `Invalid trigger_mode: ${triggerMode}, must be 'rule' or 'llm'`;
  }

  const output = data.output as Record<string, unknown> | undefined;
  if (!output || !output.category || !output.default_severity) {
    return 'output must contain category and default_severity';
  }

  const validCategories = ['security', 'logic', 'performance', 'style'];
  if (!validCategories.includes(output.category as string)) {
    return `Invalid output category: ${output.category}`;
  }

  const validSeverities = ['critical', 'error', 'warning', 'suggestion'];
  if (!validSeverities.includes(output.default_severity as string)) {
    return `Invalid output default_severity: ${output.default_severity}`;
  }

  return null;
}

/**
 * 从 frontmatter 数据构建 CustomAgentDefinition
 */
function buildAgentDefinition(
  data: Record<string, unknown>,
  prompt: string,
  sourceFile: string,
): CustomAgentDefinition | null {
  // 验证必须字段
  const error = validateAgentDefinition(data);
  if (error) {
    return null;
  }

  const llm = data.llm as Record<string, unknown> | undefined;
  const output = data.output as Record<string, unknown>;
  const triggers = data.triggers as Record<string, unknown> | undefined;

  return {
    name: String(data.name),
    description: String(data.description),
    trigger_mode: data.trigger_mode as TriggerMode,
    triggers: triggers
      ? {
          files: (triggers.files as string[] | undefined)?.map(String),
          exclude_files: (triggers.exclude_files as string[] | undefined)?.map(
            String,
          ),
          content_patterns: (
            triggers.content_patterns as string[] | undefined
          )?.map(String),
          min_files: triggers.min_files as number | undefined,
          match_mode:
            (triggers.match_mode as 'all' | 'any' | undefined) || 'any',
        }
      : undefined,
    trigger_prompt: data.trigger_prompt as string | undefined,
    llm: llm
      ? {
          base_url: llm.base_url as string | undefined,
          auth_token: expandEnvVariables(llm.auth_token as string | undefined),
          model: llm.model as string | undefined,
        }
      : undefined,
    output: {
      category: output.category as
        | 'security'
        | 'logic'
        | 'performance'
        | 'style',
      default_severity: output.default_severity as
        | 'critical'
        | 'error'
        | 'warning'
        | 'suggestion',
      severity_weight: output.severity_weight as number | undefined,
    },
    enabled: data.enabled !== false, // 默认启用
    tags: (data.tags as string[] | undefined)?.map(String),
    prompt,
    source_file: sourceFile,
  };
}

/**
 * 从指定目录加载所有自定义 Agent
 * @param agentsPath .sheepdog/agents 目录路径
 * @returns 加载结果
 */
export function loadCustomAgents(agentsPath: string): CustomAgentLoadResult {
  const agents: CustomAgentDefinition[] = [];
  const errors: LoadError[] = [];

  if (!fs.existsSync(agentsPath)) {
    return { agents, errors };
  }

  const files = fs.readdirSync(agentsPath);
  const mdFiles = files.filter((f) => f.endsWith('.md'));

  // 按文件名排序，确保覆盖顺序可预测
  mdFiles.sort();

  const agentMap = new Map<string, CustomAgentDefinition>();

  for (const file of mdFiles) {
    const filePath = path.join(agentsPath, file);

    try {
      const content = fs.readFileSync(filePath, 'utf-8');
      const [frontmatter, markdown] = parseFrontmatter(content);

      if (!frontmatter) {
        errors.push({
          file: filePath,
          error: 'No valid YAML frontmatter found',
        });
        continue;
      }

      const agent = buildAgentDefinition(frontmatter, markdown, filePath);
      if (!agent) {
        errors.push({
          file: filePath,
          error: 'Invalid agent definition or missing required fields',
        });
        continue;
      }

      // 同名 agent 后加载的覆盖先加载的
      agentMap.set(agent.name, agent);
    } catch (err) {
      errors.push({
        file: filePath,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  // 转换为数组
  agents.push(...Array.from(agentMap.values()));

  return { agents, errors };
}

/**
 * 从指定目录加载自定义 Agent（同步版本）
 * @param repoPath 项目根目录
 * @returns 加载结果
 */
export function loadAgentsFromRepo(repoPath: string): CustomAgentLoadResult {
  const agentsPath = path.join(repoPath, '.sheepdog', 'agents');
  return loadCustomAgents(agentsPath);
}
