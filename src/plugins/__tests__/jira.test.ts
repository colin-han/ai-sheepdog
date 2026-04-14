/**
 * JIRA 插件单元测试
 * @see .SPEC/2-design/issue-plugin.md
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { JiraPlugin } from '../jira.js';
import type {
  SyncContext,
  PluginConfig,
  ValidatedIssue,
} from '../../types/plugin.js';
import type { Severity } from '../../types/core.js';

// Mock fetch
global.fetch = vi.fn();

describe('JiraPlugin', () => {
  let plugin: JiraPlugin;
  let mockConfig: PluginConfig;
  let mockFetch: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    plugin = new JiraPlugin();
    mockFetch = global.fetch as ReturnType<typeof vi.fn>;
    mockFetch.mockClear();

    mockConfig = {
      connection: {
        url: 'https://test.atlassian.net',
        token: 'test-token',
        email: 'test@example.com',
        project: 'TEST',
        issueType: 'Bug',
      },
      severity_mapping: {
        critical: 'Highest',
        error: 'High',
        warning: 'Medium',
        suggestion: 'Low',
      },
    };
  });

  describe('initialize', () => {
    it('应该成功初始化', async () => {
      await plugin.initialize(mockConfig);
      // 不应该抛出错误
      expect(true).toBe(true);
    });

    it('应该拒绝缺少必需字段的配置', async () => {
      const invalidConfig = {
        connection: {
          url: 'https://test.atlassian.net',
        },
      };

      await expect(plugin.initialize(invalidConfig)).rejects.toThrow(
        'JIRA plugin missing required fields',
      );
    });

    it('应该使用默认的 severity 映射', async () => {
      const configWithoutMapping = {
        connection: {
          url: 'https://test.atlassian.net',
          token: 'test-token',
          email: 'test@example.com',
          project: 'TEST',
        },
      };

      await plugin.initialize(configWithoutMapping);
      // 成功初始化
      expect(true).toBe(true);
    });
  });

  describe('sync - create operation', () => {
    beforeEach(async () => {
      await plugin.initialize(mockConfig);
    });

    const createMockIssue = (
      id: string,
      severity: Severity,
    ): ValidatedIssue => ({
      id,
      file: '/path/to/file.ts',
      line_start: 10,
      line_end: 15,
      category: 'security',
      severity,
      title: `Test issue ${id}`,
      description: 'Test description',
      suggestion: 'Test suggestion',
      code_snippet: 'const x = 1;',
      confidence: 0.9,
      source_agent: 'security-reviewer',
      validation_status: 'confirmed',
      final_confidence: 0.9,
      grounding_evidence: {
        checked_files: [],
        checked_symbols: [],
        reasoning: 'test',
      },
    });

    it('应该成功创建 issue - critical', async () => {
      const issue = createMockIssue('sec-001', 'critical');

      // Mock JIRA API 响应
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          id: '12345',
          key: 'TEST-123',
          self: 'https://test.atlassian.net/rest/api/2/issue/12345',
        }),
      });

      const context: SyncContext = {
        correlation_id: 'test-project-feature-main',
        operations: [{ type: 'create', issue }],
      };

      const result = await plugin.sync(context);

      expect(result.success).toBe(true);
      expect(result.results).toHaveLength(1);
      expect(result.results[0]).toMatchObject({
        local_issue_id: 'sec-001',
        remote_issue_id: 'TEST-123',
        operation: 'create',
        success: true,
      });

      // 验证请求参数
      const callArgs = mockFetch.mock.calls[0];
      expect(callArgs[0]).toBe('https://test.atlassian.net/rest/api/2/issue');
      const body = JSON.parse(callArgs[1].body);
      expect(body.fields.project.key).toBe('TEST');
      expect(body.fields.priority.name).toBe('Highest');
      expect(body.fields.labels).toContain(
        'sheepdog:test-project-feature-main',
      );
    });

    it('应该正确映射 severity 到 priority', async () => {
      const testCases: Array<[Severity, string]> = [
        ['critical', 'Highest'],
        ['error', 'High'],
        ['warning', 'Medium'],
        ['suggestion', 'Low'],
      ];

      for (const [severity, expectedPriority] of testCases) {
        mockFetch.mockClear();

        const issue = createMockIssue(`sec-${severity}`, severity);
        mockFetch.mockResolvedValueOnce({
          ok: true,
          json: async () => ({ id: '12345', key: 'TEST-123' }),
        });

        const context: SyncContext = {
          correlation_id: 'test-project-feature-main',
          operations: [{ type: 'create', issue }],
        };

        await plugin.sync(context);

        const body = JSON.parse(mockFetch.mock.calls[0][1].body);
        expect(body.fields.priority.name).toBe(expectedPriority);
      }
    });

    it('应该正确格式化 issue description', async () => {
      const issue = createMockIssue('sec-001', 'critical');

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ id: '12345', key: 'TEST-123' }),
      });

      const context: SyncContext = {
        correlation_id: 'test-project-feature-main',
        operations: [{ type: 'create', issue }],
      };

      await plugin.sync(context);

      const body = JSON.parse(mockFetch.mock.calls[0][1].body);
      const description = body.fields.description;

      expect(description).toContain('## 问题描述');
      expect(description).toContain('Test description');
      expect(description).toContain('## 代码位置');
      expect(description).toContain('文件: /path/to/file.ts');
      expect(description).toContain('行号: 10 - 15');
      expect(description).toContain('## 修复建议');
      expect(description).toContain('Test suggestion');
      expect(description).toContain('## 审查信息');
      expect(description).toContain('- 类别: security');
      expect(description).toContain('- 严重程度: critical');
      expect(description).toContain('- 关联 PR: test-project-feature-main');
    });

    it('应该处理创建失败', async () => {
      const issue = createMockIssue('sec-001', 'critical');

      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 401,
        statusText: 'Unauthorized',
        text: async () => 'Invalid credentials',
      });

      const context: SyncContext = {
        correlation_id: 'test-project-feature-main',
        operations: [{ type: 'create', issue }],
      };

      const result = await plugin.sync(context);

      expect(result.success).toBe(false);
      expect(result.results[0].success).toBe(false);
      expect(result.results[0].error).toContain('JIRA API error');
      expect(result.errors).toBeDefined();
    });

    it('应该处理部分成功', async () => {
      const issue1 = createMockIssue('sec-001', 'critical');
      const issue2 = createMockIssue('sec-002', 'error');

      // 第一个成功，第二个失败
      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ id: '12345', key: 'TEST-123' }),
        })
        .mockResolvedValueOnce({
          ok: false,
          status: 400,
          statusText: 'Bad Request',
          text: async () => 'Invalid input',
        });

      const context: SyncContext = {
        correlation_id: 'test-project-feature-main',
        operations: [
          { type: 'create', issue: issue1 },
          { type: 'create', issue: issue2 },
        ],
      };

      const result = await plugin.sync(context);

      expect(result.success).toBe(false);
      expect(result.results[0].success).toBe(true);
      expect(result.results[1].success).toBe(false);
      expect(result.errors).toHaveLength(1);
    });
  });

  describe('sync - update operation', () => {
    beforeEach(async () => {
      await plugin.initialize(mockConfig);
    });

    it('应该成功更新 issue', async () => {
      const issue: ValidatedIssue = {
        id: 'sec-001',
        file: '/path/to/file.ts',
        line_start: 10,
        line_end: 15,
        category: 'security',
        severity: 'critical',
        title: 'Updated title',
        description: 'Updated description',
        confidence: 0.9,
        source_agent: 'security-reviewer',
        validation_status: 'confirmed',
        final_confidence: 0.9,
        grounding_evidence: {
          checked_files: [],
          checked_symbols: [],
          reasoning: 'test',
        },
      };

      // PUT 请求不返回 JSON，只需要 ok: true
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({}),
      });

      const context: SyncContext = {
        correlation_id: 'test-project-feature-main',
        operations: [{ type: 'update', issue_id: 'TEST-123', issue }],
      };

      const result = await plugin.sync(context);

      expect(result.success).toBe(true);
      expect(result.results[0]).toMatchObject({
        local_issue_id: 'sec-001',
        remote_issue_id: 'TEST-123',
        operation: 'update',
        success: true,
      });

      const callArgs = mockFetch.mock.calls[0];
      expect(callArgs[0]).toBe(
        'https://test.atlassian.net/rest/api/2/issue/TEST-123',
      );
      expect(callArgs[1].method).toBe('PUT');
    });
  });

  describe('sync - close operation', () => {
    beforeEach(async () => {
      await plugin.initialize(mockConfig);
    });

    it('应该成功关闭 issue', async () => {
      // Mock 获取转换
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          transitions: [
            { id: '11', name: 'To Do', to: { name: 'To Do' } },
            { id: '21', name: 'Done', to: { name: 'Done' } },
          ],
        }),
      });

      // Mock 添加评论
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({}),
      });

      // Mock 执行转换
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({}),
      });

      const context: SyncContext = {
        correlation_id: 'test-project-feature-main',
        operations: [
          {
            type: 'close',
            issue_id: 'TEST-123',
            reason: 'Issue fixed',
            status: 'fixed',
          },
        ],
      };

      const result = await plugin.sync(context);

      expect(result.success).toBe(true);
      expect(result.results[0]).toMatchObject({
        local_issue_id: 'TEST-123',
        remote_issue_id: 'TEST-123',
        operation: 'close',
        success: true,
      });

      // 验证调用顺序
      expect(mockFetch).toHaveBeenCalledTimes(3);
      expect(mockFetch.mock.calls[0][0]).toContain('/transitions');
      expect(mockFetch.mock.calls[1][0]).toContain('/comment');
      expect(mockFetch.mock.calls[2][0]).toContain('/transitions');
    });

    it('应该处理没有可用转换的情况', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          transitions: [
            { id: '11', name: 'To Do', to: { name: 'To Do' } },
            { id: '31', name: 'In Progress', to: { name: 'In Progress' } },
          ],
        }),
      });

      const context: SyncContext = {
        correlation_id: 'test-project-feature-main',
        operations: [
          {
            type: 'close',
            issue_id: 'TEST-123',
            reason: 'Issue fixed',
            status: 'fixed',
          },
        ],
      };

      const result = await plugin.sync(context);

      expect(result.success).toBe(false);
      expect(result.results[0].success).toBe(false);
      expect(result.results[0].error).toContain(
        'No transition to closed status found',
      );
    });
  });

  describe('getStatus', () => {
    beforeEach(async () => {
      await plugin.initialize(mockConfig);
    });

    it('应该查询关联的 issue 状态', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          startAt: 0,
          maxResults: 50,
          total: 2,
          issues: [
            {
              id: '12345',
              key: 'TEST-123',
              self: 'https://test.atlassian.net/rest/api/2/issue/12345',
              fields: {
                project: { key: 'TEST' },
                issuetype: { name: 'Bug' },
                summary: '[sec-001] Test issue 1',
                status: { name: 'Done' },
                labels: ['sheepdog:test-project-feature-main'],
              },
            },
            {
              id: '12346',
              key: 'TEST-124',
              self: 'https://test.atlassian.net/rest/api/2/issue/12346',
              fields: {
                project: { key: 'TEST' },
                issuetype: { name: 'Bug' },
                summary: '[sec-002] Test issue 2',
                status: { name: 'In Progress' },
                labels: ['sheepdog:test-project-feature-main'],
              },
            },
          ],
        }),
      });

      const result = await plugin.getStatus('test-project-feature-main');

      expect(result.correlation_id).toBe('test-project-feature-main');
      expect(result.issues).toHaveLength(2);
      expect(result.all_closed).toBe(false);
      expect(result.open_count).toBe(1);

      expect(result.issues[0]).toMatchObject({
        remote_id: 'TEST-123',
        local_id: 'sec-001',
        is_closed: true,
        remote_status: 'Done',
        title: '[sec-001] Test issue 1',
      });

      expect(result.issues[1]).toMatchObject({
        remote_id: 'TEST-124',
        local_id: 'sec-002',
        is_closed: false,
        remote_status: 'In Progress',
        title: '[sec-002] Test issue 2',
      });
    });

    it('应该处理查询失败（返回空结果）', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Network error'));

      const result = await plugin.getStatus('test-project-feature-main');

      expect(result.issues).toHaveLength(0);
      expect(result.all_closed).toBe(true);
      expect(result.open_count).toBe(0);
    });

    it('应该正确识别已关闭的 issue', async () => {
      // 测试不同的关闭状态
      const closedStatuses = ['Done', 'Closed', 'Resolved'];

      for (const status of closedStatuses) {
        mockFetch.mockClear();
        mockFetch.mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            startAt: 0,
            maxResults: 50,
            total: 1,
            issues: [
              {
                id: '12345',
                key: 'TEST-123',
                fields: {
                  status: { name: status },
                  summary: '[sec-001] Test',
                  labels: ['sheepdog:test-project-feature-main'],
                },
              },
            ],
          }),
        });

        const result = await plugin.getStatus('test-project-feature-main');
        expect(result.issues[0].is_closed).toBe(true);
      }
    });
  });
});
