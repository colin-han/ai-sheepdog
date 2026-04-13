# AI Sheepdog

一个 AI Code Review 工具，利用 AI Agent 对 PR 进行代码审查，并联动 Issue 管理系统追踪问题生命周期。

## 核心理念

不是简单地分析 git diff，而是让 AI Agent 结合整个 repo 上下文来理解代码变更的影响，提供更深层次的代码审查。

## 技术选型

- **LLM Review**：基于 Claude Agent SDK 实现，Agent 可自主探索整个代码库
- **Issue 同步**：插件化架构，支持 JIRA、GitLab/GitHub PR 评论、Linear 等多种 issue management system

## 用户界面

**CLI 工具**，主要包含两个命令：

```bash
# 审查代码（首次/增量）
sheepdog review ./my-project feature-branch main --pr-id=42

# 检查合并状态（CI gate）
sheepdog status ./my-project feature-branch main
```

`sheepdog status` 作为 GitLab CI pipeline 的一个 step 使用，检查 issue 状态决定 pipeline 是否通过，阻止有问题的代码合并到主分支。

## 整体流程

```
用户提供 repo 路径 + baseBranch + reviewBranch（可选 prId）
        │
        ▼
┌─────────────────────────────────────────┐
│ Step 1: Review + Issue 同步（插件化）    │
│                                         │
│  Phase 1-3: 多 Agent 审查、验证         │
│    · git worktree 对比两个分支           │
│    · Claude Agent 审查变更代码           │
│    · 挑战模式验证问题                    │
│                                         │
│  Phase 4: 聚合报告                      │
│    · 生成 ReviewReport                  │
│                                         │
│  Phase 5: 调用 Issue 插件               │
│    · 批量同步 validated issues           │
│    · 跳过 validation_status=rejected    │
│    ┌──────────────────────────────┐     │
│    │ JIRA Plugin                  │     │
│    │ GitLab MR Comment Plugin     │     │
│    │ GitHub PR Comment Plugin     │     │
│    │ Linear Plugin（未来）         │     │
│    └──────────────────────────────┘     │
└──────────────────┬──────────────────────┘
                   │
                   ▼
            用户修改代码
                   │
                   ▼
┌─────────────────────────────────────────┐
│ Step 2: 增量 Review                     │
│                                         │
│  · 传入 previousReview                  │
│  · 识别新引入的问题                      │
│  · 修复验证（已修复 / 未修复 / 误报）    │
│  · 调用 Issue 插件：                     │
│    · 新问题 → 创建 issue                 │
│    · 已修复 → 关闭 issue                 │
│    · 误报 → 关闭 issue                  │
└──────────────────┬──────────────────────┘
                   │
                   ▼
┌─────────────────────────────────────────┐
│ Step 3: 合并决策（CI Gate）              │
│                                         │
│  sheepdog status 命令                    │
│  · 查询关联 issue 状态                   │
│  · 全部关闭 → exit 0（允许合并）        │
│  · 存在未关闭 → exit 1（阻止合并）      │
└─────────────────────────────────────────┘
```

## Issue 插件设计

- 每个 `ValidatedIssue` 创建一个独立的 issue
- `validation_status: rejected` 的问题直接跳过
- `severity: suggestion` 的问题也需要创建 issue
- 使用 `项目名称 + reviewBranch + baseBranch` 作为关联标识（correlation_id），将多轮 review 的 issue 关联在一起
- prId 单独存储，仅用于 JIRA 等系统中关联具体的 PR/MR
- 插件在 review 完成后**批量调用**，而非逐个同步
- PR 评论也是 Issue 插件的一种实现（GitLab MR Comment / GitHub PR Comment）

## 需求文档索引

| 模块 | 文档 | 状态 |
|------|------|------|
| Step 1: Review + Issue 同步 | [1-requirement/review.md](../1-requirement/review.md) | 已完成 |
| Step 2: 增量 Review | [1-requirement/incremental-review.md](../1-requirement/incremental-review.md) | 已完成 |
| Step 3: 合并决策 | [1-requirement/merge-decision.md](../1-requirement/merge-decision.md) | 已完成 |
| Issue 插件接口 | [2-design/issue-plugin.md](../2-design/issue-plugin.md) | 已完成 |
| 项目定制化 | [2-design/customization.md](../2-design/customization.md) | 已完成 |
| CLI 接口 | [2-design/cli.md](../2-design/cli.md) | 待 review |
| 开发计划 | [9-standard/development-plan.md](../9-standard/development-plan.md) | 已完成 |
