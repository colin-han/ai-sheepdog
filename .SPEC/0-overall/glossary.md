# 词汇表

此文件中包含该项目中使用到的关键词汇的定义，所有代码在声明变量或函数时都需要和此文档中声明的词汇保持一致。

## 核心概念

| 术语 | 代码命名 | 说明 |
|------|---------|------|
| 关联标识 | `correlation_id` | 用于关联同一 PR 多轮 review 的唯一标识，格式为 `项目名称:reviewBranch:baseBranch` |
| 项目名称 | `project_name` | 用于 correlation_id 的组成部分。优先级：`.sheepdog/config.yaml` > git remote URL > 目录名 |
| 审查报告 | `ReviewReport` | 一次 review 的完整输出，包含 issues、metrics、metadata 等 |
| 已验证问题 | `ValidatedIssue` | 经过 validator Agent 验证后的代码问题 |

## 分支与引用

| 术语 | 代码命名 | 说明 |
|------|---------|------|
| 审查分支 | `sourceRef` / `reviewBranch` | 需要被审查的分支（开发者的 feature branch） |
| 基准分支 | `targetRef` / `baseBranch` | 作为对比基准的分支（通常是 main/develop） |

## Agent 系统

| 术语 | 代码命名 | 说明 |
|------|---------|------|
| 内置 Agent | Built-in Agent | 系统自带的审查 Agent：security-reviewer、logic-reviewer、style-reviewer、performance-reviewer |
| 验证器 | `validator` | 以挑战模式验证其他 Agent 发现问题的 Agent |
| 修复验证器 | `fix-verifier` | 验证之前发现的问题是否已修复的 Agent |
| 自定义 Agent | Custom Agent | 用户通过 `.sheepdog/agents/*.md` 定义的 Agent |

## 问题相关

| 术语 | 代码命名 | 说明 |
|------|---------|------|
| 严重程度 | `severity` | 问题严重程度，从高到低：`critical` > `error` > `warning` > `suggestion` |
| 问题类别 | `category` | 问题所属类别：`security`、`logic`、`performance`、`style` |
| 验证状态 | `validation_status` | validator 的判断结果：`confirmed`、`rejected`、`uncertain` |
| 修复状态 | `VerificationStatus` | fix-verifier 的判断结果：`fixed`、`missed`、`false_positive`、`obsolete`、`uncertain` |
| 置信度 | `confidence` | Agent 对问题的把握程度，0-1 浮点数 |
| 远程 ID | `remote_id` | Issue 在远程系统中的标识（如 JIRA issue key `PROJ-123`），同步成功后填充 |
| 阻止合并 | blocking | severity 严格高于 `allow_severity` 的未关闭 issue |
| 允许严重程度 | `allow_severity` | status 命令中配置的可忽略严重程度阈值，该级别及以下不阻止合并 |

## Issue 插件

| 术语 | 代码命名 | 说明 |
|------|---------|------|
| Issue 插件 | `IssuePlugin` | 将审查问题同步到外部系统的插件接口 |
| 同步上下文 | `SyncContext` | 插件同步时的输入数据，包含 correlation_id 和操作列表 |
| 同步结果 | `SyncResult` | 插件同步后的输出数据 |
| 同步状态 | `IssueSyncStatus` | ReviewReport 中记录的 issue 同步状态：success/partial/failed |
| Issue 状态查询 | `IssueStatusResult` | 插件查询 issue 状态的返回结构，用于 CI Gate |

## Git 操作

| 术语 | 代码命名 | 说明 |
|------|---------|------|
| 工作树 | `worktree` | git worktree，用于让 Agent 访问 reviewBranch 的完整文件内容。存储在 `worktree-dir` 配置的目录中，默认 `~/.cache/sheepdog/worktrees` |
| 三路 diff | Three-dot diff | 分支对比模式：`origin/target...origin/source` |
| 两路 diff | Two-dot diff | commit 对比模式：`target..source` |
| 文件分类 | `FileCategory` | diff 文件的智能分类：`source`、`config`、`data`、`asset`、`lock`、`generated` |

## 项目定制化

| 术语 | 代码命名 | 说明 |
|------|---------|------|
| 项目配置目录 | `.sheepdog/` | 项目根目录下的定制化配置目录 |
| 触发模式 | `trigger_mode` | 自定义 Agent 的触发方式：`rule`（规则匹配）、`llm`（语义判断） |
| 项目规则 | Rules | `.sheepdog/rules/` 中的补充审查规则 |
| 项目标准感知 | Project Standards | 自动提取项目的 ESLint/TypeScript/Prettier 配置作为审查依据 |

## 配置层级

| 术语 | 位置 | 说明 |
|------|------|------|
| 全局配置 | `~/.config/sheepdog/config.yaml` | 用户级别的配置（JIRA URL、token、模型、worktree 目录等） |
| 项目配置 | `.sheepdog/config.yaml` | 项目级别的配置（项目名称、忽略模式、Agent 启禁用等） |
| 环境变量 | `SHEEPDOG_*` | 最高优先级，用于 CI 环境 |

## 文件路径

| 术语 | 路径 | 说明 |
|------|------|------|
| 审查结果目录 | `.sheepdog/reviews/` | 存储 ReviewReport JSON 文件 |
| 审查结果文件 | `.sheepdog/reviews/<correlation_id>/<timestamp>.json` | 单次审查结果 |
| 自定义 Agent | `.sheepdog/agents/*.md` | 自定义 Agent 定义文件 |
| 项目规则 | `.sheepdog/rules/*.md` | 补充审查规则文件 |
| 自定义检查清单 | `.sheepdog/rules/checklist.yaml` | 自定义检查清单 |
