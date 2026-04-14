/**
 * Agent 智能选择器
 * @see .SPEC/1-requirement/review.md §5.2
 */

import type { AgentType, DiffFile } from '../types/index.js';

/** 文件扩展名到 Agent 的映射 */
const AGENT_FILE_PATTERNS: Record<AgentType, RegExp[]> = {
  'security-reviewer': [
    /\.(ts|js|tsx|jsx|py|java|go|rs|php|rb)$/,
    /\.(sql)$/,
    /\.env\./,
    /config\./,
  ],
  'logic-reviewer': [
    /\.(ts|js|tsx|jsx|py|java|go|rs|php|rb|cpp|cc|cxx|h|hpp)$/,
  ],
  'style-reviewer': [
    /\.(ts|js|tsx|jsx|py|java|go|rs|php|rb|css|scss|sass|less)$/,
  ],
  'performance-reviewer': [/\.(ts|js|tsx|jsx|py|java|go|rs|sql)$/],
  validator: [],
  'fix-verifier': [],
};

/** 不需要特定 Agent 的文件模式 */
const AGENT_EXCLUDE_PATTERNS: Partial<Record<AgentType, RegExp[]>> = {
  // security-reviewer 不审查纯样式文件
  'security-reviewer': [
    /\.(css|scss|sass|less|styl)$/,
    /\.(html|htm|vue|svelte)$/,
    /\.(svg|png|jpg|jpeg|gif|ico|webp)$/,
    /\.md$/,
  ],
  // logic-reviewer 不审查样式和配置文件
  'logic-reviewer': [
    /\.(css|scss|sass|less|styl)$/,
    /\.(json|yaml|yml|toml|xml)$/,
    /\.md$/,
  ],
};

/**
 * Agent 选择结果
 */
export interface AgentSelectionResult {
  /** 需要运行的 Agent 列表 */
  agents: AgentType[];
  /** 选择原因（调试用） */
  reasons: Record<string, string>;
}

/**
 * 根据文件变更选择合适的 Agent
 *
 * @param files - 变更的文件列表
 * @param enabledAgents - 启用的 Agent 列表（默认全部内置 Agent）
 * @returns Agent 选择结果
 */
export function selectAgents(
  files: DiffFile[],
  enabledAgents: AgentType[] = [
    'security-reviewer',
    'logic-reviewer',
    'style-reviewer',
    'performance-reviewer',
  ],
): AgentSelectionResult {
  const reasons: Record<string, string> = {};
  const selectedAgents = new Set<AgentType>();

  // 如果没有文件，返回空列表
  if (files.length === 0) {
    return {
      agents: [],
      reasons: { default: '没有变更文件' },
    };
  }

  // 过滤掉非源代码文件（config, data, asset, lock, generated）
  const sourceFiles = files.filter((f) => f.category === 'source');

  // 如果没有源代码文件，只运行 style-reviewer（可能审查配置文件）
  if (sourceFiles.length === 0) {
    if (enabledAgents.includes('style-reviewer')) {
      selectedAgents.add('style-reviewer');
      reasons['style-reviewer'] = '检测到非源代码文件，仅进行风格检查';
    }
    return {
      agents: Array.from(selectedAgents),
      reasons,
    };
  }

  // 按文件选择 Agent
  for (const agent of enabledAgents) {
    // validator 和 fix-verifier 不在这里选择
    if (agent === 'validator' || agent === 'fix-verifier') {
      continue;
    }

    const includePatterns = AGENT_FILE_PATTERNS[agent];
    const excludePatterns = AGENT_EXCLUDE_PATTERNS[agent] || [];

    // 检查是否有匹配的文件
    let matchedCount = 0;
    for (const file of sourceFiles) {
      const filePath = file.path;

      // 检查排除模式
      const isExcluded = excludePatterns.some((pattern) =>
        pattern.test(filePath),
      );
      if (isExcluded) {
        continue;
      }

      // 检查包含模式
      const isIncluded = includePatterns.some((pattern) =>
        pattern.test(filePath),
      );
      if (isIncluded) {
        matchedCount++;
      }
    }

    // 如果有匹配的文件，选择该 Agent
    if (matchedCount > 0) {
      selectedAgents.add(agent);
      reasons[agent] = `匹配 ${matchedCount} 个源代码文件`;
    }
  }

  // 确保至少返回一个 Agent
  if (selectedAgents.size === 0 && enabledAgents.length > 0) {
    const defaultAgent = enabledAgents[0]!;
    selectedAgents.add(defaultAgent);
    reasons[defaultAgent] = '默认选择（无文件模式匹配）';
  }

  return {
    agents: Array.from(selectedAgents),
    reasons,
  };
}

/**
 * 根据文件类型快速判断是否需要某个 Agent
 */
export function needsAgent(agent: AgentType, filePath: string): boolean {
  const includePatterns = AGENT_FILE_PATTERNS[agent];
  const excludePatterns = AGENT_EXCLUDE_PATTERNS[agent] || [];

  // 检查排除模式
  if (excludePatterns.some((pattern) => pattern.test(filePath))) {
    return false;
  }

  // 检查包含模式
  return includePatterns.some((pattern) => pattern.test(filePath));
}
