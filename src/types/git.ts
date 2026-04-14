/**
 * Git 操作类型
 * @see .SPEC/1-requirement/review.md §5.1
 * @see .SPEC/0-overall/glossary.md
 */
import type { FileCategory } from './core.js';

/** Ref 类型 */
export type RefType = 'branch' | 'commit';

/** Diff 策略 */
export type DiffStrategy = 'three-dot' | 'two-dot';

/** Diff 中的一个 hunk（变更块） */
export interface DiffHunk {
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
export interface DiffFile {
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
export interface DiffOptions {
  /** 仓库路径 */
  repo_path: string;
  /** 审查分支 */
  source_ref: string;
  /** 基准分支 */
  target_ref: string;
}

/** Diff 结果 */
export interface DiffResult {
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
export interface WorktreeInfo {
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
export interface WorktreeOptions {
  /** 仓库路径 */
  repo_path: string;
  /** 审查分支 */
  ref: string;
  /** worktree 存储根目录 */
  worktree_dir?: string;
}
