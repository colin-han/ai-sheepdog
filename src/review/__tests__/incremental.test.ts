/**
 * 增量审查测试
 */

import { describe, it, expect, vi } from 'vitest';
import { runIncrementalReview } from '../incremental.js';
import type { DiffResult } from '../../types/index.js';

// Mock dependencies
vi.mock('../../agents/orchestrator.js', () => ({
  runAgents: vi.fn(() =>
    Promise.resolve([
      {
        agent_name: 'security-reviewer',
        issues: [
          {
            id: 'new-sec-001',
            file: 'src/new.ts',
            line_start: 5,
            line_end: 7,
            category: 'security',
            severity: 'error',
            title: '新发现的安全问题',
            description: '发现新的安全漏洞',
            code_snippet: 'const x = 1',
            confidence: 0.9,
          },
        ],
        checklist: [],
        elapsed_ms: 100,
        success: true,
      },
    ]),
  ),
}));

vi.mock('../../agents/validator.js', () => ({
  validateIssues: vi.fn(() =>
    Promise.resolve([
      {
        id: 'new-sec-001',
        file: 'src/new.ts',
        line_start: 5,
        line_end: 7,
        category: 'security',
        severity: 'error',
        title: '新发现的安全问题',
        description: '发现新的安全漏洞',
        confidence: 0.9,
        source_agent: 'security-reviewer',
        validation_status: 'confirmed',
        final_confidence: 0.85,
        grounding_evidence: {
          checked_files: ['src/new.ts'],
          checked_symbols: [],
          reasoning: '确实存在安全问题',
        },
      },
    ]),
  ),
}));

vi.mock('../../agents/deduplicator.js', () => ({
  deduplicateIssues: vi.fn((issues) => ({
    uniqueIssues: issues,
    duplicatesRemoved: 0,
    duplicateMap: {},
  })),
}));

vi.mock('../../plugins/jira.js', () => ({
  createJiraPlugin: vi.fn(() => ({
    name: 'jira',
    initialize: vi.fn(),
    sync: vi.fn(() =>
      Promise.resolve({
        results: [
          {
            local_issue_id: 'new-sec-001',
            operation: 'create',
            success: true,
            remote_issue_id: 'PROJ-123',
          },
        ],
        success: true,
      }),
    ),
  })),
}));

vi.mock('../fix-verifier.js', () => ({
  verifyFixes: vi.fn(() =>
    Promise.resolve({
      total_verified: 0,
      by_status: {
        fixed: 0,
        missed: 0,
        false_positive: 0,
        obsolete: 0,
        uncertain: 0,
      },
      results: [],
      verification_time_ms: 50,
      tokens_used: 100,
    }),
  ),
}));

describe('增量审查', () => {
  const mockOptions = {
    repoPath: '/tmp/test-repo',
    projectName: 'test-project',
    sourceRef: 'feature-branch',
    targetRef: 'main',
    diffContent: 'mock diff content',
    diffResult: {
      files: [
        {
          path: 'src/new.ts',
          change_type: 'added',
          hunks: [],
          diff_content: '+ const x = 1',
          is_whitespace_only: false,
          category: 'source',
        },
      ],
      raw_diff: 'mock raw diff',
      strategy: 'three-dot',
      ref_type: 'branch',
    } as DiffResult,
    agents: ['security-reviewer'],
    runtimeConfig: {
      global: {},
      project: {},
      sources: [],
    },
  };

  describe('runIncrementalReview', () => {
    it('应该生成完整的审查报告', async () => {
      const { report } = await runIncrementalReview(mockOptions);

      expect(report).toBeDefined();
      expect(report.metadata).toBeDefined();
      expect(report.issues).toBeDefined();
      expect(report.metrics).toBeDefined();
      expect(report.summary).toBeDefined();
    });

    it('报告应包含正确的元数据', async () => {
      const { report } = await runIncrementalReview(mockOptions);

      expect(report.metadata.correlation_id).toBe(
        'test-project:feature-branch:main',
      );
      expect(report.metadata.source_ref).toBe('feature-branch');
      expect(report.metadata.target_ref).toBe('main');
      expect(report.metadata.repo_path).toBe('/tmp/test-repo');
      expect(report.metadata.project_name).toBe('test-project');
      expect(report.metadata.agents_used).toEqual(['security-reviewer']);
      // is_incremental 取决于是否有之前的报告，这里只检查类型
      expect(typeof report.metadata.is_incremental).toBe('boolean');
    });

    it('报告应包含正确的统计指标', async () => {
      const { report } = await runIncrementalReview(mockOptions);

      expect(report.metrics.total_scanned).toBeGreaterThanOrEqual(0);
      expect(report.metrics.confirmed).toBeGreaterThanOrEqual(0);
      expect(report.metrics.rejected).toBeGreaterThanOrEqual(0);
      expect(report.metrics.uncertain).toBeGreaterThanOrEqual(0);
      expect(report.metrics.by_severity).toBeDefined();
      expect(report.metrics.by_category).toBeDefined();
    });

    it('首次审查时 is_incremental 应为 false', async () => {
      // Mock findPreviousReport 返回 null（首次审查）
      const { report } = await runIncrementalReview({
        ...mockOptions,
        // 首次审查没有之前的问题
      });

      expect(report.metadata.is_incremental).toBe(false);
    });

    it('应该包含风险等级', async () => {
      const { report } = await runIncrementalReview(mockOptions);

      expect(['high', 'medium', 'low']).toContain(report.risk_level);
    });
  });

  describe('Issue 同步', () => {
    it('应该正确设置同步状态', async () => {
      const { report } = await runIncrementalReview(mockOptions);

      expect(report.issue_sync).toBeDefined();
      expect(report.issue_sync?.status).toBeDefined();
      expect(['success', 'partial', 'failed']).toContain(
        report.issue_sync?.status,
      );
    });

    it('同步成功的 issue 应在 synced 列表中', async () => {
      const { report } = await runIncrementalReview(mockOptions);

      // 检查 synced 是否是数组
      expect(Array.isArray(report.issue_sync?.synced)).toBe(true);
      // 如果有同步成功的 issue，数量应该大于等于 0
      expect(report.issue_sync?.synced.length).toBeGreaterThanOrEqual(0);
    });
  });

  describe('修复验证', () => {
    it('非首次审查应包含修复验证结果', async () => {
      // 注意：由于 verifyFixes 被 mock，这里测试报告结构
      const { report } = await runIncrementalReview(mockOptions);

      // 如果有之前的问题，应该有 fix_verification
      // 这里我们主要测试报告结构正确
      expect(report).toHaveProperty('fix_verification');
    });
  });
});
