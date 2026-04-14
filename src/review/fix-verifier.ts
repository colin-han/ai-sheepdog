/**
 * 修复验证 Agent - 验证之前发现的问题是否已修复
 * @see .SPEC/1-requirement/incremental-review.md §3
 */

import fs from 'node:fs';
import path from 'node:path';
import type {
  ValidatedIssue,
  FixVerificationResult,
  FixVerificationSummary,
  VerificationStatus,
} from '../types/index.js';

/** LLM 调用配置 */
interface LLMCallConfig {
  /** 系统提示词（调用时提供） */
  systemPrompt?: string;
  /** 用户消息（调用时提供） */
  userMessage?: string;
  /** API 地址 */
  baseUrl?: string;
  /** 认证 token */
  authToken?: string;
  /** 模型名称 */
  model: string;
  /** 最大 token 数 */
  maxTokens?: number;
}

/** LLM 基础配置（不含提示词） */
interface LLMBaseConfig {
  /** API 地址 */
  baseUrl?: string;
  /** 认证 token */
  authToken?: string;
  /** 模型名称 */
  model: string;
  /** 最大 token 数 */
  maxTokens?: number;
}

/** 验证上下文 */
interface VerificationContext {
  /** 仓库路径 */
  repoPath: string;
  /** 当前 diff 内容 */
  diffContent: string;
  /** 新发现的 issues（用于对比） */
  newIssues: ValidatedIssue[];
}

/** Phase 1 初筛结果 */
interface Phase1Result {
  issue_id: string;
  status: 'resolved' | 'unresolved' | 'unclear';
  reason: string;
}

/**
 * 调用 Anthropic Claude API
 */
async function callAnthropicAPI(config: LLMCallConfig): Promise<{
  text: string;
  inputTokens: number;
  outputTokens: number;
}> {
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
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`LLM API 调用失败: ${response.status} ${errorText}`);
  }

  const data = (await response.json()) as {
    content?: Array<{ type: string; text: string }>;
    usage?: { input_tokens: number; output_tokens: number };
  };

  if (data.content && data.content[0]?.type === 'text') {
    return {
      text: data.content[0].text,
      inputTokens: data.usage?.input_tokens || 0,
      outputTokens: data.usage?.output_tokens || 0,
    };
  }

  throw new Error('LLM API 返回格式错误');
}

/**
 * 构建 Phase 1 批量初筛提示词
 */
function buildPhase1Prompt(
  previousIssues: ValidatedIssue[],
  diffContent: string,
): string {
  const issuesDesc = previousIssues
    .map(
      (issue, idx) => `
Issue ${idx + 1}: ${issue.id}
- 文件: ${issue.file}
- 行号: ${issue.line_start}-${issue.line_end}
- 问题描述: ${issue.description}
- 建议: ${issue.suggestion || 'N/A'}
`,
    )
    .join('\n');

  return `你是一个代码审查助手，负责判断之前发现的问题是否已被修复。

## 之前发现的问题
${issuesDesc}

## 当前的代码变更
\`\`\`diff
${diffContent}
\`\`\`

## 任务
对每个问题进行快速分类：
1. **resolved** - 问题相关的代码已被修改，修改看起来解决了问题
2. **unresolved** - 问题相关的代码未修改，或修改未能解决问题
3. **unclear** - 需要进一步调查才能确定

## 输出格式
返回 JSON 数组：
\`\`\`json
[
  {
    "issue_id": "问题ID",
    "status": "resolved|unresolved|unclear",
    "reason": "简要说明判断依据"
  }
]
\`\`\`

注意：
- 优先将问题标记为 resolved 或 unresolved
- 仅在确实无法判断时才使用 unclear
- 检查文件是否被删除（视为 resolved）`;
}

/**
 * 构建 Phase 2 深入验证提示词
 */
