/**
 * 修复验证 Agent 测试
 */

import { describe, it, expect } from 'vitest';
import { verifyFixes } from '../fix-verifier.js';
import type { ValidatedIssue } from '../../types/index.js';

describe('fix-verifier', () => {
  const mockRepoPath = '/tmp/test-repo';
  const mockDiffContent = `
diff --git a/src/test.ts b/src/test.ts
index abc123..def456 100644
--- a/src/test.ts
+++ b/src/test.ts
@@ -1,5 +1,5 @@
-export function foo() {
+export function bar() {
   return 42;
 }
`;

  const mockPreviousIssues: ValidatedIssue[] = [
    {
      id: 'sec-001',
      file: 'src/test.ts',
      line_start: 1,
      line_end: 3,
      category: 'security',
      severity: 'error',
      title: '函数命名不规范',
      description: '函数名应该使用更具描述性的名称',
      suggestion: '重命名函数为更具体的名称',
      confidence: 0.8,
      source_agent: 'security-reviewer',
      validation_status: 'confirmed',
      final_confidence: 0.8,
      grounding_evidence: {
        checked_files: ['src/test.ts'],
        checked_symbols: [],
        reasoning: '函数名过于简单',
      },
    },
    {
      id: 'style-001',
      file: 'src/other.ts',
      line_start: 10,
      line_end: 12,
      category: 'style',
      severity: 'warning',
      title: '代码风格问题',
      description: '缩进不一致',
      suggestion: '统一使用 2 空格缩进',
      confidence: 0.9,
      source_agent: 'style-reviewer',
      validation_status: 'confirmed',
      final_confidence: 0.9,
      grounding_evidence: {
        checked_files: ['src/other.ts'],
        checked_symbols: [],
        reasoning: '缩进使用 4 空格',
      },
    },
  ];

  describe('verifyFixes', () => {
    it('空问题列表应返回空结果', async () => {
      const result = await verifyFixes([], mockDiffContent, [], {
        repoPath: mockRepoPath,
      });

      expect(result.total_verified).toBe(0);
      expect(result.results).toHaveLength(0);
      expect(result.by_status.fixed).toBe(0);
      expect(result.by_status.missed).toBe(0);
    });

    it('应该正确统计验证结果', async () => {
      // 注意：这个测试需要 mock LLM 调用，实际测试可能需要使用测试工具
      const result = await verifyFixes(
        mockPreviousIssues,
        mockDiffContent,
        [],
        {
          repoPath: mockRepoPath,
          llmConfig: {
            // 使用测试环境的配置
            authToken: 'test-token',
          },
        },
      );

      // 验证基本结构
      expect(result.total_verified).toBe(2);
      expect(result.results).toHaveLength(2);
      expect(result.verification_time_ms).toBeGreaterThanOrEqual(0);

      // 验证每个结果的结构
      for (const r of result.results) {
        expect(r).toHaveProperty('original_issue_id');
        expect(r).toHaveProperty('status');
        expect(r).toHaveProperty('confidence');
        expect(r).toHaveProperty('evidence');
        expect(r.evidence).toHaveProperty('checked_files');
        expect(r.evidence).toHaveProperty('reasoning');
      }
    });

    it('验证状态应在有效范围内', async () => {
      const validStatuses = [
        'fixed',
        'missed',
        'false_positive',
        'obsolete',
        'uncertain',
      ];

      const result = await verifyFixes(
        mockPreviousIssues,
        mockDiffContent,
        [],
        {
          repoPath: mockRepoPath,
          llmConfig: {
            authToken: 'test-token',
          },
        },
      );

      for (const r of result.results) {
        expect(validStatuses).toContain(r.status);
      }
    });

    it('置信度应在 0-1 之间', async () => {
      const result = await verifyFixes(
        mockPreviousIssues,
        mockDiffContent,
        [],
        {
          repoPath: mockRepoPath,
          llmConfig: {
            authToken: 'test-token',
          },
        },
      );

      for (const r of result.results) {
        expect(r.confidence).toBeGreaterThanOrEqual(0);
        expect(r.confidence).toBeLessThanOrEqual(1);
      }
    });
  });

  describe('验证结果映射', () => {
    it('fixed 状态应关联已修复的问题', async () => {
      // 测试已修复问题的检测逻辑
      const result = await verifyFixes(
        mockPreviousIssues,
        mockDiffContent,
        [],
        {
          repoPath: mockRepoPath,
          llmConfig: {
            authToken: 'test-token',
          },
        },
      );

      const fixedIssues = result.results.filter((r) => r.status === 'fixed');
      for (const issue of fixedIssues) {
        expect(mockPreviousIssues.map((i) => i.id)).toContain(
          issue.original_issue_id,
        );
      }
    });

    it('missed 状态应关联未修复的问题', async () => {
      const result = await verifyFixes(
        mockPreviousIssues,
        mockDiffContent,
        [],
        {
          repoPath: mockRepoPath,
          llmConfig: {
            authToken: 'test-token',
          },
        },
      );

      const missedIssues = result.results.filter((r) => r.status === 'missed');
      for (const issue of missedIssues) {
        expect(mockPreviousIssues.map((i) => i.id)).toContain(
          issue.original_issue_id,
        );
      }
    });
  });
});
