/**
 * formatters 测试
 */

import { describe, it, expect } from 'vitest';
import { formatStatusOutput, formatJsonOutput } from '../formatters.js';
import type { MergeDecision } from '../../types/report.js';

describe('formatters', () => {
  const createMockDecision = (
    overrides: Partial<MergeDecision> = {},
  ): MergeDecision => ({
    correlation_id: 'test-project:feature:main',
    can_merge: true,
    open_issues: 0,
    total_issues: 2,
    issues: [
      {
        id: 'sec-001',
        is_closed: true,
        severity: 'critical',
        title: 'SQL injection',
      },
      {
        id: 'sty-002',
        is_closed: true,
        severity: 'suggestion',
        title: 'Rename variable',
      },
    ],
    ...overrides,
  });

  describe('formatStatusOutput', () => {
    it('应该格式化通过状态', () => {
      const decision = createMockDecision({
        can_merge: true,
        open_issues: 0,
      });

      const output = formatStatusOutput(decision);

      expect(output).toContain('@ AI Sheepdog - Status Check');
      expect(output).toContain('Repo:    test-project');
      expect(output).toContain('Branch:  feature → main');
      expect(output).toContain('0 blocking / 0 open / 2 total');
      expect(output).toContain('Status: PASS');
    });

    it('应该格式化阻塞状态', () => {
      const decision = createMockDecision({
        can_merge: false,
        open_issues: 1,
        total_issues: 1,
        issues: [
          {
            id: 'sec-001',
            is_closed: false,
            severity: 'critical',
            title: 'SQL injection',
          },
        ],
      });

      const output = formatStatusOutput(decision);

      expect(output).toContain('1 blocking / 1 open / 1 total');
      expect(output).toContain('Status: BLOCKED');
      expect(output).toContain('1 blocking issue(s) must be resolved');
    });

    it('应该显示 ignored 标记', () => {
      const decision = createMockDecision({
        can_merge: true,
        allow_severity: 'warning',
        issues: [
          {
            id: 'sty-001',
            is_closed: false,
            severity: 'suggestion',
            title: 'Code style',
          },
          {
            id: 'sec-002',
            is_closed: false,
            severity: 'critical',
            title: 'Security issue',
          },
        ],
      });

      const output = formatStatusOutput(decision);

      // suggestion 应该被标记为 ignored
      expect(output).toContain('sty-001');
      expect(output).toContain('← ignored');
    });

    it('应该正确显示 issue 状态', () => {
      const decision = createMockDecision({
        can_merge: true,
        open_issues: 1,
        total_issues: 2,
        issues: [
          {
            id: 'sec-001',
            is_closed: true,
            severity: 'critical',
            title: 'SQL injection',
          },
          {
            id: 'log-002',
            is_closed: false,
            severity: 'suggestion',
            title: 'Null pointer',
          },
        ],
      });

      const output = formatStatusOutput(decision);

      expect(output).toContain('[CLOSED]');
      // OPEN 是右对齐的，所以格式是 "[  OPEN]"
      expect(output).toContain('OPEN]');
    });
  });

  describe('formatJsonOutput', () => {
    it('应该输出有效的 JSON', () => {
      const decision = createMockDecision();

      const output = formatJsonOutput(decision);
      const parsed = JSON.parse(output);

      expect(parsed).toEqual(decision);
    });

    it('应该包含所有字段', () => {
      const decision = createMockDecision({
        allow_severity: 'warning',
      });

      const output = formatJsonOutput(decision);
      const parsed = JSON.parse(output) as MergeDecision;

      expect(parsed.correlation_id).toBe('test-project:feature:main');
      expect(parsed.can_merge).toBe(true);
      expect(parsed.allow_severity).toBe('warning');
      expect(parsed.issues).toHaveLength(2);
    });
  });
});
