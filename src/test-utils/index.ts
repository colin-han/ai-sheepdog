/**
 * 共享测试工具
 * @see .SPEC/9-standard/development-plan.md - 测试策略
 */
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { execSync } from 'node:child_process';
import type {
  ValidatedIssue,
  ReviewReport,
  ReviewMetrics,
  ReviewMetadata,
  DiffFile,
  DiffHunk,
  FileCategory,
} from '../types/index.js';

/**
 * 创建带预设文件的临时 git repo
 * 包含不同类型文件：.ts、.json、.png、package-lock.json、.generated.ts
 */
export function createTestRepo(files?: Record<string, string>): string {
  const repoPath = fs.mkdtempSync(path.join(os.tmpdir(), 'sheepdog-test-'));

  // Initialize git repo
  execSync('git init', { cwd: repoPath });
  execSync('git config user.email "test@test.com"', { cwd: repoPath });
  execSync('git config user.name "Test User"', { cwd: repoPath });

  // Default files
  const defaultFiles: Record<string, string> = {
    'src/index.ts': `export function hello(): string {\n  return 'hello';\n}\n`,
    'src/service.ts': `export class UserService {\n  getUser(id: string) {\n    return id;\n  }\n}\n`,
    'package.json': `{"name": "test-project", "version": "1.0.0"}\n`,
    'tsconfig.json': `{"compilerOptions": {"target": "ES2022", "strict": true}}\n`,
    'README.md': '# Test Project\n',
    'public/logo.png': 'fake-png-data',
    'package-lock.json': '{"lockfileVersion": 2}\n',
    'src/generated/api.generated.ts':
      '// auto-generated\nexport const API = {};\n',
  };

  const allFiles = { ...defaultFiles, ...files };

  for (const [filePath, content] of Object.entries(allFiles)) {
    const fullPath = path.join(repoPath, filePath);
    const dir = path.dirname(fullPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(fullPath, content);
  }

  // Initial commit
  execSync('git add -A', { cwd: repoPath });
  execSync('git commit -m "Initial commit"', { cwd: repoPath });

  return repoPath;
}

/** 清理测试 repo */
export function cleanupTestRepo(repoPath: string): void {
  if (repoPath && repoPath.startsWith(os.tmpdir())) {
    fs.rmSync(repoPath, { recursive: true, force: true });
  }
}

/**
 * 在测试 repo 中创建分支并修改文件
 */
export function createBranchWithChanges(
  repoPath: string,
  branchName: string,
  changes: Record<string, string>,
  baseBranch = 'main',
): void {
  // Ensure we're on base branch
  try {
    execSync(`git checkout ${baseBranch}`, { cwd: repoPath });
  } catch {
    // If main doesn't exist (e.g., default branch is master), use current
  }

  // Create and checkout new branch
  execSync(`git checkout -b ${branchName}`, { cwd: repoPath });

  // Apply changes
  for (const [filePath, content] of Object.entries(changes)) {
    const fullPath = path.join(repoPath, filePath);
    const dir = path.dirname(fullPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(fullPath, content);
  }

  // Commit changes
  execSync('git add -A', { cwd: repoPath });
  execSync(`git commit -m "Changes on ${branchName}"`, { cwd: repoPath });
}

/**
 * 构造特定类型的测试 diff
 */
export function createTestDiff(repoPath: string, branchName: string): string {
  try {
    execSync(`git checkout main`, { cwd: repoPath });
  } catch {
    // Try master
    try {
      execSync(`git checkout master`, { cwd: repoPath });
    } catch {
      // Continue anyway
    }
  }

  const diff = execSync(
    `git diff main...${branchName} || git diff master...${branchName}`,
    { cwd: repoPath, encoding: 'utf-8' },
  );

  return diff;
}

/**
 * 构造 Agent 输出数据
 */
export function createMockAgentOutput(
  agentName: string,
  issues?: Partial<ValidatedIssue>[],
): Array<Record<string, unknown>> {
  if (issues) {
    return issues.map((issue, i) => ({
      id: `${agentName.substring(0, 3)}-${String(i + 1).padStart(3, '0')}`,
      file: issue.file ?? 'src/test.ts',
      line_start: issue.line_start ?? 1,
      line_end: issue.line_end ?? 1,
      category: issue.category ?? 'security',
      severity: issue.severity ?? 'error',
      title: issue.title ?? `Issue from ${agentName}`,
      description: issue.description ?? 'Test issue description',
      confidence: issue.confidence ?? 0.9,
      source_agent: agentName,
      validation_status: issue.validation_status ?? 'confirmed',
      final_confidence: issue.final_confidence ?? 0.9,
      grounding_evidence: issue.grounding_evidence ?? {
        checked_files: ['src/test.ts'],
        checked_symbols: [],
        reasoning: 'Test reasoning',
      },
    }));
  }

  // Default: one mock issue
  return [
    {
      id: `${agentName.substring(0, 3)}-001`,
      file: 'src/test.ts',
      line_start: 1,
      line_end: 5,
      category: 'security',
      severity: 'error',
      title: `Mock issue from ${agentName}`,
      description: 'This is a mock issue for testing',
      confidence: 0.9,
      source_agent: agentName,
      validation_status: 'confirmed',
      final_confidence: 0.9,
      grounding_evidence: {
        checked_files: ['src/test.ts'],
        checked_symbols: [],
        reasoning: 'Mock reasoning',
      },
    },
  ];
}

/**
 * 构造完整的 ReviewReport
 */
export function createTestReviewReport(
  overrides?: Partial<ReviewReport>,
): ReviewReport {
  const defaultIssues: ValidatedIssue[] = [
    {
      id: 'sec-001',
      file: 'src/auth.ts',
      line_start: 45,
      line_end: 50,
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
        checked_symbols: [{ name: 'query', file: 'src/auth.ts', line: 45 }],
        reasoning: 'String interpolation used in SQL query',
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
      suggestion: 'Add null check before accessing property',
      confidence: 0.85,
      source_agent: 'logic-reviewer',
      validation_status: 'confirmed',
      final_confidence: 0.85,
      grounding_evidence: {
        checked_files: ['src/service.ts'],
        checked_symbols: [],
        reasoning: 'No null check before property access',
      },
    },
  ];

  const metrics: ReviewMetrics = {
    total_scanned: 3,
    confirmed: 2,
    rejected: 0,
    uncertain: 1,
    by_severity: { critical: 1, error: 1, warning: 0, suggestion: 0 },
    by_category: { security: 1, logic: 1, performance: 0, style: 0 },
    files_reviewed: 2,
  };

  const metadata: ReviewMetadata = {
    correlation_id: 'test-project:feature-branch:main',
    timestamp: new Date().toISOString(),
    source_ref: 'feature-branch',
    target_ref: 'main',
    repo_path: '/tmp/test-project',
    project_name: 'test-project',
    agents_used: ['security-reviewer', 'logic-reviewer'],
    review_time_ms: 5000,
    tokens_used: 10000,
    is_incremental: false,
    models: {
      agent_model: 'claude-sonnet-4-5-20250929',
      light_model: 'claude-haiku-4-5-20251001',
    },
  };

  return {
    summary: 'Found 2 confirmed issues',
    risk_level: 'high',
    issues: defaultIssues,
    checklist: [],
    metrics,
    metadata,
    ...overrides,
  };
}

/**
 * 构造测试 DiffFile
 */
export function createTestDiffFile(overrides?: Partial<DiffFile>): DiffFile {
  const defaultHunk: DiffHunk = {
    old_start: 1,
    old_count: 3,
    new_start: 1,
    new_count: 5,
    content: '-old line\n+new line\n+added line',
  };

  return {
    path: 'src/test.ts',
    change_type: 'modified',
    category: 'source' as FileCategory,
    is_whitespace_only: false,
    hunks: [defaultHunk],
    diff_content: 'mock diff content',
    ...overrides,
  };
}
