# Step 2: 增量 Review

## 1. 功能概述

开发者根据审查反馈修改代码后，重新运行审查。系统加载上一次的审查结果（previousReview），对比当前代码变更，识别新引入的问题，并验证之前发现的问题是否已修复。审查完成后，通过 Issue 插件同步 issue 状态。

## 2. 输入

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| repoPath | string | 是 | Git 仓库的本地路径 |
| sourceRef | string | 是 | reviewBranch |
| targetRef | string | 是 | baseBranch |
| prId | string | 否 | PR 标识，仅用于 JIRA 等系统中关联具体 PR |

系统通过 `correlation_id`（项目名称 + reviewBranch + baseBranch）自动加载上一次的审查结果（JSON 文件）。

## 3. 输出

与 Step 1 相同的 `ReviewReport`，额外包含 `fix_verification` 字段：

```typescript
interface FixVerificationSummary {
  total_verified: number;
  by_status: Record<VerificationStatus, number>;
  results: FixVerificationResult[];
  verification_time_ms: number;
  tokens_used: number;
}

type VerificationStatus = 'fixed' | 'missed' | 'false_positive' | 'obsolete' | 'uncertain';

interface FixVerificationResult {
  original_issue_id: string;
  status: VerificationStatus;
  confidence: number;
  evidence: {
    checked_files: string[];
    examined_code: string[];
    related_changes: string;
    reasoning: string;
  };
  updated_issue?: {                    // 仅 status=missed 时
    title: string;
    description: string;
    suggestion: string;
  };
  false_positive_reason?: string;      // 仅 status=false_positive 时
}
```

## 4. 核心流程

```
加载 previousReview
        │
        ▼
┌──────────────────────────────┐
│ Phase 1: 构建审查上下文       │
│  · 获取 diff 内容            │
│  · 解析变更文件列表           │
│  · 智能选择 Agent            │
└──────────────┬───────────────┘
               │
               ▼
┌──────────────────────────────┐
│ Phase 2: 多 Agent 并行审查    │
│  · 审查当前变更中的新问题     │
│  · 实时去重                  │
└──────────────┬───────────────┘
               │
               ▼
┌──────────────────────────────┐
│ Phase 3: 修复验证             │
│  · fix-verifier Agent 工作    │
│  · 批量初筛：fixed/missed/    │
│    unclear                   │
│  · 深入验证未确定的问题       │
└──────────────┬───────────────┘
               │
               ▼
┌──────────────────────────────┐
│ Phase 4: 问题验证 + 聚合     │
│  · 验证新发现的问题          │
│  · 汇总新旧问题              │
│  · 生成报告                  │
└──────────────┬───────────────┘
               │
               ▼
┌──────────────────────────────┐
│ Phase 5: Issue 插件同步       │
│  · 重试上次 pending 的 issue  │
│  · 新问题 → 创建 issue        │
│  · fixed/false_positive/     │
│    obsolete → 关闭 issue     │
│  · missed → 更新 issue       │
│  · 持久化 ReviewReport       │
└──────────────────────────────┘
```

## 5. 修复验证详细需求

### 5.1 两阶段验证流程

#### Phase 1: 批量初筛

对 previousReview 中的每个 issue 快速分类：

- **resolved**：有明显证据表明已修复（如文件已删除、问题代码已移除）
- **unresolved**：问题代码未变或修复不完整
- **unclear**：需要深入调查

方法：使用 Grep 搜索问题代码模式，Read 变更文件做表面判断。

#### Phase 2: 深入验证

对 unresolved 和 unclear 的 issue 进行多轮调查：

- **Round 1**：确认问题状态 — 读取问题文件，检查问题代码是否仍存在
- **Round 2**：搜索替代修复 — 检查是否通过其他方式修复（不同文件、不同方法）
- **Round 3**：重新评估 — 对确认未修复的问题，判断是真正遗漏还是误报

### 5.2 验证状态定义

| 状态 | 说明 |
|------|------|
| **fixed** | 问题已正确修复 |
| **missed** | 问题仍然存在（开发者遗漏） |
| **false_positive** | 原始检测有误（问题实际不存在） |
| **obsolete** | 代码变更过大，问题已不再相关（文件删除、函数重写等） |
| **uncertain** | 无法确定（信息不足、需要运行时验证） |

## 6. Issue 插件同步规则

| 验证状态 | Issue 操作 |
|----------|-----------|
| 新发现的问题（confirmed） | 创建 issue |
| fixed | 关闭 issue，添加修复说明 |
| false_positive | 关闭 issue，标记为误报 |
| obsolete | 关闭 issue，标记为过时 |
| missed | 更新 issue 描述，反映当前代码状态 |
| uncertain | 不操作，保持原状态 |

**重试机制**：增量 review 加载上一次结果时，自动检测 `issue_sync.pending` 中的 issue 并重试同步，最多重试 3 次。

**Issue 关联**：增量 review 通过 `ValidatedIssue.remote_id`（如 JIRA issue key）定位远程系统中的 issue，执行关闭/更新操作。
