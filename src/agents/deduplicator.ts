/**
 * 实时去重器
 * @see .SPEC/1-requirement/review.md §5.2
 */

/** Issue 的简化表示（用于去重） */
interface IssueKey {
  /** 文件路径 */
  file: string;
  /** 起始行号 */
  line_start: number;
  /** 结束行号 */
  line_end: number;
  /** 问题类别 */
  category: string;
}

/**
 * 检查两个行范围是否重叠
 */
function isLineRangeOverlap(
  start1: number,
  end1: number,
  start2: number,
  end2: number,
): boolean {
  // 不重叠的情况：range1 完全在 range2 之前或之后
  if (end1 < start2 || end2 < start1) {
    return false;
  }
  return true;
}

/**
 * 生成 Issue 的唯一键
 */
function getIssueKey(issue: Record<string, unknown>): IssueKey {
  const file = String(issue['file'] || '');
  const line_start = Number(issue['line_start'] || 0);
  const line_end = Number(issue['line_end'] || line_start);
  const category = String(issue['category'] || '');

  return { file, line_start, line_end, category };
}

/**
 * 检查两个 Issue 是否重复
 *
 * 去重规则：
 * 1. 相同文件
 * 2. 相同或重叠的行范围
 * 3. 相同的问题类别
 */
function areIssuesDuplicate(
  issue1: Record<string, unknown>,
  issue2: Record<string, unknown>,
): boolean {
  const key1 = getIssueKey(issue1);
  const key2 = getIssueKey(issue2);

  // 检查文件是否相同
  if (key1.file !== key2.file) {
    return false;
  }

  // 检查类别是否相同
  if (key1.category !== key2.category) {
    return false;
  }

  // 检查行范围是否重叠
  return isLineRangeOverlap(
    key1.line_start,
    key1.line_end,
    key2.line_start,
    key2.line_end,
  );
}

/**
 * 去重结果
 */
export interface DeduplicationResult {
  /** 去重后的 Issue 列表 */
  uniqueIssues: Array<Record<string, unknown>>;
  /** 被合并的重复 Issue 数量 */
  duplicatesRemoved: number;
  /** 重复 Issue 的映射（原始索引 -> 保留的索引） */
  duplicateMap: Record<number, number>;
}

/**
 * 对 Agent 输出的 Issue 列表进行实时去重
 *
 * @param issues - 待去重的 Issue 列表
 * @returns 去重结果
 */
export function deduplicateIssues(
  issues: Array<Record<string, unknown>>,
): DeduplicationResult {
  const uniqueIssues: Array<Record<string, unknown>> = [];
  const duplicateMap: Record<number, number> = {};
  let duplicatesRemoved = 0;

  for (let i = 0; i < issues.length; i++) {
    const currentIssue = issues[i];
    if (!currentIssue) continue;

    let isDuplicate = false;

    // 检查是否与已有的 Issue 重复
    for (let j = 0; j < uniqueIssues.length; j++) {
      const existingIssue = uniqueIssues[j]!;
      if (areIssuesDuplicate(currentIssue, existingIssue)) {
        isDuplicate = true;
        duplicateMap[i] = j;
        duplicatesRemoved++;
        break;
      }
    }

    // 如果不是重复的，添加到唯一列表
    if (!isDuplicate) {
      uniqueIssues.push(currentIssue);
    }
  }

  return {
    uniqueIssues,
    duplicatesRemoved,
    duplicateMap,
  };
}

/**
 * 合并多个 Agent 的输出并去重
 *
 * @param agentResults - 多个 Agent 的运行结果
 * @returns 合并去重后的 Issue 列表
 */
export function mergeAndDeduplicate(
  agentResults: Array<{
    agent_name: string;
    issues: Array<Record<string, unknown>>;
  }>,
): DeduplicationResult {
  // 收集所有 Issue
  const allIssues: Array<Record<string, unknown>> = [];

  for (const result of agentResults) {
    for (const issue of result.issues) {
      // 标记来源 Agent
      allIssues.push({
        ...issue,
        source_agent: result.agent_name,
      });
    }
  }

  // 去重
  return deduplicateIssues(allIssues);
}

/**
 * 增量去重：将新 Issue 与已有 Issue 比较去重
 *
 * 用于增量 review 场景，将新发现的问题与之前报告的问题比较
 *
 * @param newIssues - 新发现的 Issue 列表
 * @param existingIssues - 已存在的 Issue 列表
 * @returns 新 Issue 中非重复的部分
 */
export function deduplicateAgainstExisting(
  newIssues: Array<Record<string, unknown>>,
  existingIssues: Array<Record<string, unknown>>,
): Array<Record<string, unknown>> {
  const uniqueNewIssues: Array<Record<string, unknown>> = [];

  for (const newIssue of newIssues) {
    let isDuplicate = false;

    for (const existingIssue of existingIssues) {
      if (areIssuesDuplicate(newIssue, existingIssue)) {
        isDuplicate = true;
        break;
      }
    }

    if (!isDuplicate) {
      uniqueNewIssues.push(newIssue);
    }
  }

  return uniqueNewIssues;
}
