/**
 * status 命令测试
 * @see .SPEC/1-requirement/merge-decision.md §6
 */

import { describe, it, expect } from 'vitest';
import {
  generateMergeDecision,
  parseSeverity,
  isBlockingIssue,
} from '../merge-decision.js';
import type { IssueStatusResult } from '../../types/plugin.js';
import type { Severity } from '../../types/core.js';

describe('merge-decision', () => {
  describe('parseSeverity', () => {
    it('应该解析有效的 severity 值', () => {
      expect(parseSeverity('critical')).toBe('critical');
      expect(parseSeverity('error')).toBe('error');
      expect(parseSeverity('warning')).toBe('warning');
      expect(parseSeverity('suggestion')).toBe('suggestion');
    });

    it('应该拒绝无效的 severity 值', () => {
      expect(parseSeverity('invalid')).toBeUndefined();
      expect(parseSeverity('')).toBeUndefined();
      expect(parseSeverity('CRITICAL')).toBeUndefined();
    });
  });

  describe('isBlockingIssue', () => {
    it('当没有设置 allow_severity 时，所有 issue 都是 blocking', () => {
      expect(isBlockingIssue('critical')).toBe(true);
      expect(isBlockingIssue('error')).toBe(true);
      expect(isBlockingIssue('warning')).toBe(true);
      expect(isBlockingIssue('suggestion')).toBe(true);
    });

    it('当 allow_severity=suggestion 时，只有 suggestion 不是 blocking', () => {
      expect(isBlockingIssue('critical', 'suggestion')).toBe(true);
      expect(isBlockingIssue('error', 'suggestion')).toBe(true);
      expect(isBlockingIssue('warning', 'suggestion')).toBe(true);
      expect(isBlockingIssue('suggestion', 'suggestion')).toBe(false);
    });

    it('当 allow_severity=warning 时，warning 和 suggestion 不是 blocking', () => {
      expect(isBlockingIssue('critical', 'warning')).toBe(true);
      expect(isBlockingIssue('error', 'warning')).toBe(true);
      expect(isBlockingIssue('warning', 'warning')).toBe(false);
      expect(isBlockingIssue('suggestion', 'warning')).toBe(false);
    });

    it('当 allow_severity=error 时，error、warning、suggestion 不是 blocking', () => {
      expect(isBlockingIssue('critical', 'error')).toBe(true);
      expect(isBlockingIssue('error', 'error')).toBe(false);
      expect(isBlockingIssue('warning', 'error')).toBe(false);
      expect(isBlockingIssue('suggestion', 'error')).toBe(false);
    });
  });

  describe('generateMergeDecision', () => {
    const createMockStatusResult = (
      issues: Array<{
        local_id: string;
        remote_id: string;
        is_closed: boolean;
        title: string;
      }>,
    ): IssueStatusResult => ({
      correlation_id: 'test-project:feature:main',
      issues: issues.map((i) => ({
        ...i,
        remote_status: i.is_closed ? 'Done' : 'Open',
      })),
      all_closed: issues.every((i) => i.is_closed),
      open_count: issues.filter((i) => !i.is_closed).length,
    });

    it('所有 issue 关闭时 can_merge=true', () => {
      const statusResult = createMockStatusResult([
        {
          local_id: 'sec-001',
          remote_id: 'PROJ-1',
          is_closed: true,
          title: 'SQL injection',
        },
        {
          local_id: 'log-002',
          remote_id: 'PROJ-2',
          is_closed: true,
          title: 'Null pointer',
        },
      ]);

      const severities = new Map<string, Severity>([
        ['PROJ-1', 'critical'],
        ['PROJ-2', 'error'],
      ]);

      const decision = generateMergeDecision(statusResult, severities);

      expect(decision.can_merge).toBe(true);
      expect(decision.open_issues).toBe(0);
      expect(decision.total_issues).toBe(2);
      expect(decision.issues).toHaveLength(2);
      expect(decision.issues[0]?.is_closed).toBe(true);
      expect(decision.issues[1]?.is_closed).toBe(true);
    });

    it('存在 open issue 时 can_merge=false（无 allow_severity）', () => {
      const statusResult = createMockStatusResult([
        {
          local_id: 'sec-001',
          remote_id: 'PROJ-1',
          is_closed: false,
          title: 'SQL injection',
        },
        {
          local_id: 'log-002',
          remote_id: 'PROJ-2',
          is_closed: true,
          title: 'Null pointer',
        },
      ]);

      const severities = new Map<string, Severity>([['PROJ-1', 'critical']]);

      const decision = generateMergeDecision(statusResult, severities);

      expect(decision.can_merge).toBe(false);
      expect(decision.open_issues).toBe(1);
      expect(decision.total_issues).toBe(2);
    });

    it('allow_severity=suggestion 时 suggestion 不阻止合并', () => {
      const statusResult = createMockStatusResult([
        {
          local_id: 'sty-001',
          remote_id: 'PROJ-1',
          is_closed: false,
          title: 'Rename variable',
        },
      ]);

      const severities = new Map<string, Severity>([['PROJ-1', 'suggestion']]);

      const decision = generateMergeDecision(
        statusResult,
        severities,
        'suggestion',
      );

      expect(decision.can_merge).toBe(true);
      expect(decision.allow_severity).toBe('suggestion');
    });

    it('allow_severity=warning 时 warning 和 suggestion 都不阻止合并', () => {
      const statusResult = createMockStatusResult([
        {
          local_id: 'sty-001',
          remote_id: 'PROJ-1',
          is_closed: false,
          title: 'Rename variable',
        },
        {
          local_id: 'perf-002',
          remote_id: 'PROJ-2',
          is_closed: false,
          title: 'N+1 query',
        },
      ]);

      const severities = new Map<string, Severity>([
        ['PROJ-1', 'suggestion'],
        ['PROJ-2', 'warning'],
      ]);

      const decision = generateMergeDecision(
        statusResult,
        severities,
        'warning',
      );

      expect(decision.can_merge).toBe(true);
      expect(decision.allow_severity).toBe('warning');
    });

    it('allow_severity=warning 时 error 仍然阻止合并', () => {
      const statusResult = createMockStatusResult([
        {
          local_id: 'sec-001',
          remote_id: 'PROJ-1',
          is_closed: false,
          title: 'SQL injection',
        },
      ]);

      const severities = new Map<string, Severity>([['PROJ-1', 'error']]);

      const decision = generateMergeDecision(
        statusResult,
        severities,
        'warning',
      );

      expect(decision.can_merge).toBe(false);
    });

    it('应该正确统计 open 和 total issues', () => {
      const statusResult = createMockStatusResult([
        { local_id: '1', remote_id: 'PROJ-1', is_closed: false, title: 'A' },
        { local_id: '2', remote_id: 'PROJ-2', is_closed: true, title: 'B' },
        { local_id: '3', remote_id: 'PROJ-3', is_closed: false, title: 'C' },
        { local_id: '4', remote_id: 'PROJ-4', is_closed: true, title: 'D' },
      ]);

      const severities = new Map<string, Severity>();

      const decision = generateMergeDecision(statusResult, severities);

      expect(decision.total_issues).toBe(4);
      expect(decision.open_issues).toBe(2);
    });

    it('应该包含正确的 issue 信息', () => {
      const statusResult = createMockStatusResult([
        {
          local_id: 'sec-001',
          remote_id: 'PROJ-123',
          is_closed: false,
          title: 'SQL injection vulnerability',
        },
      ]);

      const severities = new Map<string, Severity>([['PROJ-123', 'critical']]);

      const decision = generateMergeDecision(statusResult, severities);

      expect(decision.issues).toHaveLength(1);
      const issue = decision.issues[0];
      expect(issue?.id).toBe('sec-001');
      expect(issue?.remote_id).toBe('PROJ-123');
      expect(issue?.is_closed).toBe(false);
      expect(issue?.severity).toBe('critical');
      expect(issue?.title).toBe('SQL injection vulnerability');
    });

    it('当 severity 映射不存在时默认为 error', () => {
      const statusResult = createMockStatusResult([
        {
          local_id: 'unknown-001',
          remote_id: 'PROJ-999',
          is_closed: false,
          title: 'Unknown issue',
        },
      ]);

      const severities = new Map<string, Severity>();

      const decision = generateMergeDecision(statusResult, severities);

      expect(decision.issues[0]?.severity).toBe('error');
    });
  });
});
