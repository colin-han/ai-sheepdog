# CLI 接口设计

## 1. 概述

```
sheepdog <command> [options]
```

## 2. 命令列表

| 命令 | 说明 |
|------|------|
| `sheepdog review` | 审查代码（首次/增量），同步 issue |
| `sheepdog status` | 检查合并状态（CI gate） |
| `sheepdog config` | 管理全局配置 |

---

## 3. `sheepdog review`

审查指定分支的代码变更，通过多 Agent 并行审查、验证、生成报告，并通过 Issue 插件同步问题。

### 3.1 用法

```bash
sheepdog review <repo> <source> <target> [options]
```

### 3.2 位置参数

| 参数 | 必填 | 说明 |
|------|------|------|
| `<repo>` | 是 | Git 仓库路径（本地路径） |
| `<source>` | 是 | reviewBranch（分支名或 commit SHA） |
| `<target>` | 是 | baseBranch（分支名或 commit SHA） |

系统自动检测 ref 类型：
- 分支名称 → 三路 diff（首次审查）
- Commit SHA → 两路 diff（增量审查）

### 3.3 选项

| 选项 | 默认值 | 说明 |
|------|--------|------|
| `--previous-review=<path>` | - | 上一次审查结果的 JSON 文件路径（增量审查时使用） |
| `--json` | false | 以 JSON 格式输出（用于服务集成） |
| `--verbose` | false | 详细输出模式 |
| `--help` | - | 显示帮助 |

> **MVP 后续扩展**：`--skip-issue-sync`、`--skip-validation`、`--config-dir`、`--rules-dir`、`--agents-dir`、`--language` 等参数将在 MVP 之后按需添加。MVP 阶段默认加载项目目录下的 `.sheepdog/` 配置。

### 3.4 输出文件

审查完成后生成 JSON 文件（供增量审查和 CI artifact 使用）：

- 默认路径：`.sheepdog/reviews/<correlation_id>/<timestamp>.json`
- `--previous-review` 未指定时，系统自动在该路径查找上一次结果

### 3.5 退出码

| 退出码 | 含义 |
|--------|------|
| 0 | 审查完成（无论是否发现问题） |
| 1 | 审查失败（参数错误、Agent 异常等） |

### 3.6 使用示例

```bash
# 首次审查
sheepdog review ./my-project feature-branch main

# CI 环境中的增量审查
sheepdog review ./my-project $CI_MERGE_REQUEST_SOURCE_BRANCH_NAME $CI_MERGE_REQUEST_TARGET_BRANCH_NAME \
  --previous-review=./sheepdog-review.json
```

---

## 4. `sheepdog status`

检查与 PR 关联的 issue 状态，决定是否可以合并。设计为 CI pipeline 的 gate step。

### 4.1 用法

```bash
sheepdog status <repo> <source> <target> [options]
```

### 4.2 位置参数

| 参数 | 必填 | 说明 |
|------|------|------|
| `<repo>` | 是 | Git 仓库路径 |
| `<source>` | 是 | reviewBranch |
| `<target>` | 是 | baseBranch |

### 4.3 选项

| 选项 | 默认值 | 说明 |
|------|--------|------|
| `--allow-severity=<level>` | - | 允许的最高严重程度，该级别及以下均不阻止合并。如 `warning` 表示忽略 warning 和 suggestion |
| `--json` | false | 以 JSON 格式输出 |
| `--help` | - | 显示帮助 |

### 4.4 输出

**默认输出**：

```
@ AI Sheepdog - Status Check
═══════════════════════════════════════
Repo:    my-project
Branch:  feature-branch → main
═══════════════════════════════════════

Issues: 0 open / 3 total

  [CLOSED] sec-001  SQL injection in auth.ts:45
  [CLOSED] log-002  Null pointer in service.ts:23
  [CLOSED] perf-003 N+1 query in user-service.ts:34

Status: PASS | All issues resolved. Safe to merge.
```

**JSON 输出**：

```json
{
  "correlation_id": "my-project:feature-branch:main",
  "can_merge": true,
  "open_issues": 0,
  "total_issues": 3,
  "issues": [
    { "id": "sec-001", "is_closed": true, "title": "..." },
    { "id": "log-002", "is_closed": true, "title": "..." },
    { "id": "perf-003", "is_closed": true, "title": "..." }
  ]
}
```

### 4.5 退出码

| 退出码 | 含义 |
|--------|------|
| 0 | 所有 issue 已关闭，允许合并 |
| 1 | 存在未关闭的 issue，阻止合并 |

### 4.6 使用示例

```bash
# 本地检查
sheepdog status ./my-project feature-branch main

# GitLab CI
sheepdog status ./my-project $CI_MERGE_REQUEST_SOURCE_BRANCH_NAME $CI_MERGE_REQUEST_TARGET_BRANCH_NAME
```

