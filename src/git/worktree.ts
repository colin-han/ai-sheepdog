/**
 * Git Worktree 管理
 * @see .SPEC/1-requirement/review.md §5.1
 */

import { execSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { WorktreeInfo, WorktreeOptions } from '../types/index.js';

/** 默认 worktree 存储目录 */
const DEFAULT_WORKTREE_DIR = path.join(
  os.homedir(),
  '.cache',
  'sheepdog',
  'worktrees',
);

/** Lockfile 文件名 */
const LOCKFILE_NAME = '.sheepdog-worktree.lock';

/**
 * 解析仓库 URL 获取仓库名
 */
export function getRepoName(repoPath: string): string {
  try {
    const remoteUrl = execSync(
      'cd "$(git rev-parse --show-toplevel)" && git config --get remote.origin.url',
      {
        cwd: repoPath,
        encoding: 'utf-8',
        stdio: ['pipe', 'pipe', 'ignore'],
      },
    ).trim();

    // 从 URL 提取仓库名
    // git@github.com:user/repo.git -> repo
    // https://github.com/user/repo.git -> repo
    const match = remoteUrl.match(/\/([^/]+?)(\.git)?$/);
    if (match?.[1]) {
      return match[1];
    }
  } catch {
    // 如果获取失败，使用目录名
  }

  return path.basename(path.resolve(repoPath));
}

/**
 * 生成 worktree 名称
 */
export function generateWorktreeName(repoName: string, ref: string): string {
  // ref 中的特殊字符替换为下划线
  const sanitizedRef = ref.replace(/[^a-zA-Z0-9]/g, '_');
  return `${repoName}_${sanitizedRef}`;
}

/**
 * 获取 worktree 路径
 */
export function getWorktreePath(
  worktreeDir: string,
  repoName: string,
  ref: string,
): string {
  const worktreeName = generateWorktreeName(repoName, ref);
  return path.join(worktreeDir, worktreeName);
}

/**
 * 检查 worktree 是否有效
 */
function isValidWorktree(
  worktreePath: string,
  repoPath: string,
  _ref: string,
): boolean {
  try {
    // 检查目录是否存在
    if (!fs.existsSync(worktreePath)) {
      return false;
    }

    // 检查是否为有效的 git worktree
    execSync('git rev-parse --git-dir', {
      cwd: worktreePath,
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'ignore'],
    }).trim();

    // 检查 .git 文件内容是否指向主仓库
    const dotGitPath = path.join(worktreePath, '.git');
    let dotGitContent: string;
    try {
      dotGitContent = fs.readFileSync(dotGitPath, 'utf-8');
    } catch {
      return false;
    }

    // .git 文件格式: gitdir: /path/to/main/.git/worktrees/xxx
    const gitDirMatch = dotGitContent.match(/gitdir:\s*(.+)/);
    if (!gitDirMatch) {
      return false;
    }

    const worktreeGitDir = gitDirMatch[1]?.trim();
    if (!worktreeGitDir) {
      return false;
    }
    const mainRepoGitDir = execSync('git rev-parse --git-dir', {
      cwd: repoPath,
      encoding: 'utf-8',
    }).trim();

    // 检查 worktree 是否属于主仓库
    if (!worktreeGitDir.startsWith(mainRepoGitDir)) {
      return false;
    }

    // 检查 HEAD 是否指向正确的 ref
    execSync('git rev-parse --abbrev-ref HEAD', {
      cwd: worktreePath,
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'ignore'],
    }).trim();

    // 允许 HEAD 指向分支名或 detached HEAD 状态
    // 如果是分支名，应该匹配；如果是 detached，我们接受它
    return true;
  } catch {
    return false;
  }
}

/**
 * 创建 worktree lockfile
 */
function createLockfile(lockfilePath: string): void {
  const lockContent = {
    pid: process.pid,
    created_at: new Date().toISOString(),
  };
  fs.writeFileSync(lockfilePath, JSON.stringify(lockContent, null, 2), 'utf-8');
}

/**
 * 释放 lockfile
 */
function releaseLockfile(lockfilePath: string): void {
  try {
    if (fs.existsSync(lockfilePath)) {
      fs.unlinkSync(lockfilePath);
    }
  } catch {
    // 忽略释放失败的错误
  }
}

/**
 * 检查 lockfile 是否被占用
 */
export function isLockfileStale(lockfilePath: string): boolean {
  try {
    if (!fs.existsSync(lockfilePath)) {
      return true; // 不存在说明未被占用
    }

    const lockContent = JSON.parse(fs.readFileSync(lockfilePath, 'utf-8'));
    const pid = lockContent.pid;

    // 检查进程是否仍在运行
    try {
      process.kill(pid, 0); // 发送信号 0 检测进程是否存在
      return false; // 进程仍在运行，锁有效
    } catch {
      return true; // 进程不存在，锁已过期
    }
  } catch {
    return true;
  }
}

/**
 * 等待锁释放（带超时）
 */
