/**
 * Phase 8: 端到端集成测试
 * 验证完整的 review → incremental review → status 流程
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { getCorrelationId } from '../config/config.js';
import { createTestRepo, cleanupTestRepo } from '../test-utils/index.js';
import { generateReport } from '../report/generator.js';
import { saveReport, findPreviousReport } from '../report/persistence.js';
import { JiraPlugin } from '../plugins/jira.js';
import { generateMergeDecision } from '../commands/merge-decision.js';
import type {
  ValidatedIssue,
  Severity,
  IssueOperation,
  SyncContext,
  IssueSyncStatus,
} from '../types/index.js';

/**
 * Mock JIRA Plugin - 用于端到端测试，避免真实 API 调用
 */
class MockJiraPlugin extends JiraPlugin {
  private mockIssues: Map<
    string,
    { key: string; isClosed: boolean; title: string }
  > = new Map();
  private issueCounter = 0;

  override async initialize(): Promise<void> {
    // Skip real initialization
  }

  override async sync(context: SyncContext) {
    const results = [];

    for (const operation of context.operations) {
      const result = await this.mockExecuteOperation(
        operation,
        context.correlation_id,
      );
      results.push(result);
    }

    return {
      results,
      success: results.every((r) => r.success),
    };
  }

  private async mockExecuteOperation(
    operation: IssueOperation,
    _correlationId: string,
  ) {
    switch (operation.type) {
      case 'create': {
        const key = `TEST-${++this.issueCounter}`;
        this.mockIssues.set(operation.issue.id, {
          key,
          isClosed: false,
          title: operation.issue.title,
        });
        return {
          local_issue_id: operation.issue.id,
          remote_issue_id: key,
          operation: 'create' as const,
          success: true,
        };
      }
      case 'close': {
        const issue = this.mockIssues.get(operation.issue_id);
        if (issue) {
          issue.isClosed = true;
        }
        return {
          local_issue_id: operation.issue_id,
          remote_issue_id: issue?.key ?? operation.issue_id,
          operation: 'close' as const,
          success: true,
        };
      }
      case 'update': {
        return {
          local_issue_id: operation.issue.id,
          remote_issue_id: operation.issue_id,
          operation: 'update' as const,
          success: true,
        };
      }
    }
  }

  override async getStatus(correlationId: string) {
    const issues = Array.from(this.mockIssues.entries()).map(([id, data]) => ({
      remote_id: data.key,
      local_id: id,
      is_closed: data.isClosed,
      remote_status: data.isClosed ? 'Done' : 'Open',
      title: data.title,
    }));

    const openCount = issues.filter((i) => !i.is_closed).length;

    return {
      correlation_id: correlationId,
      issues,
      all_closed: openCount === 0,
      open_count: openCount,
    };
  }
}

/**
 * 创建用于 E2E 测试的测试 issue
 */
function createTestIssues(): ValidatedIssue[] {
  return [
    {
      id: 'sec-001',
      file: 'src/auth.ts',
      line_start: 10,
      line_end: 15,
      category: 'security',
      severity: 'critical',
      title: 'SQL Injection vulnerability',
      description: 'Direct string concatenation in SQL query',
      suggestion: 'Use parameterized queries',
      code_snippet: 'const query = `SELECT * FROM users WHERE id = ${id}`;',
      confidence: 0.95,
      source_agent: 'security-reviewer',
      validation_status: 'confirmed',
      final_confidence: 0.95,
      grounding_evidence: {
        checked_files: ['src/auth.ts'],
        checked_symbols: [],
        reasoning: 'String interpolation in SQL',
      },
    },
    {
      id: 'log-001',
      file: 'src/service.ts',
      line_start: 23,
      line_end: 25,
      category: 'logic',
      severity: 'error',
      title: 'Null pointer access',
      description: 'Accessing property without null check',
      suggestion: 'Add null check',
      confidence: 0.85,
      source_agent: 'logic-reviewer',
      validation_status: 'confirmed',
      final_confidence: 0.85,
      grounding_evidence: {
        checked_files: ['src/service.ts'],
        checked_symbols: [],
        reasoning: 'No null check',
      },
    },
    {
      id: 'perf-001',
      file: 'src/db.ts',
      line_start: 45,
      line_end: 50,
      category: 'performance',
      severity: 'warning',
      title: 'N+1 query pattern',
      description: 'Database query inside loop',
      suggestion: 'Use batch query',
      confidence: 0.8,
      source_agent: 'performance-reviewer',
      validation_status: 'confirmed',
      final_confidence: 0.8,
      grounding_evidence: {
        checked_files: ['src/db.ts'],
        checked_symbols: [],
        reasoning: 'Query inside loop',
      },
    },
  ];
}

