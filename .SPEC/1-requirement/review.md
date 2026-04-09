# Code Review 功能需求文档

> 基于 [code-argus](https://github.com/Edric-Li/code-argus) 的实现分析，结合 AI Sheepdog 的产品定位进行适配。

## 1. 功能概述

用户提供 git repo 路径和两个分支名称（baseBranch 和 reviewBranch），系统利用 git worktree 对比两个分支的代码变更，通过多 AI Agent 协作对变更代码进行审查，识别其中的问题并输出结构化的审查报告。

## 2. 输入

| 参数 | 说明 |
|------|------|
| repoPath | Git 仓库的本地路径 |
| sourceRef | 审查分支名称或 commit SHA（reviewBranch） |
| targetRef | 基准分支名称或 commit SHA（baseBranch） |
| previousReview（可选） | 上一次的审查结果，用于修复验证 |

系统自动检测 ref 类型：
- **分支名称** → 使用三路 diff（`origin/target...origin/source`），适用于首次 PR 审查
- **Commit SHA** → 使用两路 diff（`target..source`），适用于增量审查

## 3. 核心流程

```
用户输入 repoPath + sourceRef + targetRef
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
└──────────────────────────────┘
```

## 4. 详细需求

### 4.1 Git 操作

#### 4.1.1 Diff 获取

- 验证仓库路径有效性
- 自动 fetch 远程引用（带文件锁防止并发冲突）
- 根据 ref 类型选择 diff 策略（分支 vs commit）
- 增量模式下智能过滤合并噪声（只关注实际变更，过滤纯 merge commit）

#### 4.1.2 Diff 解析

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

#### 4.1.3 Worktree 管理

- 为 reviewBranch 创建临时 git worktree，供 Agent 读取完整文件内容
- 持久化 worktree 管理，支持复用和缓存
- 自动清理过期 worktree
- 命名策略：`{repoName}_{branchOrCommit}`

### 4.2 Agent 系统

#### 4.2.1 内置 Agent

基于 Claude Agent SDK 实现，每个 Agent 是一个专门化的审查角色：

| Agent | 职责 | 关注领域 |
|-------|------|----------|
| **security-reviewer** | 安全漏洞检测 | 注入攻击、认证授权、敏感数据暴露、输入验证、安全配置、依赖安全 |
| **logic-reviewer** | 逻辑错误检测 | 空值访问、错误处理、竞态条件、边界条件、资源管理、类型安全、API 兼容性 |
| **style-reviewer** | 代码风格审查 | 命名约定、代码组织、代码清晰度、文档、一致性 |
| **performance-reviewer** | 性能问题检测 | 算法复杂度、数据库 I/O、内存问题、渲染性能、网络缓存 |

#### 4.2.2 验证 Agent

| Agent | 职责 |
|-------|------|
| **validator** | 以挑战模式验证其他 Agent 发现的问题，判断真伪，过滤误报 |
| **fix-verifier** | 验证之前发现的问题是否已修复（需要传入上一次审查结果） |

#### 4.2.3 自定义 Agent（扩展能力）

支持用户通过 YAML 文件定义自定义审查 Agent：
- **触发模式**：rule（文件路径匹配）、llm（内容相似度）、hybrid（混合）
- **配置项**：名称、描述、触发条件、审查 prompt、输出类别和默认严重程度

#### 4.2.4 智能选择

不是所有文件都需要所有 Agent 审查。系统根据变更文件的特征智能选择所需的 Agent：
1. **规则层**：基于文件扩展名、类别、安全敏感性等特征快速匹配
2. **LLM 层**：对规则层置信度不够的情况（< 0.8），调用 LLM 辅助决策

### 4.3 问题处理

#### 4.3.1 问题数据结构

每个问题包含以下信息：

| 字段 | 说明 |
|------|------|
| id | 唯一标识符 |
| file | 文件路径 |
| line_start / line_end | 起止行号 |
| category | 问题类别（security / logic / style / performance） |
| severity | 严重程度（critical / error / warning / info） |
| title | 问题标题 |
| description | 详细描述 |
| suggestion | 修复建议 |
| confidence | 置信度（0-1） |
| source_agent | 来源 Agent |

#### 4.3.2 实时去重

多 Agent 并行审查时可能发现相同问题，需要去重：

1. **规则层快速去重**：相同文件 + 重叠行范围 → 直接判定为重复（O(1)）
2. **LLM 语义去重**：基于语义相似度判断是否为同一问题的不同表述

#### 4.3.3 问题验证

采用挑战模式验证问题的真实性：
- 验证问题位置的准确性
- 验证问题描述的准确性
- 识别缓解因素
- 结论：确认 / 拒绝 / 不确定
- 自动拒绝低置信度问题

#### 4.3.4 修复验证（增量审查）

当提供上一次审查结果时，验证之前的问题是否已修复：
1. **批量初筛**：快速分类为 fixed / missed / false_positive / obsolete / uncertain
2. **深入调查**：对未确定的问题进行多轮调查

### 4.4 项目标准感知

自动提取项目的编码规范作为审查依据：
- ESLint 配置（.eslintrc.*、.eslintignore）
- TypeScript 配置（tsconfig.json、strict 模式）
- Prettier 配置（.prettierrc）
- 项目命名约定

### 4.5 审查报告

#### 4.5.1 报告内容

| 内容 | 说明 |
|------|------|
| summary | 审查摘要 |
| risk_level | 风险等级（low / medium / high / critical） |
| issues | 已验证的问题列表 |
| metrics | 审查指标（文件数、Agent 数、问题数、token 消耗等） |
| metadata | 元数据（时间、模型、分支信息等） |

#### 4.5.2 报告格式

支持多种输出格式：
- **JSON**：结构化数据，供下游系统（JIRA 集成）消费
- **Markdown**：人类可读的报告

## 5. 非功能需求

| 需求 | 说明 |
|------|------|
| 流式处理 | Agent 审查过程中实时输出进度和发现的问题 |
| 中断支持 | 通过 AbortController 支持优雅中断 |
| 并发控制 | 文件锁机制防止并发 git 操作冲突 |
| 多语言 | 支持中文（默认）和英文输出 |
| 可配置模型 | 支持为不同阶段配置不同的 LLM 模型 |

## 6. 与 code-argus 的差异点

以下方面 AI Sheepdog 可能需要与 code-argus 不同的处理（待后续讨论确认）：

- **运行方式**：code-argus 是 CLI 工具，AI Sheepdog 可能需要支持 API 服务或 CI/CD 集成
- **输出对接**：AI Sheepdog 需要将问题同步到 JIRA，需要适配 issue 粒度和数据结构
- **修复追踪**：AI Sheepdog 需要维护跨次审查的问题状态追踪，而不只是一次性对比
- **合并决策**：AI Sheepdog 需要基于 JIRA issue 状态给出合并建议

## 7. 参考资料

- code-argus 源码：https://github.com/Edric-Li/code-argus
- Claude Agent SDK：用于构建多 Agent 审查系统
