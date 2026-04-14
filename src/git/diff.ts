/**
 * Git Diff 获取和解析
 * @see .SPEC/1-requirement/review.md §5.1
 */

import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import type {
  DiffFile,
  DiffHunk,
  DiffOptions,
  DiffResult,
  DiffStrategy,
  FileCategory,
  RefType,
} from '../types/index.js';

/** 文件分类规则 */
const FILE_CATEGORIES: Record<FileCategory, RegExp[]> = {
  source: [
    /\.(ts|js|tsx|jsx|mjs|cjs)$/,
    /\.(rs|go|java|kt|scala|groovy)$/,
    /\.(py|rb|php|cs|swift|cpp|cc|cxx|h|hpp)$/,
    /\.(sh|bash|zsh|fish|ps1)$/,
  ],
  config: [
    /\.(json|yaml|yml|toml|ini|conf|cfg|xml)$/,
    /\.(graphql|gql)$/,
    /package\.json$/,
    /tsconfig\.json$/,
    /\.eslintrc/,
    /\.prettierrc/,
  ],
  data: [/\.(sql|csv|tsv)$/, /\.(md|mdx|txt)$/, /\.(proto|thrift)$/],
  asset: [
    /\.(css|scss|sass|less|styl)$/,
    /\.(html|htm|vue|svelte)$/,
    /\.(svg|png|jpg|jpeg|gif|ico|webp)$/,
    /\.(woff|woff2|ttf|eot)$/,
  ],
  lock: [
    /package-lock\.json$/,
    /yarn\.lock$/,
    /pnpm-lock\.yaml$/,
    /bun\.lockb$/,
    /Cargo\.lock$/,
    /\.gems$/,
    /composer\.lock$/,
  ],
  generated: [
    /(^|\/)node_modules\//,
    /(^|\/)dist\//,
    /(^|\/)build\//,
    /(^|\/)\.next\//,
    /(^|\/)\.nuxt\//,
    /(^|\/)coverage\//,
    /\.generated\.(ts|js)$/,
    /\.gen\.(ts|js)$/,
  ],
};

/**
 * 检测 ref 类型（分支名 vs commit SHA）
 */
export function detectRefType(ref: string): RefType {
  // commit SHA 匹配：7-40位十六进制
  if (/^[0-9a-f]{7,40}$/i.test(ref)) {
    return 'commit';
  }
  return 'branch';
}

/**
 * 判断 diff 策略
 * 分支对比用三路 diff (three-dot: origin/target...origin/source)
 * commit 对比用两路 diff (two-dot: target..source)
 */
export function determineDiffStrategy(
  source_ref: string,
  target_ref: string,
): DiffStrategy {
  const sourceType = detectRefType(source_ref);
  const targetType = detectRefType(target_ref);

  // 两者都是 commit 时用两路 diff
  if (sourceType === 'commit' && targetType === 'commit') {
    return 'two-dot';
  }

  // 否则用三路 diff（分支对比或混合对比）
  return 'three-dot';
}

/**
 * 对文件路径进行分类
 */
export function categorizeFile(filePath: string): FileCategory {
  // 规范化路径
  const normalizedPath = filePath.replace(/\\/g, '/');

  // 按优先级检查各分类
  const categoryOrder: FileCategory[] = [
    'generated',
    'lock',
    'source',
    'config',
    'data',
    'asset',
  ];

  for (const category of categoryOrder) {
    const patterns = FILE_CATEGORIES[category];
    for (const pattern of patterns) {
      if (pattern.test(normalizedPath)) {
        return category;
      }
    }
  }

  // 默认归类为 asset
  return 'asset';
}

/**
 * 检测是否为纯空白变更
 */
export function isWhitespaceOnlyChange(diffContent: string): boolean {
  // 移除所有空白字符后检查是否为空
  const nonWhitespace = diffContent.replace(/\s/g, '');
  return nonWhitespace.length === 0;
}

/**
 * 解析 unified diff 格式的单个 hunk
 *
 * Hunk 头部格式: @@ -old_start,old_count +new_start,new_count @@
 */
function parseDiffHunk(headerLine: string): DiffHunk | null {
  const match = headerLine.match(
    /^@@\s+-(\d+)(?:,(\d+))?\s+\+(\d+)(?:,(\d+))?\s+@@/,
  );
  if (!match) {
    return null;
  }

  const old_start = Number.parseInt(match[1] || '0', 10);
  const old_count = match[2] ? Number.parseInt(match[2], 10) : 1;
  const new_start = Number.parseInt(match[3] || '0', 10);
  const new_count = match[4] ? Number.parseInt(match[4], 10) : 1;

  return {
    old_start,
    old_count,
    new_start,
    new_count,
    content: '', // 将在后续填充
  };
}

/**
 * 解析 unified diff 格式
 */