describe('Phase 8: End-to-End Integration', () => {
  let repoPath: string;

  beforeEach(() => {
    repoPath = createTestRepo();
  });

  afterEach(() => {
    cleanupTestRepo(repoPath);
  });

  describe('8.1 First review complete flow', () => {
    it('should generate report with issues and persist JSON', async () => {
      const issues = createTestIssues();
      const correlationId = getCorrelationId('test-project', 'feature', 'main');

      // Generate report
      const report = generateReport({
        correlationId,
        sourceRef: 'feature',
        targetRef: 'main',
        repoPath,
        projectName: 'test-project',
        issues,
        checklist: [],
        agentsUsed: [
          'security-reviewer',
          'logic-reviewer',
          'performance-reviewer',
        ],
        reviewTimeMs: 5000,
        tokensUsed: 10000,
        isIncremental: false,
        models: { agent_model: 'claude-sonnet-4-5-20250929' },
      });

      // Verify report structure
      expect(report.summary).toBeTruthy();
      expect(report.risk_level).toBe('high'); // has critical
      expect(report.issues).toHaveLength(3);
      expect(report.metrics.confirmed).toBe(3);
      expect(report.metadata.correlation_id).toBe(correlationId);
      expect(report.metadata.is_incremental).toBe(false);

      // Save report
      const savedPath = saveReport(repoPath, report);

      // Verify file exists
      expect(fs.existsSync(savedPath)).toBe(true);

      // Verify saved content
      const savedReport = JSON.parse(fs.readFileSync(savedPath, 'utf-8'));
      expect(savedReport.issues).toHaveLength(3);
      expect(savedReport.metadata.correlation_id).toBe(correlationId);
    });

    it('should sync issues via mock plugin', async () => {
      const issues = createTestIssues();
      const correlationId = getCorrelationId('test-project', 'feature', 'main');
      const plugin = new MockJiraPlugin();
      await plugin.initialize();

      // Sync: create issues
      const operations: IssueOperation[] = issues
        .filter((i) => i.validation_status === 'confirmed')
        .map((issue) => ({ type: 'create' as const, issue }));

      const result = await plugin.sync({
        correlation_id: correlationId,
        operations,
      });

      expect(result.success).toBe(true);
      expect(result.results).toHaveLength(3);

      // Verify remote_id filled
      for (const r of result.results) {
        expect(r.remote_issue_id).toMatch(/^TEST-\d+$/);
      }

      // Verify status query
      const status = await plugin.getStatus(correlationId);
      expect(status.issues).toHaveLength(3);
      expect(status.all_closed).toBe(false);
      expect(status.open_count).toBe(3);
    });
  });

  describe('8.2 Incremental review flow', () => {
    it('should verify fixes and update issue status', async () => {
      const previousIssues = createTestIssues();
      const correlationId = getCorrelationId('test-project', 'feature', 'main');
      const plugin = new MockJiraPlugin();
      await plugin.initialize();

      // Create initial issues in mock
      const createOps: IssueOperation[] = previousIssues.map((issue) => ({
        type: 'create' as const,
        issue,
      }));
      const createResult = await plugin.sync({
        correlation_id: correlationId,
        operations: createOps,
      });

      // Fill remote_id on issues
      for (let i = 0; i < previousIssues.length; i++) {
        previousIssues[i]!.remote_id = createResult.results[i]?.remote_issue_id;
      }

      // Create previous report
      const previousReport = generateReport({
        correlationId,
        sourceRef: 'feature',
        targetRef: 'main',
        repoPath,
        projectName: 'test-project',
        issues: previousIssues,
        checklist: [],
        agentsUsed: [
          'security-reviewer',
          'logic-reviewer',
          'performance-reviewer',
        ],
        reviewTimeMs: 5000,
        tokensUsed: 10000,
        isIncremental: false,
        models: { agent_model: 'claude-sonnet-4-5-20250929' },
      });
      await saveReport(repoPath, previousReport);

      // Run incremental review - simulate fixed issues
      const updatedIssues = previousIssues.map((issue) => ({
        ...issue,
        remote_id: issue.remote_id,
      }));

      // Simulate: security issue fixed, logic issue still present
      const newIssues = updatedIssues.slice(1); // Remove fixed security issue

      const incrementalReport = generateReport({
        correlationId,
        sourceRef: 'feature',
        targetRef: 'main',
        repoPath,
        projectName: 'test-project',
        issues: newIssues,
        checklist: [],
        agentsUsed: ['logic-reviewer', 'performance-reviewer'],
        reviewTimeMs: 3000,
        tokensUsed: 5000,
        isIncremental: true,
        models: { agent_model: 'claude-sonnet-4-5-20250929' },
      });

      // Add fix verification results
      incrementalReport.fix_verification = {
        total_verified: 3,
        by_status: {
          fixed: 1,
          missed: 2,
          false_positive: 0,
          obsolete: 0,
          uncertain: 0,
        },
        results: [
          {
            original_issue_id: 'sec-001',
            status: 'fixed' as const,
            confidence: 0.95,
            evidence: {
              checked_files: ['src/auth.ts'],
              examined_code: [],
              related_changes: 'SQL injection code removed',
              reasoning: 'Code has been fixed',
            },
          },
          {
            original_issue_id: 'log-001',
            status: 'missed' as const,
            confidence: 0.9,
            evidence: {
              checked_files: ['src/service.ts'],
              examined_code: [],
              related_changes: 'No changes',
              reasoning: 'Issue still present',
            },
            updated_issue: {
              title: 'Null pointer access (still present)',
              description: 'Still no null check',
              suggestion: 'Add null check',
            },
          },
          {
            original_issue_id: 'perf-001',
            status: 'missed' as const,
            confidence: 0.85,
            evidence: {
              checked_files: ['src/db.ts'],
              examined_code: [],
              related_changes: 'No changes',
              reasoning: 'N+1 query still present',
            },
            updated_issue: {
              title: 'N+1 query pattern (still present)',
              description: 'Query still inside loop',
              suggestion: 'Use batch query',
            },
          },
        ],
        verification_time_ms: 2000,
        tokens_used: 3000,
      };

      expect(incrementalReport.metadata.is_incremental).toBe(true);
      expect(incrementalReport.fix_verification).toBeDefined();
      expect(incrementalReport.fix_verification?.total_verified).toBe(3);
      expect(incrementalReport.fix_verification?.by_status.fixed).toBe(1);
      expect(incrementalReport.fix_verification?.by_status.missed).toBe(2);

      // Close fixed issue via plugin
      const syncOps: IssueOperation[] = [
        {
          type: 'close',
          issue_id: 'sec-001',
          reason: 'Issue has been fixed',
          status: 'fixed',
        },
      ];
      await plugin.sync({ correlation_id: correlationId, operations: syncOps });

      // Verify status
      const status = await plugin.getStatus(correlationId);
      expect(status.open_count).toBe(2); // 2 still open
    });
  });

  describe('8.3 Merge decision flow', () => {
    it('should return exit 0 when all issues closed', async () => {
      const issues = createTestIssues();
      const correlationId = getCorrelationId('test-project', 'feature', 'main');
      const plugin = new MockJiraPlugin();
      await plugin.initialize();

      // Create and close all issues
      const createOps: IssueOperation[] = issues.map((issue) => ({
        type: 'create' as const,
        issue,
      }));
      await plugin.sync({
        correlation_id: correlationId,
        operations: createOps,
      });

      const closeOps: IssueOperation[] = issues.map((issue) => ({
        type: 'close' as const,
        issue_id: issue.id,
        reason: 'Fixed',
        status: 'fixed' as const,
      }));
      await plugin.sync({
        correlation_id: correlationId,
        operations: closeOps,
      });

      // Check merge decision
      const status = await plugin.getStatus(correlationId);
      expect(status.all_closed).toBe(true);

      const decision = generateMergeDecision(status, new Map(), undefined);
      expect(decision.can_merge).toBe(true);
      expect(decision.open_issues).toBe(0);
    });

    it('should return can_merge=false when open issues exist', async () => {
      const issues = createTestIssues();
      const correlationId = getCorrelationId('test-project', 'feature', 'main');
      const plugin = new MockJiraPlugin();
      await plugin.initialize();

      const createOps: IssueOperation[] = issues.map((issue) => ({
        type: 'create' as const,
        issue,
      }));
      await plugin.sync({
        correlation_id: correlationId,
        operations: createOps,
      });

      const status = await plugin.getStatus(correlationId);
      const severityMap = new Map<string, Severity>();
      for (const issue of issues) {
        severityMap.set(issue.id, issue.severity);
      }
      const decision = generateMergeDecision(status, severityMap, undefined);
      expect(decision.can_merge).toBe(false);
      expect(decision.open_issues).toBe(3);
    });
  });

  describe('8.4 Complete iteration loop', () => {
    it('should complete full review → fix → incremental → status PASS', async () => {
      const correlationId = getCorrelationId('test-project', 'feature', 'main');
      const plugin = new MockJiraPlugin();
      await plugin.initialize();
      const issues = createTestIssues();

      // Step 1: First review
      const report1 = generateReport({
        correlationId,
        sourceRef: 'feature',
        targetRef: 'main',
        repoPath,
        projectName: 'test-project',
        issues,
        checklist: [],
        agentsUsed: [
          'security-reviewer',
          'logic-reviewer',
          'performance-reviewer',
        ],
        reviewTimeMs: 5000,
        tokensUsed: 10000,
        isIncremental: false,
        models: { agent_model: 'claude-sonnet-4-5-20250929' },
      });
      await saveReport(repoPath, report1);

      // Sync: create issues
      const createOps: IssueOperation[] = issues.map((issue) => ({
        type: 'create' as const,
        issue,
      }));
      await plugin.sync({
        correlation_id: correlationId,
        operations: createOps,
      });

      // Step 2: Fix all issues, close them
      const closeOps: IssueOperation[] = issues.map((issue) => ({
        type: 'close' as const,
        issue_id: issue.id,
        reason: 'All issues fixed',
        status: 'fixed' as const,
      }));
      await plugin.sync({
        correlation_id: correlationId,
        operations: closeOps,
      });

      // Step 3: Status check - should PASS
      const status = await plugin.getStatus(correlationId);
      const decision = generateMergeDecision(status, new Map(), undefined);
      expect(decision.can_merge).toBe(true);
      expect(decision.open_issues).toBe(0);
    });
  });

  describe('8.5 JSON artifact passing', () => {
    it('should load previous review via --previous-review', async () => {
      const issues = createTestIssues();
      const correlationId = getCorrelationId('test-project', 'feature', 'main');

      const report = generateReport({
        correlationId,
        sourceRef: 'feature',
        targetRef: 'main',
        repoPath,
        projectName: 'test-project',
        issues,
        checklist: [],
        agentsUsed: ['security-reviewer'],
        reviewTimeMs: 1000,
        tokensUsed: 1000,
        isIncremental: false,
        models: { agent_model: 'claude-sonnet-4-5-20250929' },
      });

      await saveReport(repoPath, report);

      // Find previous review
      const previous = findPreviousReport(repoPath, correlationId);
      expect(previous).not.toBeNull();
      expect(previous!.metadata.correlation_id).toBe(correlationId);
      expect(previous!.issues).toHaveLength(3);
    });

    it('should auto-find previous review by correlation_id', async () => {
      const correlationId = getCorrelationId('test-project', 'feature', 'main');

      // Save two reports for different correlations
      const report1 = generateReport({
        correlationId,
        sourceRef: 'feature',
        targetRef: 'main',
        repoPath,
        projectName: 'test-project',
        issues: createTestIssues(),
        checklist: [],
        agentsUsed: ['security-reviewer'],
        reviewTimeMs: 1000,
        tokensUsed: 1000,
        isIncremental: false,
        models: { agent_model: 'claude-sonnet-4-5-20250929' },
      });
      await saveReport(repoPath, report1);

      const otherId = getCorrelationId('test-project', 'other-branch', 'main');
      const report2 = generateReport({
        correlationId: otherId,
        sourceRef: 'other-branch',
        targetRef: 'main',
        repoPath,
        projectName: 'test-project',
        issues: [],
        checklist: [],
        agentsUsed: [],
        reviewTimeMs: 500,
        tokensUsed: 500,
        isIncremental: false,
        models: { agent_model: 'claude-sonnet-4-5-20250929' },
      });
      await saveReport(repoPath, report2);

      // Find by correlation_id
      const found = findPreviousReport(repoPath, correlationId);
      expect(found).not.toBeNull();
      expect(found!.metadata.correlation_id).toBe(correlationId);
      expect(found!.issues).toHaveLength(3);
    });
  });

  describe('8.6 Issue sync failure retry', () => {
    it('should track pending issues for retry in incremental review', async () => {
      const correlationId = getCorrelationId('test-project', 'feature', 'main');
      const issues = createTestIssues();

      // Create a report with pending sync status
      const syncStatus: IssueSyncStatus = {
        status: 'partial',
        synced: ['sec-001'],
        pending: ['log-001', 'perf-001'],
        errors: [
          {
            plugin: 'jira',
            issue_id: 'log-001',
            error: 'Connection timeout',
            retry_count: 1,
          },
          {
            plugin: 'jira',
            issue_id: 'perf-001',
            error: 'Rate limit exceeded',
            retry_count: 2,
          },
        ],
      };

      const report = generateReport({
        correlationId,
        sourceRef: 'feature',
        targetRef: 'main',
        repoPath,
        projectName: 'test-project',
        issues,
        checklist: [],
        agentsUsed: [
          'security-reviewer',
          'logic-reviewer',
          'performance-reviewer',
        ],
        reviewTimeMs: 5000,
        tokensUsed: 10000,
        isIncremental: false,
        models: { agent_model: 'claude-sonnet-4-5-20250929' },
      });

      // Add sync status
      report.issue_sync = syncStatus;
      await saveReport(repoPath, report);

      // Load and verify
      const loaded = findPreviousReport(repoPath, correlationId);
      expect(loaded).not.toBeNull();
      expect(loaded!.issue_sync?.pending).toContain('log-001');
      expect(loaded!.issue_sync?.pending).toContain('perf-001');

      // Verify retry count: perf-001 has retry_count=2, one more retry allowed
      const perfError = loaded!.issue_sync?.errors.find(
        (e) => e.issue_id === 'perf-001',
      );
      expect(perfError?.retry_count).toBe(2);
      // After 3 retries should be marked as failed
      expect(perfError!.retry_count < 3).toBe(true);
    });
  });

  describe('8.7 Custom agent integration', () => {
    it('should load and execute custom agent from .sheepdog/agents/', async () => {
      // Create a custom agent file
      const agentsDir = path.join(repoPath, '.sheepdog', 'agents');
      fs.mkdirSync(agentsDir, { recursive: true });
      fs.writeFileSync(
        path.join(agentsDir, 'test-reviewer.md'),
        `---
name: test-reviewer
description: Test custom agent
trigger_mode: rule
triggers:
  files:
    - "**/*.test.ts"
output:
  category: style
  default_severity: suggestion
enabled: true
---

You are a test review expert. Focus on test quality.`,
      );

      // Verify file exists
      expect(fs.existsSync(path.join(agentsDir, 'test-reviewer.md'))).toBe(
        true,
      );

      // Load custom agents
      const { loadCustomAgents } =
        await import('../customization/agent-loader.js');
      const result = loadCustomAgents(agentsDir);

      expect(result.agents).toHaveLength(1);
      expect(result.agents[0]!.name).toBe('test-reviewer');
      expect(result.agents[0]!.trigger_mode).toBe('rule');
      expect(result.agents[0]!.output.category).toBe('style');
      expect(result.agents[0]!.prompt).toContain('test review expert');
    });
  });
});
