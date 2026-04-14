/**
 * 规则加载器
 * 从 .sheepdog/rules/ 加载审查规则并注入到对应 Agent
 * @see .SPEC/2-design/customization.md §3
 */

import fs from 'node:fs';
import path from 'node:path';
import type { CustomAgentDefinition, IssueCategory } from '../types/index.js';

/** 规则定义 */
export interface RuleDefinition {
  /** 规则 ID（文件名） */
  id: string;
  /** 对应的 Agent category */
  category: IssueCategory;
  /** 规则内容（Markdown） */
  content: string;
  /** 是否为全局规则 */
  global: boolean;
  /** 来源文件路径 */
  source_file: string;
}

/** 规则加载结果 */
export interface RuleLoadResult {
  /** 加载的规则列表 */
  rules: RuleDefinition[];
  /** 加载错误列表 */
  errors: Array<{ file: string; error: string }>;
}

/**
 * 文件名到 Agent category 的映射
 * global.md → 所有 Agent
 * security.md → security-reviewer
 * logic.md → logic-reviewer
 * style.md → style-reviewer
 * performance.md → performance-reviewer
 */
const FILENAME_CATEGORY_MAP: Record<string, IssueCategory | 'global'> = {
  global: 'global',
  security: 'security',
  logic: 'logic',
  style: 'style',
  performance: 'performance',
} as const;

/**
 * 从指定目录加载规则文件
 * @param rulesPath .sheepdog/rules 目录路径
 * @returns 加载结果
 */