export function parseUnifiedDiff(diffText: string): DiffFile[] {
  const files: DiffFile[] = [];
  const lines = diffText.split('\n');

  let currentFile: Partial<DiffFile> | null = null;
  let currentHunk: DiffHunk | null = null;
  let hunkContent: string[] = [];
  let fileDiffContent: string[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!line) continue;

    // 文件头部: diff --git a/file b/file
    if (line.startsWith('diff --git')) {
      // 保存上一个文件
      if (currentFile && currentFile.path) {
        if (currentHunk) {
          currentHunk.content = hunkContent.join('\n');
          if (!currentFile.hunks) currentFile.hunks = [];
          currentFile.hunks.push(currentHunk);
        }
        currentFile.diff_content = fileDiffContent.join('\n');
        currentFile.is_whitespace_only = isWhitespaceOnlyChange(
          fileDiffContent.join('\n'),
        );
        currentFile.category = categorizeFile(currentFile.path);
        files.push(currentFile as DiffFile);
      }

      // 解析新文件
      const match = line.match(/diff --git\s+(?:a\/)?(.+?)\s+(?:b\/)?(.+)/);
      if (match?.[1] && match?.[2]) {
        currentFile = {
          path: match[2],
          old_path: match[1] !== match[2] ? match[1] : undefined,
          change_type: 'modified',
          hunks: [],
          diff_content: '',
          is_whitespace_only: false,
          category: 'source',
        };
        currentHunk = null;
        hunkContent = [];
        fileDiffContent = [];
      }
      continue;
    }

    // 变更类型指示器
    if (line.startsWith('new file') || line.startsWith('new mode')) {
      if (currentFile) currentFile.change_type = 'added';
      continue;
    }
    if (line.startsWith('deleted file') || line.startsWith('old mode')) {
      if (currentFile) currentFile.change_type = 'deleted';
      continue;
    }
    if (line.startsWith('rename from') || line.startsWith('rename to')) {
      if (currentFile) currentFile.change_type = 'renamed';
      continue;
    }

    // Hunk 头部
    if (line.startsWith('@@')) {
      // 保存上一个 hunk
      if (currentHunk && currentFile) {
        currentHunk.content = hunkContent.join('\n');
        if (!currentFile.hunks) currentFile.hunks = [];
        currentFile.hunks.push(currentHunk);
      }

      // 解析新 hunk
      currentHunk = parseDiffHunk(line);
      hunkContent = [];
      continue;
    }

    // 文件路径指示器（某些 diff 格式使用 ---/+++ 作为文件名）
    if (line.startsWith('---') || line.startsWith('+++')) {
      continue;
    }

    // 收集 diff 内容
    if (
      currentFile &&
      (line.startsWith('+') || line.startsWith('-') || line.startsWith(' '))
    ) {
      fileDiffContent.push(line);
      if (currentHunk) {
        hunkContent.push(line);
      }
    }
  }

  // 保存最后一个文件
  if (currentFile && currentFile.path) {
    if (currentHunk) {
      currentHunk.content = hunkContent.join('\n');
      if (!currentFile.hunks) currentFile.hunks = [];
      currentFile.hunks.push(currentHunk);
    }
    currentFile.diff_content = fileDiffContent.join('\n');
    currentFile.is_whitespace_only = isWhitespaceOnlyChange(
      fileDiffContent.join('\n'),
    );
    currentFile.category = categorizeFile(currentFile.path);
    files.push(currentFile as DiffFile);
  }

  return files;
}

/**
 * 构建 git diff 命令
 */
function buildDiffCommand(
  source_ref: string,
  target_ref: string,
  strategy: DiffStrategy,
  repoPath: string,
): string {
  const range =
    strategy === 'three-dot'
      ? `origin/${target_ref}...origin/${source_ref}`
      : `${target_ref}..${source_ref}`;

  return `cd "${repoPath}" && git diff ${range} --unified=5`;
}

/**
 * 获取 git diff
 */
export async function getDiff(options: DiffOptions): Promise<DiffResult> {
  const { repo_path, source_ref, target_ref } = options;

  // 验证仓库路径
  if (!fs.existsSync(path.join(repo_path, '.git'))) {
    throw new Error(`不是有效的 Git 仓库: ${repo_path}`);
  }

  // 确定策略
  const strategy = determineDiffStrategy(source_ref, target_ref);
  const ref_type = detectRefType(source_ref);

  // 构建 diff 命令
  const command = buildDiffCommand(source_ref, target_ref, strategy, repo_path);

  try {
    const raw_diff = execSync(command, {
      encoding: 'utf-8',
      maxBuffer: 10 * 1024 * 1024, // 10MB
    });

    // 解析 diff
    const files = parseUnifiedDiff(raw_diff);

    return {
      files,
      raw_diff,
      strategy,
      ref_type,
    };
  } catch (error) {
    if (error instanceof Error) {
      throw new Error(`获取 diff 失败: ${error.message}`);
    }
    throw new Error('获取 diff 失败: 未知错误');
  }
}

/**
 * 获取特定文件的 diff
 */
export async function getFileDiff(
  repoPath: string,
  source_ref: string,
  target_ref: string,
  filePath: string,
): Promise<string> {
  const strategy = determineDiffStrategy(source_ref, target_ref);
  const range =
    strategy === 'three-dot'
      ? `origin/${target_ref}...origin/${source_ref}`
      : `${target_ref}..${source_ref}`;

  const command = `cd "${repoPath}" && git diff ${range} --unified=5 -- "${filePath}"`;

  try {
    return execSync(command, {
      encoding: 'utf-8',
      maxBuffer: 10 * 1024 * 1024,
    });
  } catch (error) {
    if (error instanceof Error) {
      throw new Error(`获取文件 diff 失败: ${error.message}`);
    }
    throw new Error('获取文件 diff 失败: 未知错误');
  }
}