function buildPhase2Prompt(
  previousIssue: ValidatedIssue,
  context: VerificationContext,
): string {
  // 获取当前文件内容（如果存在）
  let currentFileContent = '';
  const fullPath = path.join(context.repoPath, previousIssue.file);
  if (fs.existsSync(fullPath)) {
    try {
      currentFileContent = fs.readFileSync(fullPath, 'utf-8');
    } catch {
      currentFileContent = '(无法读取文件)';
    }
  }

  // 查找相关的新问题
  const relatedNewIssues = context.newIssues.filter(
    (newIssue) =>
      newIssue.file === previousIssue.file &&
      Math.abs(newIssue.line_start - previousIssue.line_start) < 50,
  );

  return `你是一个代码审查助手，负责深入验证一个问题是否已被修复。

## 原始问题
- ID: ${previousIssue.id}
- 文件: ${previousIssue.file}
- 行号: ${previousIssue.line_start}-${previousIssue.line_end}
- 问题描述: ${previousIssue.description}
- 修复建议: ${previousIssue.suggestion || 'N/A'}
- 之前的代码片段:
\`\`\`
${previousIssue.code_snippet || 'N/A'}
\`\`\`

## 当前文件内容
${currentFileContent ? `\`\`\`\n${currentFileContent}\n\`\`\`` : '(文件不存在，可能已被删除)'}

## 相关的新发现的问题
${
  relatedNewIssues.length > 0
    ? relatedNewIssues
        .map(
          (i) => `
- ${i.id}: ${i.title}
  描述: ${i.description}
`,
        )
        .join('\n')
    : '(无)'
}

## 当前的代码变更
\`\`\`diff
${context.diffContent}
\`\`\`

## 任务
判断这个问题的修复状态：
1. **fixed** - 问题已被修复（代码已正确修改）
2. **missed** - 问题未被修复（需要更新问题描述）
3. **false_positive** - 之前的问题是误报（原问题不存在）
4. **obsolete** - 文件已被删除或代码已完全重构
5. **uncertain** - 无法确定

## 输出格式
返回 JSON：
\`\`\`json
{
  "status": "fixed|missed|false_positive|obsolete|uncertain",
  "confidence": 0.0-1.0,
  "reasoning": "详细的推理过程",
  "checked_files": ["检查过的文件列表"],
  "examined_code": ["检查过的代码片段"],
  "related_changes": "相关的代码变更描述",
  "updated_issue": {
    "title": "更新的标题（仅missed时）",
    "description": "更新的描述（仅missed时）",
    "suggestion": "更新的建议（仅missed时）"
  },
  "false_positive_reason": "误报原因（仅false_positive时）"
}
\`\`\``;
}

/**
 * 解析 Phase 1 响应
 */
function parsePhase1Response(response: string): Phase1Result[] {
  try {
    const jsonMatch =
      response.match(/```json\s*([\s\S]*?)\s*```/) ||
      response.match(/\[[\s\S]*\]/);

    if (jsonMatch) {
      const jsonText = jsonMatch[1] || jsonMatch[0];
      return JSON.parse(jsonText) as Phase1Result[];
    }
  } catch {
    // 解析失败，返回空数组
  }
  return [];
}

/**
 * 解析 Phase 2 响应
 */
function parsePhase2Response(
  response: string,
): Omit<FixVerificationResult, 'original_issue_id'> {
  try {
    const jsonMatch =
      response.match(/```json\s*([\s\S]*?)\s*```/) ||
      response.match(/\{[\s\S]*\}/);

    if (jsonMatch) {
      const jsonText = jsonMatch[1] || jsonMatch[0];
      const parsed = JSON.parse(jsonText) as Record<string, unknown>;

      return {
        status: (parsed.status as VerificationStatus) || 'uncertain',
        confidence: (parsed.confidence as number) || 0.5,
        evidence: {
          checked_files: (parsed.checked_files as string[]) || [],
          examined_code: (parsed.examined_code as string[]) || [],
          related_changes: (parsed.related_changes as string) || '',
          reasoning: (parsed.reasoning as string) || '',
        },
        updated_issue: parsed.updated_issue as
          | { title: string; description: string; suggestion: string }
          | undefined,
        false_positive_reason: parsed.false_positive_reason as
          | string
          | undefined,
      };
    }
  } catch {
    // 解析失败
  }

  // 返回默认值
  return {
    status: 'uncertain',
    confidence: 0.3,
    evidence: {
      checked_files: [],
      examined_code: [],
      related_changes: '',
      reasoning: '无法解析 LLM 响应',
    },
  };
}

