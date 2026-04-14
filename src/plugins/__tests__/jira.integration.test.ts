/**
 * JIRA 插件集成测试
 *
 * 注意：这些测试需要真实的 JIRA 实例，默认为跳过。
 * 运行方法：SHEEPDOG_RUN_INTEGRATION_TESTS=1 volta run yarn test jira.integration
 *
 * @see .SPEC/2-design/issue-plugin.md
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { JiraPlugin } from '../jira.js';
import type {
  SyncContext,
  PluginConfig,
  ValidatedIssue,
} from '../../types/plugin.js';

const shouldRun = process.env.SHEEPDOG_RUN_INTEGRATION_TESTS === '1';

describe.skipIf(!shouldRun)('JiraPlugin Integration Tests', () => {
  let plugin: JiraPlugin;
  let config: PluginConfig;

  beforeEach(() => {
    // 从环境变量读取 JIRA 配置
    const jiraUrl = process.env.SHEEPDOG_JIRA_URL;
    const jiraToken = process.env.SHEEPDOG_JIRA_TOKEN;
    const jiraEmail = process.env.SHEEPDOG_JIRA_EMAIL;
    const jiraProject = process.env.SHEEPDOG_JIRA_PROJECT;

    if (!jiraUrl || !jiraToken || !jiraEmail || !jiraProject) {
      throw new Error(
        'Missing required JIRA environment variables. ' +
          'Set SHEEPDOG_JIRA_URL, SHEEPDOG_JIRA_TOKEN, SHEEPDOG_JIRA_EMAIL, SHEEPDOG_JIRA_PROJECT',
      );
    }

    plugin = new JiraPlugin();
    config = {
      connection: {
        url: jiraUrl,
        token: jiraToken,
        email: jiraEmail,
        project: jiraProject,
      },
    };
  });

  describe('真实 JIRA 集成测试', () => {
    beforeEach(async () => {
      await plugin.initialize(config);
    });

    const createTestIssue = (): ValidatedIssue => ({
      id: `test-${Date.now()}`,
      file: '/path/to/test.ts',
      line_start: 1,
      line_end: 5,
      category: 'security',
      severity: 'warning',
      title: 'Integration test issue',
      description: 'This is a test issue created by integration tests',
      suggestion: 'Fix the issue',
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

    it('应该能在真实 JIRA 中创建 issue', async () => {
      const issue = createTestIssue();
      const correlationId = `integration-test-${Date.now()}`;

      const context: SyncContext = {
        correlation_id: correlationId,
        operations: [{ type: 'create', issue }],
      };

      const result = await plugin.sync(context);

      expect(result.success).toBe(true);
      expect(result.results[0].success).toBe(true);
      expect(result.results[0].remote_issue_id).toMatch(/^TEST-\d+$/);
    });

    it('应该能查询创建的 issue 状态', async () => {
      const issue = createTestIssue();
      const correlationId = `integration-test-${Date.now()}`;

      // 创建 issue
      const createContext: SyncContext = {
        correlation_id: correlationId,
        operations: [{ type: 'create', issue }],
      };

      const createResult = await plugin.sync(createContext);
      expect(createResult.success).toBe(true);

      const remoteIssueId = createResult.results[0].remote_issue_id;

      // 查询状态
      const statusResult = await plugin.getStatus(correlationId);

      expect(statusResult.issues).toHaveLength(1);
      expect(statusResult.issues[0].remote_id).toBe(remoteIssueId);
      expect(statusResult.issues[0].local_id).toBe(issue.id);
      expect(statusResult.issues[0].is_closed).toBe(false);
      expect(statusResult.open_count).toBe(1);
    });

    it('应该能更新已创建的 issue', async () => {
      const issue = createTestIssue();
      const correlationId = `integration-test-${Date.now()}`;

      // 创建 issue
      const createContext: SyncContext = {
        correlation_id: correlationId,
        operations: [{ type: 'create', issue }],
      };

      const createResult = await plugin.sync(createContext);
      expect(createResult.success).toBe(true);

      const remoteIssueId = createResult.results[0].remote_issue_id;

      // 更新 issue
      const updatedIssue: ValidatedIssue = {
        ...issue,
        title: 'Updated integration test issue',
        description: 'Updated description',
      };

      const updateContext: SyncContext = {
        correlation_id: correlationId,
        operations: [
          {
            type: 'update',
            issue_id: remoteIssueId!,
            issue: updatedIssue,
          },
        ],
      };

      const updateResult = await plugin.sync(updateContext);

      expect(updateResult.success).toBe(true);
      expect(updateResult.results[0].success).toBe(true);
    });

    it('应该能关闭已创建的 issue', async () => {
      const issue = createTestIssue();
      const correlationId = `integration-test-${Date.now()}`;

      // 创建 issue
      const createContext: SyncContext = {
        correlation_id: correlationId,
        operations: [{ type: 'create', issue }],
      };

      const createResult = await plugin.sync(createContext);
      expect(createResult.success).toBe(true);

      const remoteIssueId = createResult.results[0].remote_issueId;

      // 关闭 issue
      const closeContext: SyncContext = {
        correlation_id: correlationId,
        operations: [
          {
            type: 'close',
            issue_id: remoteIssueId!,
            reason: 'Test complete',
            status: 'fixed',
          },
        ],
      };

      const closeResult = await plugin.sync(closeContext);

      expect(closeResult.success).toBe(true);
      expect(closeResult.results[0].success).toBe(true);

      // 验证 issue 已关闭
      const statusResult = await plugin.getStatus(correlationId);
      expect(statusResult.issues[0].is_closed).toBe(true);
      expect(statusResult.all_closed).toBe(true);
      expect(statusResult.open_count).toBe(0);
    });

    it('应该正确处理批量操作', async () => {
      const correlationId = `integration-test-${Date.now()}`;
      const issues = [createTestIssue(), createTestIssue(), createTestIssue()];

      const context: SyncContext = {
        correlation_id: correlationId,
        operations: issues.map((issue) => ({ type: 'create', issue })),
      };

      const result = await plugin.sync(context);

      expect(result.success).toBe(true);
      expect(result.results).toHaveLength(3);

      for (const r of result.results) {
        expect(r.success).toBe(true);
        expect(r.remote_issue_id).toBeDefined();
      }

      // 查询状态应该返回所有 3 个 issue
      const statusResult = await plugin.getStatus(correlationId);
      expect(statusResult.issues).toHaveLength(3);
    });
  });
});