export function loadRules(rulesPath: string): RuleLoadResult {
  const rules: RuleDefinition[] = [];
  const errors: Array<{ file: string; error: string }> = [];

  if (!fs.existsSync(rulesPath)) {
    return { rules, errors };
  }

  const files = fs.readdirSync(rulesPath);
  const mdFiles = files.filter((f) => f.endsWith('.md'));

  for (const file of mdFiles) {
    const filePath = path.join(rulesPath, file);
    const baseName = file.slice(0, -3); // 去掉 .md 后缀

    const category = FILENAME_CATEGORY_MAP[baseName];
    if (!category) {
      // 未知的规则文件名，跳过
      continue;
    }

    try {
      const content = fs.readFileSync(filePath, 'utf-8');
      rules.push({
        id: baseName,
        category: category as IssueCategory,
        content,
        global: category === 'global',
        source_file: filePath,
      });
    } catch (err) {
      errors.push({
        file: filePath,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  return { rules, errors };
}

/**
 * 从项目根目录加载规则
 */
export function loadRulesFromRepo(repoPath: string): RuleLoadResult {
  const rulesPath = path.join(repoPath, '.sheepdog', 'rules');
  return loadRules(rulesPath);
}

/**
 * 将规则注入到 Agent 的 prompt 中
 * @param agent Agent 定义
 * @param rules 规则列表
 * @returns 注入规则后的 prompt
 */
export function injectRulesToAgent(
  agent: CustomAgentDefinition,
  rules: RuleDefinition[],
): string {
  const globalRules = rules.filter((r) => r.global);
  const categoryRules = rules.filter(
    (r) => !r.global && r.category === agent.output.category,
  );

  if (globalRules.length === 0 && categoryRules.length === 0) {
    return agent.prompt;
  }

  const sections: string[] = [];

  // 原始 prompt
  if (agent.prompt) {
    sections.push(agent.prompt);
  }

  // 全局规则
  if (globalRules.length > 0) {
    sections.push('\n## 全局审查规则\n');
    for (const rule of globalRules) {
      sections.push(`\n### ${rule.id}\n${rule.content}`);
    }
  }

  // 专属规则
  if (categoryRules.length > 0) {
    sections.push('\n## 专属审查规则\n');
    for (const rule of categoryRules) {
      sections.push(`\n### ${rule.id}\n${rule.content}`);
    }
  }

  return sections.join('\n');
}

/**
 * 批量注入规则到多个 Agent
 * @param agents Agent 列表
 * @param rules 规则列表
 * @returns 注入规则后的 Agent 列表
 */
export function injectRulesToAgents(
  agents: CustomAgentDefinition[],
  rules: RuleDefinition[],
): CustomAgentDefinition[] {
  return agents.map((agent) => ({
    ...agent,
    prompt: injectRulesToAgent(agent, rules),
  }));
}

/**
 * 根据规则匹配选择应触发的 Agent
 * @param agents 所有可用的 Agent
 * @param changedFiles 修改的文件列表
 * @param fileContents 文件内容映射（可选，用于内容模式匹配）
 * @returns 应触发的 Agent 列表
 */
export function selectAgentsByRules(
  agents: CustomAgentDefinition[],
  changedFiles: string[],
  fileContents?: Map<string, string>,
): CustomAgentDefinition[] {
  const selected: CustomAgentDefinition[] = [];

  for (const agent of agents) {
    // 跳过禁用的 Agent
    if (!agent.enabled) {
      continue;
    }

    // trigger_mode 为 llm 的 Agent 总是返回（由 LLM 决定是否触发）
    if (agent.trigger_mode === 'llm') {
      selected.push(agent);
      continue;
    }

    // trigger_mode 为 rule 的 Agent 需要检查触发条件
    if (!agent.triggers) {
      // 没有触发条件，默认不触发
      continue;
    }

    const triggers = agent.triggers;

    // 计算匹配的文件（过滤掉排除的文件）
    let matchedFiles = changedFiles;
    if (triggers.exclude_files && triggers.exclude_files.length > 0) {
      matchedFiles = changedFiles.filter(
        (file) => !matchesPattern(file, triggers.exclude_files!),
      );
    }

    // 检查文件匹配
    let fileMatched = false;
    if (triggers.files && triggers.files.length > 0) {
      // 使用简单的 glob 匹配
      fileMatched = matchedFiles.some((file) =>
        matchesPattern(file, triggers.files!),
      );
    }

    // 检查内容模式
    let contentMatched = false;
    if (
      triggers.content_patterns &&
      triggers.content_patterns.length > 0 &&
      fileContents
    ) {
      for (const [, content] of fileContents) {
        for (const pattern of triggers.content_patterns) {
          try {
            const regex = new RegExp(pattern);
            if (regex.test(content)) {
              contentMatched = true;
              break;
            }
          } catch {
            // 忽略无效的正则
          }
        }
        if (contentMatched) {
          break;
        }
      }
    }

    // 检查最小文件数
    let minFilesSatisfied = true;
    if (triggers.min_files !== undefined) {
      const matchedCount = triggers.files
        ? matchedFiles.filter((file) => matchesPattern(file, triggers.files!))
            .length
        : matchedFiles.length;
      minFilesSatisfied = matchedCount >= triggers.min_files;
    }

    // 根据 match_mode 决定是否触发
    let shouldTrigger = false;
    const matchMode = triggers.match_mode || 'any';

    if (matchMode === 'all') {
      // 需要所有条件都满足
      shouldTrigger =
        (triggers.files ? fileMatched : true) &&
        (triggers.content_patterns ? contentMatched : true) &&
        minFilesSatisfied;
    } else {
      // 任一条件满足即可
      shouldTrigger =
        (triggers.files ? fileMatched : false) ||
        (triggers.content_patterns ? contentMatched : false) ||
        (triggers.min_files !== undefined && minFilesSatisfied);

      // 如果没有定义任何触发条件，默认不触发
      if (
        !triggers.files &&
        !triggers.content_patterns &&
        !triggers.min_files
      ) {
        shouldTrigger = false;
      }
    }

    if (shouldTrigger) {
      selected.push(agent);
    }
  }

  return selected;
}

/**
 * 简单的 glob 模式匹配
 * 支持 * 和 ** 通配符
 */
function matchesPattern(file: string, patterns: string[]): boolean {
  const normalizedFile = file.replace(/\\/g, '/');

  for (const pattern of patterns) {
    const normalizedPattern = pattern.replace(/\\/g, '/');

    // 将 glob 模式转换为正则表达式
    let regexPattern = normalizedPattern
      .replace(/\./g, '\\.')
      .replace(/\*\*/g, '.*')
      .replace(/\*/g, '[^/]*')
      .replace(/\?/g, '.');

    // 确保匹配整个路径
    if (!regexPattern.startsWith('^')) {
      regexPattern = `^${regexPattern}`;
    }
    if (!regexPattern.endsWith('$')) {
      regexPattern = `${regexPattern}$`;
    }

    try {
      const regex = new RegExp(regexPattern);
      if (regex.test(normalizedFile)) {
        return true;
      }
    } catch {
      // 忽略无效的模式
    }
  }

  return false;
}