/**
 * 快速检查文件是否已删除
 */
function isFileDeleted(repoPath: string, filePath: string): boolean {
  const fullPath = path.join(repoPath, filePath);
  return !fs.existsSync(fullPath);
}

/**
 * Phase 1: 批量初筛
 */
async function phase1QuickClassify(
  previousIssues: ValidatedIssue[],
  diffContent: string,
  repoPath: string,
  llmConfig: LLMBaseConfig,
): Promise<Map<string, Phase1Result>> {
  // 首先基于规则进行快速检查
  const results = new Map<string, Phase1Result>();

  for (const issue of previousIssues) {
    // 检查 1: 文件是否已删除
    if (isFileDeleted(repoPath, issue.file)) {
      results.set(issue.id, {
        issue_id: issue.id,
        status: 'resolved',
        reason: '文件已删除',
      });
      continue;
    }

    // 检查 2: diff 中是否有相关修改
    const fileChanged =
      diffContent.includes(`a/${issue.file}`) ||
      diffContent.includes(`b/${issue.file}`);
    if (!fileChanged) {
      results.set(issue.id, {
        issue_id: issue.id,
        status: 'unresolved',
        reason: '相关文件未修改',
      });
      continue;
    }

    // 无法确定，需要 LLM 判断
    results.set(issue.id, {
      issue_id: issue.id,
      status: 'unclear',
      reason: '需要 LLM 判断',
    });
  }

  // 对 unclear 的问题调用 LLM
  const unclearIssues = previousIssues.filter(
    (issue) => results.get(issue.id)?.status === 'unclear',
  );

  if (unclearIssues.length === 0) {
    return results;
  }

  try {
    const prompt = buildPhase1Prompt(unclearIssues, diffContent);
    const { text } = await callAnthropicAPI({
      ...llmConfig,
      systemPrompt: '你是一个代码审查助手。',
      userMessage: prompt,
    });

    const llmResults = parsePhase1Response(text);

    for (const result of llmResults) {
      const existing = results.get(result.issue_id);
      if (existing && existing.status === 'unclear') {
        results.set(result.issue_id, result);
      }
    }
  } catch (error) {
    // LLM 调用失败，保持 unclear 状态
    console.warn('Phase 1 LLM 调用失败:', error);
  }

  return results;
}

/**
 * Phase 2: 深入验证
 */
async function phase2DeepVerify(
  issuesToVerify: ValidatedIssue[],
  phase1Results: Map<string, Phase1Result>,
  context: VerificationContext,
  llmConfig: LLMBaseConfig,
): Promise<FixVerificationResult[]> {
  const results: FixVerificationResult[] = [];

  for (const issue of issuesToVerify) {
    const phase1Result = phase1Results.get(issue.id);

    // 跳过已确定为 resolved 的问题
    if (phase1Result?.status === 'resolved') {
      // 需要深入验证是 fixed 还是 obsolete
      if (isFileDeleted(context.repoPath, issue.file)) {
        results.push({
          original_issue_id: issue.id,
          status: 'obsolete',
          confidence: 0.95,
          evidence: {
            checked_files: [issue.file],
            examined_code: [],
            related_changes: '文件已删除',
            reasoning: phase1Result.reason,
          },
        });
      } else {
        // 需要进一步验证是否真的 fixed
        try {
          const prompt = buildPhase2Prompt(issue, context);
          const { text } = await callAnthropicAPI({
            ...llmConfig,
            systemPrompt: '你是一个代码审查助手。',
            userMessage: prompt,
          });

          const parsed = parsePhase2Response(text);
          results.push({
            original_issue_id: issue.id,
            ...parsed,
          });
        } catch (error) {
          // LLM 调用失败
          results.push({
            original_issue_id: issue.id,
            status: 'uncertain',
            confidence: 0.3,
            evidence: {
              checked_files: [issue.file],
              examined_code: [],
              related_changes: '',
              reasoning: `LLM 调用失败: ${error}`,
            },
          });
        }
      }
      continue;
    }

    // 对于 unresolved 和 unclear 的问题，进行深入验证
    try {
      const prompt = buildPhase2Prompt(issue, context);
      const { text } = await callAnthropicAPI({
        ...llmConfig,
        systemPrompt: '你是一个代码审查助手。',
        userMessage: prompt,
      });

      const parsed = parsePhase2Response(text);
      results.push({
        original_issue_id: issue.id,
        ...parsed,
      });
    } catch (error) {
      // LLM 调用失败
      results.push({
        original_issue_id: issue.id,
        status: 'uncertain',
        confidence: 0.3,
        evidence: {
          checked_files: [issue.file],
          examined_code: [],
          related_changes: '',
          reasoning: `LLM 调用失败: ${error}`,
        },
      });
    }
  }

  return results;
}

