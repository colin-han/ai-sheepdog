/**
 * 审查编排器
 * @see .SPEC/1-requirement/review.md §5.2
 */

import type { AgentType, DiffResult } from '../types/index.js';
import type { AgentRunResult } from '../types/index.js';
import { getBuiltinAgent } from './builtin/agents.js';

/**
 * Agent 运行选项
 */
export interface AgentRunOptions {
  /** Diff 结果 */
  diffResult: DiffResult;
  /** 要运行的 Agent 列表 */
  agents: AgentType[];
  /** AbortController 用于中断运行 */
  signal?: AbortSignal;
  /** LLM 配置覆盖 */
  llmConfig?: {
    baseUrl?: string;
    authToken?: string;
    model?: string;
  };
}

/**
 * LLM 调用配置
 */
interface LLMCallConfig {
  /** 系统提示词 */
  systemPrompt: string;
  /** 用户消息 */
  userMessage: string;
  /** API 地址 */
  baseUrl?: string;
  /** 认证 token */
  authToken?: string;
  /** 模型名称 */
  model: string;
  /** 最大 token 数 */
  maxTokens?: number;
}

/**
 * 调用 Anthropic Claude API
 */
async function callAnthropicAPI(config: LLMCallConfig): Promise<string> {
  const {
    systemPrompt,
    userMessage,
    baseUrl = 'https://api.anthropic.com',
    authToken,
    model,
    maxTokens = 4096,
  } = config;

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'anthropic-version': '2023-06-01',
  };

  if (authToken) {
    headers['x-api-key'] = authToken;
  }

  const response = await fetch(`${baseUrl}/v1/messages`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      model,
      max_tokens: maxTokens,
      system: systemPrompt,
      messages: [
        {
          role: 'user',
          content: userMessage,
        },
      ],
    }),
    signal: undefined, // TODO: 传递 AbortSignal
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`LLM API 调用失败: ${response.status} ${errorText}`);
  }

  const data = (await response.json()) as {
    content?: Array<{ type: string; text: string }>;
  };

  if (data.content && data.content[0]?.type === 'text') {
    return data.content[0].text;
  }

  throw new Error('LLM API 返回格式错误');
}

/**
 * 格式化 diff 内容为 LLM 提示
 */
function formatDiffForLLM(diffResult: DiffResult): string {
  const lines: string[] = [];

  lines.push('# 代码差异\n');

  for (const file of diffResult.files) {
    lines.push(`## 文件: ${file.path}`);
    lines.push(`\`\`\`diff`);
    lines.push(file.diff_content);
    lines.push(`\`\`\`\n`);
  }

  return lines.join('\n');
}

/**
 * 运行单个 Agent
 */
async function runSingleAgent(
  agentName: AgentType,
  diffResult: DiffResult,
  llmConfig?: AgentRunOptions['llmConfig'],
): Promise<AgentRunResult> {
  const startTime = Date.now();

  try {
    // 获取 Agent 定义
    const agentDef = getBuiltinAgent(agentName);
    if (!agentDef) {
      throw new Error(`未找到 Agent 定义: ${agentName}`);
    }

    // 准备 LLM 调用
    const systemPrompt = agentDef.prompt;
    const userMessage = formatDiffForLLM(diffResult);

    const llmCallConfig: LLMCallConfig = {
      systemPrompt,
      userMessage,
      model: llmConfig?.model || agentDef.model,
      baseUrl: llmConfig?.baseUrl,
      authToken: llmConfig?.authToken,
    };

    // 调用 LLM
    const response = await callAnthropicAPI(llmCallConfig);

    // 解析响应
    let issues: Array<Record<string, unknown>> = [];
    try {
      // 尝试从响应中提取 JSON
      const jsonMatch =
        response.match(/```json\s*([\s\S]*?)\s*```/) ||
        response.match(/\[[\s\S]*\]/);

      if (jsonMatch) {
        const jsonText = jsonMatch[1] || jsonMatch[0];
        issues = JSON.parse(jsonText) as Array<Record<string, unknown>>;
      } else {
        // 如果没有找到 JSON，返回空列表
        console.warn(`Agent ${agentName} 未返回有效的 JSON`);
      }
    } catch (error) {
      console.warn(`解析 Agent ${agentName} 响应失败:`, error);
    }

    const elapsed_ms = Date.now() - startTime;

    return {
      agent_name: agentName,
      issues,
      checklist: [], // TODO: 实现检查清单
      elapsed_ms,
      success: true,
    };
  } catch (error) {
    const elapsed_ms = Date.now() - startTime;
    return {
      agent_name: agentName,
      issues: [],
      checklist: [],
      elapsed_ms,
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

/**
 * 并行运行多个 Agent
 */
export async function runAgents(
  options: AgentRunOptions,
): Promise<AgentRunResult[]> {
  const { diffResult, agents, signal, llmConfig } = options;

  // 如果没有 Agent，返回空列表
  if (agents.length === 0) {
    return [];
  }

  // 检查是否已中断
  if (signal?.aborted) {
    throw new Error('Agent 运行已被中断');
  }

  // 并行运行所有 Agent
  const results = await Promise.all(
    agents.map((agent) => runSingleAgent(agent, diffResult, llmConfig)),
  );

  return results;
}

/**
 * 串行运行多个 Agent（用于调试）
 */
export async function runAgentsSequentially(
  options: AgentRunOptions,
): Promise<AgentRunResult[]> {
  const { diffResult, agents, signal, llmConfig } = options;
  const results: AgentRunResult[] = [];

  for (const agent of agents) {
    // 检查是否已中断
    if (signal?.aborted) {
      throw new Error('Agent 运行已被中断');
    }

    const result = await runSingleAgent(agent, diffResult, llmConfig);
    results.push(result);
  }

  return results;
}
