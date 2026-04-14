/**
 * Git Worktree 模块测试
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {
  getRepoName,
  generateWorktreeName,
  getWorktreePath,
  isLockfileStale,
} from '../worktree.js';

describe('worktree 工具函数', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = path.join(os.tmpdir(), `sheepdog-test-${Date.now()}`);
    mkdirSync(tempDir, { recursive: true });
  });

  afterEach(() => {
    try {
      rmSync(tempDir, { recursive: true, force: true });
    } catch {
      // 忽略清理错误
    }
  });

  describe('getRepoName', () => {
    it('应该从目录名获取仓库名', () => {
      const repoPath = path.join(tempDir, 'test-repo');
      expect(getRepoName(repoPath)).toBe('test-repo');
    });

    it('应该处理嵌套路径', () => {
      const repoPath = path.join(tempDir, 'nested', 'path', 'my-project');
      expect(getRepoName(repoPath)).toBe('my-project');
    });
  });

  describe('generateWorktreeName', () => {
    it('应该生成基本的 worktree 名称', () => {
      expect(generateWorktreeName('myrepo', 'main')).toBe('myrepo_main');
    });

    it('应该处理分支名中的特殊字符', () => {
      expect(generateWorktreeName('myrepo', 'feature/test-branch')).toBe(
        'myrepo_feature_test_branch',
      );
      expect(generateWorktreeName('myrepo', 'bugfix/issue-123')).toBe(
        'myrepo_bugfix_issue_123',
      );
    });

    it('应该处理 ref 中的斜杠', () => {
      expect(generateWorktreeName('myrepo', 'origin/main')).toBe(
        'myrepo_origin_main',
      );
      expect(generateWorktreeName('myrepo', 'refs/heads/main')).toBe(
        'myrepo_refs_heads_main',
      );
    });
  });

  describe('getWorktreePath', () => {
    it('应该生成正确的 worktree 路径', () => {
      const worktreeDir = path.join(tempDir, 'worktrees');
      const result = getWorktreePath(worktreeDir, 'myrepo', 'main');
      expect(result).toBe(path.join(worktreeDir, 'myrepo_main'));
    });
  });

  describe('isLockfileStale', () => {
    it('不存在的锁文件应该是过期的', () => {
      const lockfilePath = path.join(tempDir, 'nonexistent.lock');
      expect(isLockfileStale(lockfilePath)).toBe(true);
    });

    it('无效的锁文件内容应该是过期的', () => {
      const lockfilePath = path.join(tempDir, 'invalid.lock');
      mkdirSync(tempDir, { recursive: true });
      // 创建无效的 JSON 文件
      writeFileSync(lockfilePath, 'invalid json', 'utf-8');
      expect(isLockfileStale(lockfilePath)).toBe(true);
    });
  });
});