/** 验证选项 */
export interface FixVerifierOptions {
  /** 仓库路径 */
  repoPath: string;
  /** LLM 配置 */
  llmConfig?: {
    /** API 地址 */
    baseUrl?: string;
    /** 认证 token */
    authToken?: string;
    /** 模型名称（默认使用 agent-model） */
    model?: string;
  };
}

/**
 * 验证之前发现的问题是否已修复
 */
export async function verifyFixes(
  previousIssues: ValidatedIssue[],
  diffContent: string,
  newIssues: ValidatedIssue[],
  options: FixVerifierOptions,
): Promise<FixVerificationSummary> {
  const startTime = Date.now();
  let totalTokens = 0;

  if (previousIssues.length === 0) {
    return {
      total_verified: 0,
      by_status: {
        fixed: 0,
        missed: 0,
        false_positive: 0,
        obsolete: 0,
        uncertain: 0,
      },
      results: [],
      verification_time_ms: Date.now() - startTime,
      tokens_used: 0,
    };
  }

  // 准备 LLM 配置基类
  const llmConfigBase = {
    baseUrl: options.llmConfig?.baseUrl,
    authToken: options.llmConfig?.authToken,
    model: options.llmConfig?.model || 'claude-sonnet-4-5-20250929',
    maxTokens: 4096,
  };

  const context: VerificationContext = {
    repoPath: options.repoPath,
    diffContent,
    newIssues,
  };

  // Phase 1: 批量初筛
  const phase1Results = await phase1QuickClassify(
    previousIssues,
    diffContent,
    options.repoPath,
    llmConfigBase,
  );

  // Phase 2: 深入验证
  const needsDeepVerify = previousIssues.filter(
    (issue) => phase1Results.get(issue.id)?.status !== 'unresolved',
  );

  // 对于 unresolved 的问题，直接标记为 missed
  const results: FixVerificationResult[] = [];

  for (const issue of previousIssues) {
    const phase1Result = phase1Results.get(issue.id);
    if (phase1Result?.status === 'unresolved') {
      results.push({
        original_issue_id: issue.id,
        status: 'missed',
        confidence: 0.8,
        evidence: {
          checked_files: [issue.file],
          examined_code: [],
          related_changes: phase1Result.reason,
          reasoning: '相关代码未修改',
        },
      });
    }
  }

  // 对其他问题进行深入验证
  const deepVerifyResults = await phase2DeepVerify(
    needsDeepVerify,
    phase1Results,
    context,
    llmConfigBase,
  );

  results.push(...deepVerifyResults);

  // 统计
  const by_status: Record<VerificationStatus, number> = {
    fixed: 0,
    missed: 0,
    false_positive: 0,
    obsolete: 0,
    uncertain: 0,
  };

  for (const result of results) {
    by_status[result.status]++;
  }

  return {
    total_verified: previousIssues.length,
    by_status,
    results,
    verification_time_ms: Date.now() - startTime,
    tokens_used: totalTokens,
  };
}
