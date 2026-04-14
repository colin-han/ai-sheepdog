/**
 * Phase 0: 类型定义测试
 * 验证类型可以被 TypeScript 编译通过，无循环依赖
 */
import { describe, it, expect } from 'vitest';
import type {
  Severity,
  IssueCategory,
  ValidationStatus,
  VerificationStatus,
  FileCategory,
  AgentType,
  RiskLevel,
  ValidatedIssue,
  ReviewReport,
  ReviewMetrics,
  ReviewMetadata,
  ChecklistItem,
  FixVerificationSummary,
  FixVerificationResult,
  MergeDecision,
  IssuePlugin,
  SyncContext,
  SyncResult,
  IssueStatusResult,
  DiffFile,
  DiffHunk,
  WorktreeInfo,
  CustomAgentDefinition,
  GlobalConfig,
  ProjectConfig,
  RuntimeConfig,
} from '../../types/index.js';
import {
  BUILTIN_AGENTS,
  VALIDATOR_AGENT,
  FIX_VERIFIER_AGENT,
  SEVERITY_ORDER,
  DEFAULT_SEVERITY_TO_JIRA_PRIORITY,
  DEFAULT_CONFIG,
  ENV_MAPPING,
} from '../../types/index.js';

/**
 * Type assertion helper — ensures types are used at compile time
 * without runtime overhead.
 */
function assertType<T>(_: T): void {
  // no-op — compile-time only
}

describe('Phase 0: Shared Types', () => {
  it('should export all core types without errors', () => {
    assertType<Severity>('critical');
    assertType<IssueCategory>('security');
    assertType<ValidationStatus>('confirmed');
    assertType<VerificationStatus>('fixed');
    assertType<FileCategory>('source');
    assertType<AgentType>('security-reviewer');
    assertType<RiskLevel>('high');

    // Verify runtime values
    expect(true).toBe(true);
  });

  it('should have correct BUILTIN_AGENTS list', () => {
    expect(BUILTIN_AGENTS).toContain('security-reviewer');
    expect(BUILTIN_AGENTS).toContain('logic-reviewer');
    expect(BUILTIN_AGENTS).toContain('style-reviewer');
    expect(BUILTIN_AGENTS).toContain('performance-reviewer');
    expect(BUILTIN_AGENTS).toHaveLength(4);
  });

  it('should have correct SEVERITY_ORDER', () => {
    expect(SEVERITY_ORDER.critical).toBeGreaterThan(SEVERITY_ORDER.error);
    expect(SEVERITY_ORDER.error).toBeGreaterThan(SEVERITY_ORDER.warning);
    expect(SEVERITY_ORDER.warning).toBeGreaterThan(SEVERITY_ORDER.suggestion);
  });

  it('should have correct DEFAULT_SEVERITY_TO_JIRA_PRIORITY mapping', () => {
    expect(DEFAULT_SEVERITY_TO_JIRA_PRIORITY.critical).toBe('Highest');
    expect(DEFAULT_SEVERITY_TO_JIRA_PRIORITY.error).toBe('High');
    expect(DEFAULT_SEVERITY_TO_JIRA_PRIORITY.warning).toBe('Medium');
    expect(DEFAULT_SEVERITY_TO_JIRA_PRIORITY.suggestion).toBe('Low');
  });

  it('should have correct ENV_MAPPING', () => {
    expect(ENV_MAPPING['SHEEPDOG_JIRA_URL']).toBe('jira.url');
    expect(ENV_MAPPING['SHEEPDOG_JIRA_TOKEN']).toBe('jira.token');
    expect(ENV_MAPPING['SHEEPDOG_MODEL']).toBe('model');
    expect(ENV_MAPPING['SHEEPDOG_WORKTREE_DIR']).toBe('worktree-dir');
  });

  it('should have VALIDATOR_AGENT and FIX_VERIFIER_AGENT constants', () => {
    expect(VALIDATOR_AGENT).toBe('validator');
    expect(FIX_VERIFIER_AGENT).toBe('fix-verifier');
  });

  it('should have DEFAULT_CONFIG with expected keys', () => {
    expect(DEFAULT_CONFIG['worktree-dir']).toBe('~/.cache/sheepdog/worktrees');
    expect(DEFAULT_CONFIG.model).toBe('claude-sonnet-4-5-20250929');
    expect(DEFAULT_CONFIG['agent-model']).toBe('claude-sonnet-4-5-20250929');
    expect(DEFAULT_CONFIG['light-model']).toBe('claude-haiku-4-5-20251001');
  });

  it('should have all complex types compilable', () => {
    // Verify complex types compile without errors
    assertType<ValidatedIssue>(null as unknown as ValidatedIssue);
    assertType<ReviewReport>(null as unknown as ReviewReport);
    assertType<ReviewMetrics>(null as unknown as ReviewMetrics);
    assertType<ReviewMetadata>(null as unknown as ReviewMetadata);
    assertType<ChecklistItem>(null as unknown as ChecklistItem);
    assertType<FixVerificationSummary>(
      null as unknown as FixVerificationSummary,
    );
    assertType<FixVerificationResult>(null as unknown as FixVerificationResult);
    assertType<MergeDecision>(null as unknown as MergeDecision);
    assertType<IssuePlugin>(null as unknown as IssuePlugin);
    assertType<SyncContext>(null as unknown as SyncContext);
    assertType<SyncResult>(null as unknown as SyncResult);
    assertType<IssueStatusResult>(null as unknown as IssueStatusResult);
    assertType<DiffFile>(null as unknown as DiffFile);
    assertType<DiffHunk>(null as unknown as DiffHunk);
    assertType<WorktreeInfo>(null as unknown as WorktreeInfo);
    assertType<CustomAgentDefinition>(null as unknown as CustomAgentDefinition);
    assertType<GlobalConfig>(null as unknown as GlobalConfig);
    assertType<ProjectConfig>(null as unknown as ProjectConfig);
    assertType<RuntimeConfig>(null as unknown as RuntimeConfig);

    expect(true).toBe(true);
  });
});
