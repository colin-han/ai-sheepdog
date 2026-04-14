/**
 * Phase 0: 测试工具测试
 */
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import {
  createTestRepo,
  cleanupTestRepo,
  createBranchWithChanges,
  createMockAgentOutput,
  createTestReviewReport,
  createTestDiffFile,
} from '../../test-utils/index.js';

describe('Phase 0: Test Utilities', () => {
  describe('0.13 createTestRepo()', () => {
    it('should create a git repo with expected files', () => {
      const repoPath = createTestRepo();

      try {
        expect(fs.existsSync(path.join(repoPath, '.git'))).toBe(true);
        expect(fs.existsSync(path.join(repoPath, 'src', 'index.ts'))).toBe(
          true,
        );
        expect(fs.existsSync(path.join(repoPath, 'package.json'))).toBe(true);
        expect(fs.existsSync(path.join(repoPath, 'tsconfig.json'))).toBe(true);
        expect(fs.existsSync(path.join(repoPath, 'README.md'))).toBe(true);
      } finally {
        cleanupTestRepo(repoPath);
      }
    });

    it('should support custom files', () => {
      const repoPath = createTestRepo({
        'src/custom.ts': 'export const custom = true;',
      });

      try {
        expect(fs.existsSync(path.join(repoPath, 'src', 'custom.ts'))).toBe(
          true,
        );
        expect(
          fs.readFileSync(path.join(repoPath, 'src', 'custom.ts'), 'utf-8'),
        ).toBe('export const custom = true;');
      } finally {
        cleanupTestRepo(repoPath);
      }
    });
  });

  describe('0.14 createTestDiff()', () => {
    it('should create a branch with changes', () => {
      const repoPath = createTestRepo();

      try {
        createBranchWithChanges(repoPath, 'feature-test', {
          'src/index.ts':
            'export function hello(): string {\n  return "hello world";\n}\n',
        });

        // Verify branch exists
        expect(fs.existsSync(path.join(repoPath, 'src', 'index.ts'))).toBe(
          true,
        );
      } finally {
        cleanupTestRepo(repoPath);
      }
    });
  });

  describe('0.15 createMockAgentOutput()', () => {
    it('should produce output matching Agent output format', () => {
      const output = createMockAgentOutput('security-reviewer');

      expect(output).toHaveLength(1);
      expect(output[0]).toHaveProperty('id', 'sec-001');
      expect(output[0]).toHaveProperty('source_agent', 'security-reviewer');
      expect(output[0]).toHaveProperty('category');
      expect(output[0]).toHaveProperty('severity');
      expect(output[0]).toHaveProperty('title');
      expect(output[0]).toHaveProperty('validation_status');
    });

    it('should support custom issues', () => {
      const output = createMockAgentOutput('logic-reviewer', [
        {
          file: 'src/logic.ts',
          category: 'logic',
          severity: 'warning',
          title: 'Potential null reference',
        },
      ]);

      expect(output).toHaveLength(1);
      expect(output[0]?.['title']).toBe('Potential null reference');
    });
  });

  describe('0.16 createTestReviewReport()', () => {
    it('should produce output matching ReviewReport interface', () => {
      const report = createTestReviewReport();

      expect(report).toHaveProperty('summary');
      expect(report).toHaveProperty('risk_level');
      expect(report).toHaveProperty('issues');
      expect(report).toHaveProperty('metrics');
      expect(report).toHaveProperty('metadata');
      expect(report.issues).toHaveLength(2);
      expect(report.metadata.correlation_id).toBe(
        'test-project:feature-branch:main',
      );
    });

    it('should support overrides', () => {
      const report = createTestReviewReport({
        risk_level: 'low',
        issues: [],
      });

      expect(report.risk_level).toBe('low');
      expect(report.issues).toHaveLength(0);
    });
  });

  describe('createTestDiffFile()', () => {
    it('should produce output matching DiffFile interface', () => {
      const diffFile = createTestDiffFile();

      expect(diffFile).toHaveProperty('path', 'src/test.ts');
      expect(diffFile).toHaveProperty('change_type', 'modified');
      expect(diffFile).toHaveProperty('category', 'source');
      expect(diffFile).toHaveProperty('hunks');
      expect(diffFile.hunks).toHaveLength(1);
    });
  });
});
