# Issue 插件接口设计

## 1. 概述

Issue 插件负责将审查发现的问题同步到 issue management system。采用插件化架构，支持扩展不同的 issue management system 实现。

**Issue management system 不局限于传统 issue tracker，PR/MR 评论也是一种插件实现。**

## 2. 插件接口

```typescript
interface IssuePlugin {
  /** 插件名称 */
  name: string;

  /** 初始化配置 */
  initialize(config: PluginConfig): Promise<void>;

  /**
   * 批量同步问题到 issue management system
   * @param context 同步上下文（包含关联标识、问题列表、操作类型）
   */
  sync(context: SyncContext): Promise<SyncResult>;

  /**
   * 查询关联的 issue 状态（用于 CI Gate）
   * @param correlationId 关联标识（项目名称 + reviewBranch + baseBranch）
   * @returns 关联的 issue 及其状态
   */
  getStatus(correlationId: string): Promise<IssueStatusResult>;
}
```

## 3. 数据结构

### 3.1 SyncContext

```typescript
interface SyncContext {
  /** 关联标识：项目名称 + reviewBranch + baseBranch */
  correlation_id: string;
  /** 本次同步的问题操作列表 */
  operations: IssueOperation[];
}

type IssueOperation =
  | { type: 'create'; issue: ValidatedIssue }
  | { type: 'close'; issue_id: string; reason: string; status: VerificationStatus }
  | { type: 'update'; issue_id: string; issue: ValidatedIssue };
```

### 3.2 SyncResult

```typescript
interface SyncResult {
  /** 操作结果列表 */
  results: OperationResult[];
  /** 是否全部成功 */
  success: boolean;
  /** 错误信息 */
  errors?: string[];
}

interface OperationResult {
  /** 对应的本地 issue ID */
  local_issue_id: string;
  /** 远程系统的 issue ID（如 JIRA issue key、PR 评论 ID） */
  remote_issue_id?: string;
  /** 操作类型 */
  operation: IssueOperation['type'];
  /** 是否成功 */
  success: boolean;
  /** 错误信息 */
  error?: string;
}
```

### 3.3 IssueStatusResult（CI Gate 使用）

```typescript
interface IssueStatusResult {
  /** 关联标识 */
  correlation_id: string;
  /** 关联的所有 issue */
  issues: RemoteIssue[];
  /** 是否全部关闭 */
  all_closed: boolean;
  /** 未关闭的 issue 数量 */
  open_count: number;
}

interface RemoteIssue {
  /** 远程系统中的 issue ID */
  remote_id: string;
  /** 本地 issue ID */
  local_id: string;
  /** 是否已关闭 */
  is_closed: boolean;
  /** 远程系统中的状态 */
  remote_status: string;
  /** 标题 */
  title: string;
}
```

### 3.4 PluginConfig

```typescript
interface PluginConfig {
  /** 远程系统连接配置（如 JIRA URL、API token） */
  connection: Record<string, string>;
  /** issue 类型映射配置 */
  severity_mapping?: Record<Severity, string>;
  /** 关联标识前缀 */
  correlation_prefix?: string;
}
```

## 4. 映射规则

### 4.1 Severity → Issue Priority

| Severity | 默认映射 |
|----------|---------|
| critical | Highest / Blocker |
| error | High / Major |
| warning | Medium |
| suggestion | Low / Minor |

### 4.2 ValidatedIssue → Issue Description

```
## 问题描述
{description}

## 代码位置
文件: {file}
行号: {line_start} - {line_end}

## 问题代码
```
{code_snippet}
```

## 修复建议
{suggestion}

## 审查信息
- 类别: {category}
- 严重程度: {severity}
- 来源: {source_agent}
- 置信度: {final_confidence}
- 关联 PR: {correlation_id}
```

## 5. 错误处理

### 5.1 核心原则：review 和 issue 同步解耦

- **ReviewReport 始终保存** — 无论 issue 同步是否成功，JSON 文件都会保存
- **Issue 同步失败不阻塞 review** — review 流程正常完成，同步结果记录在 ReviewReport 中
- **增量 review 时自动重试** — 检测到未同步的 issue，自动重试同步

### 5.2 同步状态记录

```typescript
interface IssueSyncStatus {
  /** 同步总体状态 */
  status: 'success' | 'partial' | 'failed';
  /** 已同步成功的 issue ID */
  synced: string[];
  /** 未同步的 issue ID（下次增量 review 时重试） */
  pending: string[];
  /** 失败详情 */
  errors: SyncError[];
}

interface SyncError {
  /** 插件名称 */
  plugin: string;
  /** 问题 ID */
  issue_id: string;
  /** 错误信息 */
  error: string;
  /** 已重试次数 */
  retry_count: number;
}
```

### 5.3 重试策略

- 单次 review 中**不做即时重试**（避免阻塞 review 流程）
- 增量 review 加载上一次结果时，检测 pending 中的 issue，自动重试同步
- 最多重试 3 次，超过后标记为 `failed`，CLI 输出中提示用户手动处理

### 5.4 处理流程

```
Review 完成 → 保存 ReviewReport JSON
        │
        ▼
┌──────────────────────┐
│ 对每个插件调用 sync() │
└──────────┬───────────┘
           │
     ┌─────┴──────┐
     │ 成功？      │
     ├─ 是 → 记录到 synced
     └─ 否 → 记录到 pending + errors
           │
           ▼
┌──────────────────────┐
│ 更新 ReviewReport    │
│ issue_sync 字段      │
└──────────┬───────────┘
           │
           ▼
┌──────────────────────┐
│ 全部成功？           │
├─ 是 → status=success
├─ 部分 → status=partial
└─ 全部失败 → status=failed
```

## 6. 插件实现

### 5.1 JIRA 插件

- API：使用 JIRA REST API
- 认证：支持 API Token 和 OAuth
- 关联：通过 JIRA issue 的 labels 或 custom field 存储 `correlation_id`
- 查询：通过 `correlation_id` 查询关联的所有 issue，判断状态
- 批量操作：减少 API 调用次数，使用批量创建/更新接口

### 5.2 GitLab MR Comment 插件

- API：使用 GitLab Merge Request API
- 同步方式：在 MR 中创建/更新评论，每条评论对应一个 issue
- 关联：通过评论的标签（如 `sheepdog:sec-001`）标识
- 状态查询：解析 MR 中所有 sheepdog 标签的评论，检查是否有未关闭的标记

### 5.3 GitHub PR Comment 插件

- API：使用 GitHub Pull Request API
- 同步方式：在 PR 中创建/更新 review comments（行内评论 + summary 评论）
- 关联：通过评论的标签标识
- 状态查询：解析 PR 中所有 sheepdog 标签的评论

## 6. 待实现插件

| 插件 | 优先级 | 状态 |
|------|--------|------|
| JIRA | P0 | 待实现 |
| GitLab MR Comment | P1 | 待实现 |
| GitHub PR Comment | P1 | 未来 |
| Linear | P2 | 未来 |
