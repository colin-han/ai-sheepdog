# Step 3: 合并决策（CI Gate）

## 1. 功能概述

通过 `sheepdog status` 命令检查与 PR 关联的 issue 状态，作为 GitLab CI pipeline 的一个 step 使用。根据 issue 状态决定 pipeline 是否通过，阻止有问题的代码合并到主分支。

## 2. 使用方式

### CLI

```bash
sheepdog status ./my-project feature-branch main [options]
```

### GitLab CI 集成

```yaml
# .gitlab-ci.yml
sheepdog-check:
  stage: review
  script:
    - sheepdog status ./my-project $CI_MERGE_REQUEST_SOURCE_BRANCH_NAME $CI_MERGE_REQUEST_TARGET_BRANCH_NAME
  rules:
    - if: $CI_PIPELINE_SOURCE == "merge_request_event"
```

## 3. 输入

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| repoPath | string | 是 | Git 仓库的本地路径 |
| sourceRef | string | 是 | reviewBranch |
| targetRef | string | 是 | baseBranch |

系统通过 `correlation_id`（项目名称 + sourceRef + targetRef）查询关联的 issue 状态。

## 4. 选项

| 选项 | 默认值 | 说明 |
|------|--------|------|
| `--allow-severity=<level>` | - | 允许的最高严重程度，该级别及以下均不阻止合并。如 `warning` 表示 suggestion 和 warning 均忽略 |
| `--json` | false | 以 JSON 格式输出 |
| `--help` | - | 显示帮助 |

## 5. 输出

### CLI 输出

```
@ AI Sheepdog - Status Check
═══════════════════════════════════════
Repo:    my-project
Branch:  feature-branch → main
═══════════════════════════════════════

Issues: 0 blocking / 1 open / 5 total

  [OPEN]   sty-001  Rename variable x to userCount (suggestion)  ← ignored

Status: PASS | All blocking issues resolved. Safe to merge.
```

### 退出码

| 退出码 | 含义 |
|--------|------|
| 0 | 所有 blocking issue 已关闭（允许忽略的 severity 除外），允许合并 |
| 1 | 存在未关闭的 blocking issue，阻止合并 |

## 6. 决策规则

- 所有 blocking issue 已关闭 → **exit 0**
- 存在未关闭的 blocking issue → **exit 1**，列出未关闭的 issue

**Blocking 定义**：severity 严格高于 `allow_severity` 的 issue 为 blocking issue。

严重程度从高到低：`critical` > `error` > `warning` > `suggestion`

例如 `--allow-severity=warning` 表示 `warning` 和 `suggestion` 的 issue 不阻止合并，只有 `critical` 和 `error` 为 blocking。

### 配置方式

优先级：`--allow-severity` 参数 > `.sheepdog/config.yaml` > 全局默认

**项目配置**（`.sheepdog/config.yaml`）：
```yaml
status:
  allow_severity: suggestion
```

**全局配置**（`~/.config/sheepdog/config.yaml`）：
```yaml
status:
  allow_severity: warning
```

**默认值**：无忽略，所有未关闭的 issue 均为 blocking。