---

## 5. `sheepdog config`

管理全局配置（存储在 `~/.config/sheepdog/config.yaml`）。

### 5.1 子命令

```bash
sheepdog config set <key> <value>     # 设置配置值
sheepdog config get <key>             # 获取配置值
sheepdog config list                  # 列出所有配置
sheepdog config delete <key>          # 删除配置值
sheepdog config path                  # 显示配置文件路径
```

### 5.2 配置项

| Key | 说明 | 示例 |
|-----|------|------|
| `jira.url` | JIRA 实例 URL | `https://xxx.atlassian.net` |
| `jira.token` | JIRA API Token | `***` |
| `jira.project` | JIRA 项目 Key（创建 issue 时使用） | `PROJ` |
| `gitlab.url` | GitLab 实例 URL | `https://gitlab.com` |
| `gitlab.token` | GitLab API Token | `***` |
| `model` | 共享默认模型 | `claude-sonnet-4-5-20250929` |
| `agent-model` | Agent 审查模型 | `claude-sonnet-4-5-20250929` |
| `light-model` | 轻量模型（选择器、去重） | `claude-haiku-4-5-20251001` |
| `worktree-dir` | worktree 存储目录 | `~/.cache/sheepdog/worktrees` |
| `status.allow-severity` | 默认允许的最高严重程度（该级别及以下不阻止合并） | `suggestion` |

### 5.3 环境变量覆盖

所有配置项均可通过环境变量覆盖，前缀 `SHEEPDOG_`，层级用 `_` 分隔：

| 环境变量 | 对应配置 |
|----------|---------|
| `SHEEPDOG_JIRA_URL` | `jira.url` |
| `SHEEPDOG_JIRA_TOKEN` | `jira.token` |
| `SHEEPDOG_JIRA_PROJECT` | `jira.project` |
| `SHEEPDOG_GITLAB_URL` | `gitlab.url` |
| `SHEEPDOG_GITLAB_TOKEN` | `gitlab.token` |
| `SHEEPDOG_MODEL` | `model` |
| `SHEEPDOG_AGENT_MODEL` | `agent-model` |
| `SHEEPDOG_LIGHT_MODEL` | `light-model` |
| `SHEEPDOG_WORKTREE_DIR` | `worktree-dir` |
| `SHEEPDOG_STATUS_ALLOW_SEVERITY` | `status.allow-severity` |

### 5.4 优先级

```
环境变量 > sheepdog config set > ~/.config/sheepdog/config.yaml
```

### 5.5 使用示例

```bash
# 配置 JIRA
sheepdog config set jira.url https://xxx.atlassian.net
sheepdog config set jira.token xxxxx
sheepdog config set jira.project PROJ

# 配置模型
sheepdog config set model claude-sonnet-4-5-20250929

# 查看配置
sheepdog config list

# 使用环境变量（CI 中推荐）
export SHEEPDOG_JIRA_TOKEN=$CI_JIRA_TOKEN
```

---

## 6. 全局选项

| 选项 | 说明 |
|------|------|
| `--version`, `-v` | 显示版本号 |
| `--help`, `-h` | 显示帮助 |

---

## 7. GitLab CI 完整示例

```yaml
# .gitlab-ci.yml
stages:
  - review
  - check

# Step 1: 首次/增量审查
sheepdog-review:
  stage: review
  script:
    - sheepdog review . $CI_MERGE_REQUEST_SOURCE_BRANCH_NAME $CI_MERGE_REQUEST_TARGET_BRANCH_NAME
        --json > sheepdog-review.json
  artifacts:
    paths:
      - sheepdog-review.json
    expire_in: 7 days
  rules:
    - if: $CI_PIPELINE_SOURCE == "merge_request_event"

# Step 2: 增量审查（代码更新后）
sheepdog-incremental-review:
  stage: review
  needs:
    - pipeline: $CI_COMMIT_BRANCH
      job: sheepdog-review
      artifacts: true
  script:
    - sheepdog review . $CI_MERGE_REQUEST_SOURCE_BRANCH_NAME $CI_MERGE_REQUEST_TARGET_BRANCH_NAME
        --previous-review=./sheepdog-review.json
        --json > sheepdog-review.json
  artifacts:
    paths:
      - sheepdog-review.json
    expire_in: 7 days
  rules:
    - if: $CI_PIPELINE_SOURCE == "merge_request_event"
      when: manual

# Step 3: 合并检查（CI Gate）
sheepdog-check:
  stage: check
  script:
    - sheepdog status . $CI_MERGE_REQUEST_SOURCE_BRANCH_NAME $CI_MERGE_REQUEST_TARGET_BRANCH_NAME
  rules:
    - if: $CI_PIPELINE_SOURCE == "merge_request_event"
```