async function waitForLock(
  lockfilePath: string,
  timeoutMs: number = 30000,
): Promise<void> {
  const startTime = Date.now();
  const intervalMs = 100;

  while (Date.now() - startTime < timeoutMs) {
    if (isLockfileStale(lockfilePath)) {
      // 尝试清理过期的锁
      try {
        fs.unlinkSync(lockfilePath);
      } catch {
        // 忽略清理失败
      }
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }

  throw new Error(`等待 worktree 锁超时 (${timeoutMs}ms)`);
}

/**
 * 创建或复用 worktree
 */
export async function createWorktree(
  options: WorktreeOptions,
): Promise<WorktreeInfo> {
  const { repo_path, ref, worktree_dir = DEFAULT_WORKTREE_DIR } = options;

  // 确保 worktree 目录存在
  if (!fs.existsSync(worktree_dir)) {
    fs.mkdirSync(worktree_dir, { recursive: true });
  }

  const repoName = getRepoName(repo_path);
  const worktreePath = getWorktreePath(worktree_dir, repoName, ref);
  const lockfilePath = path.join(
    worktree_dir,
    `${LOCKFILE_NAME}.${repoName}_${ref}`,
  );

  try {
    // 等待锁释放
    await waitForLock(lockfilePath);

    // 创建锁
    createLockfile(lockfilePath);

    // 检查是否可以复用现有 worktree
    if (isValidWorktree(worktreePath, repo_path, ref)) {
      // 更新 worktree 内容
      let updateSuccess = false;
      try {
        execSync(`git checkout ${ref}`, {
          cwd: worktreePath,
          encoding: 'utf-8',
          stdio: 'pipe',
        });
        execSync('git pull', {
          cwd: worktreePath,
          encoding: 'utf-8',
          stdio: 'pipe',
        });
        updateSuccess = true;
      } catch {
        // 如果更新失败，标记为不复用，后面会重新创建
      }

      if (updateSuccess) {
        return {
          path: worktreePath,
          ref,
          created_at: new Date(),
          reused: true,
        };
      }
    }

    // 删除旧的无效 worktree 目录
    if (fs.existsSync(worktreePath)) {
      fs.rmSync(worktreePath, { recursive: true, force: true });
    }

    // 获取主仓库路径
    const mainRepoPath = execSync('git rev-parse --show-toplevel', {
      cwd: repo_path,
      encoding: 'utf-8',
    }).trim();

    // 创建新 worktree
    const remoteRef = ref.includes('origin/') ? ref : `origin/${ref}`;
    execSync(`git worktree add ${worktreePath} ${remoteRef}`, {
      cwd: mainRepoPath,
      encoding: 'utf-8',
      stdio: 'pipe',
    });

    return {
      path: worktreePath,
      ref,
      created_at: new Date(),
      reused: false,
    };
  } finally {
    // 释放锁
    releaseLockfile(lockfilePath);
  }
}

/**
 * 清理 worktree
 */
export function removeWorktree(worktreePath: string, repoPath: string): void {
  try {
    const mainRepoPath = execSync('git rev-parse --show-toplevel', {
      cwd: repoPath,
      encoding: 'utf-8',
    }).trim();

    // 先使用 git worktree remove 命令
    execSync(`git worktree remove ${worktreePath}`, {
      cwd: mainRepoPath,
      encoding: 'utf-8',
      stdio: 'pipe',
    });
  } catch {
    // 如果 git 命令失败，手动删除目录
    try {
      if (fs.existsSync(worktreePath)) {
        fs.rmSync(worktreePath, { recursive: true, force: true });
      }
    } catch {
      // 忽略删除失败
    }
  }
}

/**
 * 清理过期的 worktree
 */
export function cleanupExpiredWorktrees(
  worktreeDir: string = DEFAULT_WORKTREE_DIR,
  maxAgeMs: number = 7 * 24 * 60 * 60 * 1000, // 默认 7 天
): void {
  if (!fs.existsSync(worktreeDir)) {
    return;
  }

  const now = Date.now();
  const entries = fs.readdirSync(worktreeDir, { withFileTypes: true });

  for (const entry of entries) {
    if (!entry.isDirectory()) {
      continue;
    }

    const worktreePath = path.join(worktreeDir, entry.name);

    try {
      const stats = fs.statSync(worktreePath);
      const age = now - stats.mtimeMs;

      if (age > maxAgeMs) {
        removeWorktree(worktreePath, worktreePath);
      }
    } catch {
      // 如果读取状态失败，尝试删除
      try {
        fs.rmSync(worktreePath, { recursive: true, force: true });
      } catch {
        // 忽略删除失败
      }
    }
  }
}

/**
 * 列出所有 worktree
 */
export function listWorktrees(
  repoPath: string,
): Array<{ path: string; ref: string }> {
  try {
    const output = execSync('git worktree list --porcelain', {
      cwd: repoPath,
      encoding: 'utf-8',
    });

    const worktrees: Array<{ path: string; ref: string }> = [];
    let currentPath = '';
    let currentRef = '';

    for (const line of output.split('\n')) {
      if (line.startsWith('worktree ')) {
        if (currentPath && currentRef) {
          worktrees.push({ path: currentPath, ref: currentRef });
        }
        currentPath = line.slice(9);
        currentRef = '';
      } else if (line.startsWith('HEAD ') && currentPath) {
        currentRef = line.slice(5);
      } else if (line.startsWith('branch ') && currentPath) {
        currentRef = line.slice(7);
      } else if (line === '' && currentPath && currentRef) {
        worktrees.push({ path: currentPath, ref: currentRef });
        currentPath = '';
        currentRef = '';
      }
    }

    if (currentPath && currentRef) {
      worktrees.push({ path: currentPath, ref: currentRef });
    }

    return worktrees;
  } catch {
    return [];
  }
}
