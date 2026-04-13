# Step 1: Review + Issue 同步

> 基于 [code-argus](https://github.com/Edric-Li/code-argus) 的实现分析，结合 AI Sheepdog 的产品定位进行适配。

## 1. 功能概述

用户提供 git repo 路径和两个分支名称（baseBranch 和 reviewBranch），系统利用 git worktree 对比两个分支的代码变更，通过多 AI Agent 协作对变更代码进行审查，识别其中的问题并输出结构化的审查报告。审查完成后，通过 Issue 插件批量同步到 issue management system。

## 2. 输入

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| repoPath | string | 是 | Git 仓库的本地路径 |
| sourceRef | string | 是 | reviewBranch（分支名或 commit SHA） |
| targetRef | string | 是 | baseBranch（分支名或 commit SHA） |
| prId | string | 否 | PR 标识（如 MR IID），仅用于 JIRA 等系统中关联具体 PR |
| previousReview | PreviousReviewData | 否 | 上一次审查结果，用于增量审查（Step 2 回传） |

系统自动检测 ref 类型：
- **分支名称** → 使用三路 diff（`origin/target...origin/source`），适用于首次 PR 审查
- **Commit SHA** → 使用两路 diff（`target..source`），适用于增量审查

## 3. 输出

### 3.1 ReviewReport

```typescript
interface ReviewReport {
  summary: string;                          // 审查摘要
  risk_level: 'high' | 'medium' | 'low';   // 风险等级
  issues: ValidatedIssue[];                 // 已验证的问题列表
  checklist: ChecklistItem[];               // 检查清单结果
  metrics: ReviewMetrics;                   // 审查统计指标
  metadata: ReviewMetadata;                 // 审查元数据
  fix_verification?: FixVerificationSummary; // 修复验证结果（增量审查时）
  issue_sync?: IssueSyncStatus;             // Issue 同步状态
}
```

### 3.2 ValidatedIssue（核心数据）

```typescript
interface ValidatedIssue {
  id: string;                               // 唯一标识（如 "sec-001"）
  file: string;                             // 文件路径
  line_start: number;                       // 起始行号
  line_end: number;                         // 结束行号
  category: 'security' | 'logic' | 'performance' | 'style';
  severity: 'critical' | 'error' | 'warning' | 'suggestion';
  title: string;                            // 问题标题
  description: string;                      // 详细描述
  suggestion?: string;                      // 修复建议
  code_snippet?: string;                    // 问题代码片段
  confidence: number;                       // 初始置信度 (0-1)
  source_agent: AgentType;                  // 来源 Agent
  // 验证后字段
  validation_status: 'confirmed' | 'rejected' | 'uncertain';
  final_confidence: number;                 // 验证后置信度 (0-1)
  grounding_evidence: {
    checked_files: string[];
    checked_symbols: SymbolLookup[];
    reasoning: string;
  };
  // Issue 同步字段
  remote_id?: string;                       // 远程系统中的 ID（如 JIRA issue key "PROJ-123"），同步成功后填充
}
```

### 3.3 ReviewMetrics

```typescript
interface ReviewMetrics {
  total_scanned: number;                    // 验证前的问题总数
  confirmed: number;                        // 确认的问题数
  rejected: number;                         // 拒绝的问题数
  uncertain: number;                        // 不确定的问题数
  by_severity: Record<Severity, number>;    // 按严重程度分布
  by_category: Record<IssueCategory, number>; // 按类别分布
  files_reviewed: number;                   // 审查的文件数
}
```

## 4. 核心流程

```
用户输入 repoPath + sourceRef + targetRef（可选 prId）
        │
        ▼
┌──────────────────────────────┐
│ Phase 1: 构建审查上下文       │
│  · 获取 diff 内容            │
│  · 解析变更文件列表           │
│  · 智能分类变更文件           │
│  · 提取项目编码标准           │
│  · 创建/复用 git worktree    │
│  · 智能选择所需 Agent        │
└──────────────┬───────────────┘
               │
               ▼
┌──────────────────────────────┐
│ Phase 2: 多 Agent 并行审查    │
│  · 内置 Agent 并行运行        │
│  · 自定义 Agent 按条件触发    │
│  · 实时报告发现的问题         │
│  · 实时去重                  │
└──────────────┬───────────────┘
               │
               ▼
┌──────────────────────────────┐
│ Phase 3: 问题验证             │
│  · 挑战模式验证问题真实性     │
│  · 过滤误报                  │
│  · 修复验证（可选）           │
└──────────────┬───────────────┘
               │
               ▼
┌──────────────────────────────┐
│ Phase 4: 聚合与报告生成       │
│  · 汇总所有已验证的问题       │
│  · 计算审查指标               │
│  · 评估风险等级               │
│  · 生成结构化审查报告         │
└──────────────┬───────────────┘
               │
               ▼
┌──────────────────────────────┐
│ Phase 5: Issue 插件同步       │
│  · 过滤 rejected 的问题       │
│  · 批量调用 Issue 插件        │
│  · 持久化 ReviewReport       │
└──────────────────────────────┘
```

## 5. 详细需求

### 5.1 Git 操作

#### 5.1.1 Diff 获取

- 验证仓库路径有效性
- 自动 fetch 远程引用（带文件锁防止并发冲突）
- 根据 ref 类型选择 diff 策略（分支 vs commit）
- 增量模式下智能过滤合并噪声（只关注实际变更，过滤纯 merge commit）

#### 5.1.2 Diff 解析

- 按文件分割 diff 内容
- 解析每个 hunk 的行范围和变更内容
- 智能分类变更文件：
  - **source** — 源代码文件（高优先级，完整审查）
  - **config** — 配置文件（高优先级，审查格式和关键配置）
  - **data** — 数据文件（只检查格式）
  - **asset** — 静态资源（只检查文件名）
  - **lock** — 锁文件（跳过内容审查）
  - **generated** — 生成文件（跳过内容审查）
- 检测纯空白变更并标记

#### 5.1.3 Worktree 管理

- 为 reviewBranch 创建临时 git worktree，供 Agent 读取完整文件内容
- 持久化 worktree 管理，支持复用和缓存
- 自动清理过期 worktree
- 命名策略：`{repoName}_{branchOrCommit}`

### 5.2 Agent 系统

#### 5.2.1 内置 Agent

基于 Claude Agent SDK 实现，每个 Agent 是一个专门化的审查角色：

| Agent | 职责 | 关注领域 |
|-------|------|----------|
| **security-reviewer** | 安全漏洞检测 | 注入攻击、认证授权、敏感数据暴露、输入验证、安全配置、依赖安全 |
| **logic-reviewer** | 逻辑错误检测 | 空值访问、错误处理、竞态条件、边界条件、资源管理、类型安全、API 兼容性 |
| **style-reviewer** | 代码风格审查 | 命名约定、代码组织、代码清晰度、文档、一致性 |
| **performance-reviewer** | 性能问题检测 | 算法复杂度、数据库 I/O、内存问题、渲染性能、网络缓存 |

#### 5.2.2 验证 Agent

| Agent | 职责 |
|-------|------|
| **validator** | 以挑战模式验证其他 Agent 发现的问题，判断真伪，过滤误报 |
| **fix-verifier** | 验证之前发现的问题是否已修复（需要传入上一次审查结果） |

#### 5.2.3 自定义 Agent（扩展能力）

支持用户通过 YAML 文件定义自定义审查 Agent：
- **触发模式**：rule（文件路径匹配）、llm（内容相似度）、hybrid（混合）
- **配置项**：名称、描述、触发条件、审查 prompt、输出类别和默认严重程度

#### 5.2.4 智能选择

不是所有文件都需要所有 Agent 审查。系统根据变更文件的特征智能选择所需的 Agent：
1. **规则层**：基于文件扩展名、类别、安全敏感性等特征快速匹配
2. **LLM 层**：对规则层置信度不够的情况（< 0.8），调用 LLM 辅助决策

### 5.3 问题处理

#### 5.3.1 实时去重

多 Agent 并行审查时可能发现相同问题，需要去重：

1. **规则层快速去重**：相同文件 + 重叠行范围 → 直接判定为重复（O(1)）
2. **LLM 语义去重**：基于语义相似度判断是否为同一问题的不同表述

#### 5.3.2 问题验证

采用挑战模式验证问题的真实性：
- 验证问题位置的准确性
- 验证问题描述的准确性
- 识别缓解因素
- 结论：确认 / 拒绝 / 不确定
- 自动拒绝低置信度问题

### 5.4 项目标准感知

自动提取项目的编码规范作为审查依据：
- ESLint 配置（.eslintrc.*、.eslintignore）
- TypeScript 配置（tsconfig.json、strict 模式）
- Prettier 配置（.prettierrc）
- 项目命名约定

### 5.5 Issue 插件同步

审查完成后，批量调用 Issue 插件同步问题：

- **过滤规则**：跳过 `validation_status: rejected` 的问题
- **同步规则**：每个 `ValidatedIssue` 创建一个独立的 issue，包括 `severity: suggestion`
- **关联标识**：使用 `项目名称 + reviewBranch + baseBranch` 作为 correlation_id，关联多轮 review 的 issue
- **PR 关联**：prId 单独存储，仅用于 JIRA 等系统中关联具体的 PR/MR
- **持久化**：ReviewReport 保存为 JSON 文件，供增量审查使用

### 5.6 审查报告

#### 5.6.1 报告格式

支持多种输出格式：
- **JSON**：结构化数据，供下游系统消费
- **Markdown**：人类可读的报告

## 6. 非功能需求

| 需求 | 说明 |
|------|------|
| 流式处理 | Agent 审查过程中实时输出进度和发现的问题 |
| 中断支持 | 通过 AbortController 支持优雅中断 |
| 并发控制 | 文件锁机制防止并发 git 操作冲突 |
| 多语言 | 支持中文（默认）和英文输出 |
| 可配置模型 | 支持为不同阶段配置不同的 LLM 模型 |
