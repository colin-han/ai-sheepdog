/**
 * 报告生成器测试
 */

import { describe, it, expect } from 'vitest';
import {
  calculateRiskLevel,
  calculateMetrics,
  generateSummary,
} from '../generator.js';
import type { ValidatedIssue } from '../../types/index.js';

describe('calculateRiskLevel', () => {
  it('有 critical 应该返回 high', () => {
    const issues: ValidatedIssue[] = [
      {
        id: '1',
        file: 'test.ts',
        line_start: 1,
        line_end: 1,
        category: 'security',
        severity: 'critical',
        title: 'Test',
        description: 'Test',
        confidence: 0.9,
        source_agent: 'test',
        validation_status: 'confirmed',
        final_confidence: 0.9,
        grounding_evidence: {
          checked_files: [],
          checked_symbols: [],
          reasoning: 'test',
        },
      },
    ];
    expect(calculateRiskLevel(issues)).toBe('high');
  });

  it('有 error 应该返回 medium', () => {
    const issues: ValidatedIssue[] = [
      {
        id: '1',
        file: 'test.ts',
        line_start: 1,
        line_end: 1,
        category: 'logic',
        severity: 'error',
        title: 'Test',
        description: 'Test',
        confidence: 0.9,
        source_agent: 'test',
        validation_status: 'confirmed',
        final_confidence: 0.9,
        grounding_evidence: {
          checked_files: [],
          checked_symbols: [],
          reasoning: 'test',
        },
      },
    ];
    expect(calculateRiskLevel(issues)).toBe('medium');
  });

  it('只有 warning 和 suggestion 应该返回 low', () => {
    const issues: ValidatedIssue[] = [
      {
        id: '1',
        file: 'test.ts',
        line_start: 1,
        line_end: 1,
        category: 'style',
        severity: 'warning',
        title: 'Test',
        description: 'Test',
        confidence: 0.9,
        source_agent: 'test',
        validation_status: 'confirmed',
        final_confidence: 0.9,
        grounding_evidence: {
          checked_files: [],
          checked_symbols: [],
          reasoning: 'test',
        },
      },
    ];
    expect(calculateRiskLevel(issues)).toBe('low');
  });

  it('空列表应该返回 low', () => {
    expect(calculateRiskLevel([])).toBe('low');
  });
});

describe('calculateMetrics', () => {
  it('应该正确统计问题', () => {
    const issues: ValidatedIssue[] = [
      {
        id: '1',
        file: 'a.ts',
        line_start: 1,
        line_end: 1,
        category: 'security',
        severity: 'critical',
        title: 'Test',
        description: 'Test',
        confidence: 0.9,
        source_agent: 'test',
        validation_status: 'confirmed',
        final_confidence: 0.9,
        grounding_evidence: {
          checked_files: [],
          checked_symbols: [],
          reasoning: 'test',
        },
      },
      {
        id: '2',
        file: 'b.ts',
        line_start: 1,
        line_end: 1,
        category: 'logic',
        severity: 'error',
        title: 'Test',
        description: 'Test',
        confidence: 0.8,
        source_agent: 'test',
        validation_status: 'rejected',
        final_confidence: 0.8,
        grounding_evidence: {
          checked_files: [],
          checked_symbols: [],
          reasoning: 'test',
        },
      },
      {
        id: '3',
        file: 'a.ts',
        line_start: 2,
        line_end: 2,
        category: 'style',
        severity: 'warning',
        title: 'Test',
        description: 'Test',
        confidence: 0.7,
        source_agent: 'test',
        validation_status: 'uncertain',
        final_confidence: 0.7,
        grounding_evidence: {
          checked_files: [],
          checked_symbols: [],
          reasoning: 'test',
        },
      },
    ];

    const metrics = calculateMetrics(issues, 2);

    expect(metrics.total_scanned).toBe(3);
    expect(metrics.confirmed).toBe(1);
    expect(metrics.rejected).toBe(1);
    expect(metrics.uncertain).toBe(1);
    expect(metrics.by_severity.critical).toBe(1);
    expect(metrics.by_severity.error).toBe(1);
    expect(metrics.by_severity.warning).toBe(1);
    expect(metrics.by_category.security).toBe(1);
    expect(metrics.by_category.logic).toBe(1);
    expect(metrics.by_category.style).toBe(1);
    expect(metrics.files_reviewed).toBe(2);
  });
});

describe('generateSummary', () => {
  it('应该生成高风险摘要', () => {
    const metrics = {
      total_scanned: 10,
      confirmed: 5,
      rejected: 2,
      uncertain: 3,
      by_severity: {
        critical: 1,
        error: 2,
        warning: 1,
        suggestion: 1,
      },
      by_category: {
        security: 2,
        logic: 2,
        performance: 1,
        style: 0,
      },
      files_reviewed: 5,
    };

    const summary = generateSummary('high', metrics);
    expect(summary).toContain('高风险');
    expect(summary).toContain('确认 5 个问题');
  });
});
