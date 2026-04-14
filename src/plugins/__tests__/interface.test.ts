/**
 * 插件接口工具函数单元测试
 */

import { describe, it, expect } from 'vitest';
import {
  formatIssueDescription,
  formatCorrelationLabel,
  validateConfig,
  formatIssueTitle,
} from '../interface.js';
import type { ValidatedIssue } from '../../types/issue.js';

describe('Plugin Interface Utils', () => {
  const createMockIssue = (): ValidatedIssue => ({
    id: 'sec-001',
    file: '/path/to/file.ts',
    line_start: 10,
    line_end: 15,
    category: 'security',
    severity: 'critical',
    title: 'Test security issue',
    description: 'This is a test security issue description',
    suggestion: 'Fix the security vulnerability',
    code_snippet: 'const password = "123456";',
    confidence: 0.95,
    source_agent: 'security-reviewer',
    validation_status: 'confirmed',
    final_confidence: 0.9,
    grounding_evidence: {
      checked_files: ['/path/to/file.ts'],
      checked_symbols: [
        { name: 'password', file: '/path/to/file.ts', line: 10 },
      ],
      reasoning: 'Hardcoded password detected',
    },
  });

  describe('formatIssueDescription', () => {
    it('应该正确格式化完整的 issue 描述', () => {
      const issue = createMockIssue();
      const correlationId = 'my-project-feature-main';

      const description = formatIssueDescription(issue, correlationId);

      // 验证各个部分
      expect(description).toContain('## 问题描述');
      expect(description).toContain(
        'This is a test security issue description',
      );

      expect(description).toContain('## 代码位置');
      expect(description).toContain('文件: /path/to/file.ts');
      expect(description).toContain('行号: 10 - 15');

      expect(description).toContain('## 问题代码');
      expect(description).toContain('const password = "123456";');

      expect(description).toContain('## 修复建议');
      expect(description).toContain('Fix the security vulnerability');

      expect(description).toContain('## 审查信息');
      expect(description).toContain('- 类别: security');
      expect(description).toContain('- 严重程度: critical');
      expect(description).toContain('- 来源: security-reviewer');
      expect(description).toContain('- 置信度: 0.90');
      expect(description).toContain('- 关联 PR: my-project-feature-main');
    });

    it('应该处理缺少可选字段的 issue', () => {
      const issue: ValidatedIssue = {
        ...createMockIssue(),
        code_snippet: undefined,
        suggestion: undefined,
      };

      const description = formatIssueDescription(issue, 'test-project');

      // 不应该包含代码片段部分
      expect(description).not.toContain('## 问题代码');

      // 不应该包含修复建议部分
      expect(description).not.toContain('## 修复建议');

      // 应该仍然包含基本信息
      expect(description).toContain('## 问题描述');
      expect(description).toContain('## 代码位置');
      expect(description).toContain('## 审查信息');
    });

    it('应该正确格式化置信度', () => {
      const issue = createMockIssue();
      issue.final_confidence = 0.87654321;

      const description = formatIssueDescription(issue, 'test-project');

      expect(description).toContain('- 置信度: 0.88');
    });
  });

  describe('formatCorrelationLabel', () => {
    it('应该正确添加前缀', () => {
      expect(formatCorrelationLabel('my-project-feature-main')).toBe(
        'sheepdog:my-project-feature-main',
      );
    });

    it('应该处理包含特殊字符的 correlation_id', () => {
      const correlationId = 'project_name/feature-branch@main';
      expect(formatCorrelationLabel(correlationId)).toBe(
        `sheepdog:${correlationId}`,
      );
    });

    it('应该处理空字符串', () => {
      expect(formatCorrelationLabel('')).toBe('sheepdog:');
    });
  });

  describe('validateConfig', () => {
    it('应该验证通过的配置', () => {
      const config = {
        connection: {
          url: 'https://test.atlassian.net',
          token: 'test-token',
          email: 'test@example.com',
          project: 'TEST',
        },
      };

      const result = validateConfig(config, [
        'url',
        'token',
        'email',
        'project',
      ]);

      expect(result.valid).toBe(true);
      expect(result.missing).toBeUndefined();
    });

    it('应该检测缺失的必需字段', () => {
      const config = {
        connection: {
          url: 'https://test.atlassian.net',
          project: 'TEST',
        },
      };

      const result = validateConfig(config, [
        'url',
        'token',
        'email',
        'project',
      ]);

      expect(result.valid).toBe(false);
      expect(result.missing).toEqual(
        expect.arrayContaining(['token', 'email']),
      );
    });

    it('应该处理空字符串为缺失', () => {
      const config = {
        connection: {
          url: 'https://test.atlassian.net',
          token: '',
          email: 'test@example.com',
          project: 'TEST',
        },
      };

      const result = validateConfig(config, [
        'url',
        'token',
        'email',
        'project',
      ]);

      expect(result.valid).toBe(false);
      expect(result.missing).toContain('token');
    });

    it('应该处理没有必需字段的情况', () => {
      const config = {
        connection: {
          url: 'https://test.atlassian.net',
        },
      };

      const result = validateConfig(config, []);

      expect(result.valid).toBe(true);
      expect(result.missing).toBeUndefined();
    });
  });

  describe('formatIssueTitle', () => {
    it('应该为 create 操作格式化标题', () => {
      const issue = createMockIssue();
      const title = formatIssueTitle({ type: 'create', issue });

      expect(title).toBe('[sec-001] Test security issue');
    });

    it('应该为 update 操作格式化标题', () => {
      const issue = createMockIssue();
      const title = formatIssueTitle({
        type: 'update',
        issue_id: 'TEST-123',
        issue,
      });

      expect(title).toBe('[sec-001] Test security issue');
    });

    it('应该为 close 操作返回空字符串', () => {
      const title = formatIssueTitle({
        type: 'close',
        issue_id: 'TEST-123',
        reason: 'Fixed',
        status: 'fixed',
      });

      expect(title).toBe('');
    });
  });
});
