# 开发计划

## 阶段概览

```
前置阶段: 共享类型定义（立即执行，review 后锁定）
    ↓
Phase 0: 项目基础搭建
    ↓
    ├──────── Track A ────────┬──────── Track B ────────┬──────── Track C ────────┐
    │  Phase 1: Git 操作模块  │  Phase 4: Issue 插件    │  Phase 7: 项目定制化    │
    │       ↓                 │       系统              │                         │
    │  Phase 2: Agent 审查    │                         │                         │
    │       引擎              │                         │                         │
    │       ↓                 │                         │                         │
    │  Phase 3: 报告生成 +    │                         │                         │
    │       持久化            │                         │                         │
    ├─────────────────────────┴─────────────────────────┴─────────────────────────┘
    ↓
Phase 5: 增量 Review（依赖 Track A + B）
    ↓
Phase 6: 合并决策（依赖 Track B + Phase 3）
    ↓
Phase 8: 端到端集成（真实 JIRA）
```

### 并行轨道说明

| 轨道 | Phase | 依赖 | 说明 |
|------|-------|------|------|
| **Track A** | 1 → 2 → 3 | Phase 0 | 核心审查链，强依赖顺序 |
| **Track B** | 4 | Phase 0 + 共享类型 | Issue 插件系统，独立于审查链 |
| **Track C** | 7 | Phase 0 + 共享类型 | 项目定制化，独立于审查链 |

### 质量门禁

每个 Phase 完成后必须通过以下验证才能进入下一阶段：

1. **功能验收**：所有验收标准的自动化测试通过
2. **设计一致性**：实现与设计文档的接口定义一致（命名、路径、数据结构）
3. **词汇一致性**：代码命名与 glossary.md 一致
4. **Lint 通过**：`yarn lint` 零错误
5. **测试通过**：`yarn test` 全部通过

---

## 前置阶段: 共享类型定义

### 目标

从所有设计文档中提取并统一定义 TypeScript 接口/类型，作为所有 Phase 的共享契约。此阶段立即执行，产出接口定义文档供 review，review 通过后锁定类型。

### 交付物

- `src/types/` 目录下的所有 TypeScript 类型定义文件
- 接口定义文档（Markdown 格式，列出所有类型及其来源设计文档）

### 类型来源

| 类型 | 来源文档 |
|------|---------|
| `ValidatedIssue` | 1-requirement/review.md |
| `ReviewReport` | 1-requirement/review.md |
| `ReviewMetrics` | 1-requirement/review.md |
| `ReviewMetadata` | 1-requirement/review.md |
| `ChecklistItem` | 1-requirement/review.md |
| `FixVerificationSummary` | 1-requirement/incremental-review.md |
| `FixVerificationResult` | 1-requirement/incremental-review.md |
| `VerificationStatus` | 1-requirement/incremental-review.md |
| `IssuePlugin` | 2-design/issue-plugin.md |
| `SyncContext` | 2-design/issue-plugin.md |
| `SyncResult` | 2-design/issue-plugin.md |
| `OperationResult` | 2-design/issue-plugin.md |
| `IssueOperation` | 2-design/issue-plugin.md |
| `IssueStatusResult` | 2-design/issue-plugin.md |
| `RemoteIssue` | 2-design/issue-plugin.md |
| `IssueSyncStatus` | 2-design/issue-plugin.md |
| `SyncError` | 2-design/issue-plugin.md |
| `PluginConfig` | 2-design/issue-plugin.md |
| `Severity` | 0-overall/glossary.md |
| `IssueCategory` | 0-overall/glossary.md |
| `ValidationStatus` | 0-overall/glossary.md |
| `FileCategory` | 0-overall/glossary.md |
| `AgentType` | 0-overall/glossary.md |
| `CustomAgentDefinition` | 2-design/customization.md |
| `DiffFile` | Phase 1 需求 |
| `DiffHunk` | Phase 1 需求 |
| `MergeDecision` | 1-requirement/merge-decision.md |
| `SymbolLookup` | 1-requirement/review.md |

### 验收标准

| # | 验收标准 | 测试方式 |
|---|---------|---------|
| T.1 | 所有设计文档中的 interface 都有对应的 TypeScript 定义 | 人工：逐项对照 |
| T.2 | 类型文件能被 TypeScript 编译通过（无循环依赖） | 自动化：`tsc --noEmit` 通过 |
| T.3 | 命名与 glossary.md 完全一致 | 人工：逐项对照 |
| T.4 | 无 `any` 类型 | 自动化：lint 规则 |

---

## Phase 0: 项目基础搭建

### 目标

搭建 TypeScript 项目骨架、CLI 框架、配置管理。

### 交付物

- TypeScript + Node.js 项目，使用 yarn 包管理
- CLI 入口：`sheepdog review`、`sheepdog status`、`sheepdog config`
- 配置管理：全局配置（`~/.config/sheepdog/config.yaml`）+ 项目配置（`.sheepdog/config.yaml`）
- 环境变量覆盖（`SHEEPDOG_*` 前缀）
- ESLint + Prettier + Vitest 配置
- 共享测试工具库

### 验收标准

| # | 验收标准 | 测试方式 |
|---|---------|---------|
| 0.1 | `sheepdog --version` 输出版本号 | 自动化：执行 CLI 命令，验证退出码 0 且输出匹配 semver |
| 0.2 | `sheepdog --help` 输出帮助信息 | 自动化：执行 CLI 命令，验证包含 review/status/config 子命令 |
| 0.3 | `sheepdog config set jira.url https://x.com` 写入配置 | 自动化：执行后用 `config get` 验证值正确 |
| 0.4 | `sheepdog config list` 列出所有配置 | 自动化：验证输出格式 |
| 0.5 | `SHEEPDOG_JIRA_TOKEN=xxx` 环境变量覆盖配置 | 自动化：设置环境变量后 config get 返回环境变量值 |
| 0.6 | 项目配置 `.sheepdog/config.yaml` 被正确加载 | 自动化：创建配置文件后验证 config get 返回项目配置值 |
| 0.7 | 优先级正确：环境变量 > 项目配置 > 全局配置 | 自动化：三层都设置后验证优先级 |
| 0.8 | `sheepdog review` 缺少参数时返回错误 | 自动化：验证退出码 1 且输出错误提示 |
| 0.9 | lint 检查通过 | 自动化：`yarn lint` 退出码 0 |
| 0.10 | `sheepdog config set worktree-dir /tmp/wt` 写入 worktree 目录配置 | 自动化：执行后用 `config get` 验证值正确 |
| 0.11 | `sheepdog config set status.allow-severity warning` 写入默认忽略级别 | 自动化：执行后用 `config get` 验证值正确 |
| 0.12 | 所有 `SHEEPDOG_*` 环境变量正确映射到对应配置项 | 自动化：逐一测试环境变量覆盖 |
| 0.13 | `createTestRepo()` 测试工具可用 | 自动化：调用后验证 git repo 存在且包含预期文件 |
| 0.14 | `createTestDiff()` 测试工具可用 | 自动化：调用后验证 diff 输出符合预期 |
| 0.15 | `createMockAgentOutput()` 测试工具可用 | 自动化：验证输出结构符合 Agent 输出格式 |
| 0.16 | `createTestReviewReport()` 测试工具可用 | 自动化：验证输出结构符合 ReviewReport interface |

### 设计一致性验证

| # | 验证项 | 验证方式 |
|---|--------|---------|
| 0.D1 | CLI 命令和参数与 cli.md 一致 | 人工：`--help` 输出与设计文档对照 |
| 0.D2 | 配置项列表与 cli.md 5.2 节一致 | 人工：`config list` 输出与设计文档对照 |
| 0.D3 | 环境变量映射与 cli.md 5.3 节一致 | 人工：逐一验证 `SHEEPDOG_*` 前缀映射 |
| 0.D4 | 配置优先级与 customization.md 第 7 节一致 | 自动化：三层覆盖测试 |

---

## Phase 1: Git 操作模块（Track A）

### 目标

实现 git diff 获取、解析、worktree 管理。

### 交付物

- Diff 获取：支持分支对比和 commit 对比
- Diff 解析：文件分类（source/config/data/asset/lock/generated）、行号提取
- Worktree 管理：创建、复用、清理临时 worktree

### 验收标准

| # | 验收标准 | 测试方式 |
|---|---------|---------|
| 1.1 | 给定两个分支名，能正确获取 diff 内容 | 自动化：在测试 repo 中创建分支、修改文件，调用 diff 函数验证输出 |
| 1.2 | 给定两个 commit SHA，能正确获取增量 diff | 自动化：创建 commit 后验证 |
| 1.3 | 自动检测 ref 类型（分支名 vs commit SHA） | 自动化：传入不同类型 ref，验证 diff 策略正确 |
| 1.4 | 正确解析 diff 中的文件列表、行范围、变更内容 | 自动化：构造已知 diff，验证解析结果 |
| 1.5 | 文件分类正确：source/config/data/asset/lock/generated | 自动化：构造不同类型文件变更，验证分类 |
| 1.6 | 纯空白变更被标记 | 自动化：构造空白变更，验证标记 |
| 1.7 | Worktree 创建到 `worktree-dir` 配置的目录中（默认 `~/.cache/sheepdog/worktrees`） | 自动化：配置自定义目录后验证 worktree 创建在该目录下 |
| 1.8 | Worktree 创建成功且可读取 reviewBranch 文件 | 自动化：创建 worktree 后验证文件存在且内容正确 |
| 1.9 | Worktree 复用：第二次调用时复用已有 worktree | 自动化：连续调用两次，验证只创建一个 worktree |
| 1.10 | Worktree 清理：过期 worktree 被自动清理 | 自动化：创建 worktree 后修改时间戳，验证清理 |
| 1.11 | 并发调用不冲突（文件锁机制） | 自动化：并发调用 diff 函数，验证无错误 |

### 测试数据

- 使用 `createTestRepo()` 创建测试 repo
- 包含不同类型文件：`.ts`、`.json`、`.png`、`package-lock.json`、`.generated.ts`

### 设计一致性验证

| # | 验证项 | 验证方式 |
|---|--------|---------|
| 1.D1 | 三路 diff / 两路 diff 与 review.md 2 节一致 | 自动化：验证分支用三路、commit 用两路 |
| 1.D2 | 文件分类枚举值 `FileCategory` 与 glossary.md 一致 | 自动化：类型检查 |
| 1.D3 | Worktree 默认路径与 glossary.md 一致 | 自动化：验证默认 `~/.cache/sheepdog/worktrees` |

---

## Phase 2: Agent 审查引擎（Track A）

### 目标

基于 Claude Agent SDK 实现多 Agent 并行审查、实时去重、问题验证。

### 交付物

- 4 个内置 Agent（security/logic/style/performance）
- Validator Agent（挑战模式验证）
- Agent 智能选择器
- 实时去重器（规则层 + LLM 语义层）
- 流式审查编排器

### 验收标准

| # | 验收标准 | 测试方式 |
|---|---------|---------|
| 2.1 | 单个 Agent 能对 diff 输出 JSON 格式的问题列表 | 自动化：构造包含 SQL 注入的 diff，验证 security-reviewer 输出包含 sec-* issue |
| 2.2 | 多 Agent 并行运行，输出合并后无丢失 | 自动化：构造多类型问题 diff，验证各 Agent 输出均被收集 |
| 2.3 | Agent 智能选择：纯 CSS 变更不触发 security-reviewer | 自动化：只有 `.css` 文件变更时，验证 security-reviewer 未被选中 |
| 2.4 | 实时去重：两个 Agent 报告同一位置问题，最终只保留一个 | 自动化：构造必然重复的场景，验证输出只有一条 |
| 2.5 | Validator 确认真实问题，拒绝误报 | 自动化：构造已知误报（如测试文件中的 mock token），验证被拒绝 |
| 2.6 | `validation_status: rejected` 的问题不出现在最终报告 | 自动化：验证最终 issues 列表中无 rejected 状态 |
| 2.7 | Worktree 中的文件可被 Agent 读取（Agent 能访问完整上下文） | 自动化：验证 Agent 的 grounding_evidence.checked_files 包含 worktree 路径 |
| 2.8 | 审查过程支持 AbortController 中断 | 自动化：启动审查后立即 abort，验证优雅退出 |

### 测试数据

- 使用 `createTestDiff()` 构造特定类型问题的 diff：
  - SQL 注入（security）
  - 空指针访问（logic）
  - N+1 查询（performance）
  - 不良命名（style）

### 设计一致性验证

| # | 验证项 | 验证方式 |
|---|--------|---------|
| 2.D1 | Agent 名称与 glossary.md 一致 | 自动化：验证输出中 `source_agent` 匹配 |
| 2.D2 | `ValidatedIssue` 输出结构与共享类型定义一致 | 自动化：TypeScript 类型守卫 |
| 2.D3 | `ValidationStatus` 枚举值与 glossary.md 一致 | 自动化：确认/拒绝/不确定 |
| 2.D4 | `Severity` 和 `Category` 枚举值与 glossary.md 一致 | 自动化：类型检查 |

---

## Phase 3: 报告生成 + 持久化（Track A）

### 目标

生成结构化审查报告，持久化为 JSON 文件。

### 交付物

- ReviewReport 生成（JSON + Markdown 格式）
- JSON 文件持久化到 `.sheepdog/reviews/<correlation_id>/<timestamp>.json`
- 自动查找上一次 review 结果

### 验收标准

| # | 验收标准 | 测试方式 |
|---|---------|---------|
| 3.1 | 生成的 ReviewReport 包含所有必需字段 | 自动化：验证 JSON 结构符合 ReviewReport interface |
| 3.2 | risk_level 根据问题严重程度正确计算 | 自动化：构造不同 severity 分布，验证 risk_level |
| 3.3 | metrics 中统计数据准确（confirmed/rejected/by_severity/by_category） | 自动化：与实际 issue 列表交叉验证 |
| 3.4 | JSON 文件保存到正确路径 `.sheepdog/reviews/<correlation_id>/` | 自动化：验证文件存在且路径正确 |
| 3.5 | 文件名包含时间戳，多次 review 不覆盖 | 自动化：连续 review 两次，验证两个文件都存在 |
| 3.6 | `--previous-review` 未指定时，自动查找上一次结果 | 自动化：不传参数，验证能加载上一次结果 |
| 3.7 | `--json` 模式输出纯 JSON 到 stdout | 自动化：验证 stdout 输出可被 JSON.parse 解析 |
| 3.8 | 默认模式输出人类可读的 Markdown 报告 | 自动化：验证输出包含 issue 列表和统计摘要 |

### 设计一致性验证

| # | 验证项 | 验证方式 |
|---|--------|---------|
| 3.D1 | `ReviewReport` 结构与 review.md 3.1 节一致 | 自动化：TypeScript 类型守卫 |
| 3.D2 | `ReviewMetrics` 结构与 review.md 3.3 节一致 | 自动化：TypeScript 类型守卫 |
| 3.D3 | 文件存储路径与 cli.md 3.4 节一致 | 自动化：验证 `.sheepdog/reviews/<correlation_id>/<timestamp>.json` |
| 3.D4 | `correlation_id` 格式与 glossary.md 一致 | 自动化：验证 `项目名称:reviewBranch:baseBranch` 格式 |
| 3.D5 | `--json` / `--previous-review` 参数与 cli.md 3.3 节一致 | 自动化：CLI 测试 |

---

## Phase 4: Issue 插件系统（Track B）

### 目标

实现插件化 Issue 同步接口和 JIRA 插件。

### 交付物

- `IssuePlugin` 接口（initialize/sync/getStatus）
- JIRA 插件实现（连接 `essexlg.atlassian.net`）
- 同步失败处理和重试机制
- `remote_id` 回写到 ValidatedIssue

### 验收标准

| # | 验收标准 | 测试方式 |
|---|---------|---------|
| 4.1 | JIRA 插件能为每个 confirmed issue 创建 JIRA issue | 自动化：mock JIRA API，验证调用参数正确（title、description、priority 映射） |
| 4.2 | severity 正确映射为 JIRA priority | 自动化：验证 critical→Highest、error→High、warning→Medium、suggestion→Low |
| 4.3 | issue description 包含问题描述、代码位置、修复建议 | 自动化：验证创建 issue 的 description 字段内容 |
| 4.4 | `correlation_id` 存储到 JIRA issue 的 labels 或 custom field | 自动化：验证 JIRA API 调用包含 correlation_id |
| 4.5 | 同步成功后 `ValidatedIssue.remote_id` 被填充 | 自动化：验证 review 输出 JSON 中 remote_id 非空 |
| 4.6 | 同步失败时 ReviewReport 仍然保存，issue_sync.status='failed' | 自动化：mock JIRA API 返回错误，验证 JSON 文件存在且 issue_sync 字段正确 |
| 4.7 | 部分失败时 issue_sync.status='partial'，成功的 issue 有 remote_id | 自动化：mock 部分成功部分失败，验证 |
| 4.8 | getStatus 能通过 correlation_id 查询所有关联 issue 状态 | 自动化：mock JIRA search API，验证查询参数和返回结构 |
| 4.9 | 增量 review 时自动重试 pending 的 issue | 自动化：加载包含 pending 的 previousReview，验证重试调用 |
| 4.10 | 重试超过 3 次后标记为 failed | 自动化：构造 retry_count=3 的记录，验证不再重试 |
| 4.11 | **真实 JIRA 集成**：能连接 `essexlg.atlassian.net` 创建 issue | 手动：运行集成测试，验证 JIRA 中出现对应 issue |
| 4.12 | **真实 JIRA 集成**：能通过 correlation_id 查询已创建的 issue | 手动：创建 issue 后查询验证 |

### 测试数据

- 单元测试：Mock JIRA REST API（使用 nock 或 msw）
- 集成测试：连接真实 JIRA 实例
- 使用 `createTestReviewReport()` 构造测试数据

### 设计一致性验证

| # | 验证项 | 验证方式 |
|---|--------|---------|
| 4.D1 | `IssuePlugin` 接口与 issue-plugin.md 2 节一致 | 自动化：TypeScript 类型守卫 |
| 4.D2 | `SyncContext` / `SyncResult` 结构与 issue-plugin.md 3 节一致 | 自动化：TypeScript 类型守卫 |
| 4.D3 | Severity → Priority 映射与 issue-plugin.md 4.1 节一致 | 自动化：逐一验证映射 |
| 4.D4 | Issue description 模板与 issue-plugin.md 4.2 节一致 | 自动化：验证输出格式 |
| 4.D5 | `IssueSyncStatus` 结构与 issue-plugin.md 5.2 节一致 | 自动化：TypeScript 类型守卫 |
| 4.D6 | 重试策略与 issue-plugin.md 5.3 节一致（单次不重试，增量时重试，最多 3 次） | 自动化：行为验证 |

---

## Phase 5: 增量 Review（修复验证）

### 目标

实现增量审查和修复验证（fix-verifier Agent 两阶段流程）。

### 前置依赖

- Track A（Phase 1 + 2 + 3）：审查链路可用
- Track B（Phase 4）：Issue 插件可用

### 交付物

- fix-verifier Agent 集成
- 两阶段验证流程（批量初筛 + 深入验证）
- Issue 插件同步规则（关闭/更新 issue）

### 验收标准

| # | 验收标准 | 测试方式 |
|---|---------|---------|
| 5.1 | 传入 previousReview 后，系统启动修复验证流程 | 自动化：提供 previousReview JSON，验证 fix_verification 字段非空 |
| 5.2 | 已修复的问题被标记为 `fixed` | 自动化：构造已修复代码，验证 fix_verification.results 包含 status='fixed' |
| 5.3 | 未修复的问题被标记为 `missed` | 自动化：构造未修复代码，验证 status='missed' 且有 updated_issue |
| 5.4 | 误报被标记为 `false_positive` | 自动化：构造原始误报场景，验证 status='false_positive' |
| 5.5 | 文件删除后问题被标记为 `obsolete` | 自动化：删除问题文件，验证 status='obsolete' |
| 5.6 | 新发现的问题被正确识别 | 自动化：在已修复代码中引入新问题，验证新 issue 出现在 issues 列表 |
| 5.7 | fixed/false_positive/obsolete → JIRA issue 被关闭 | 自动化：mock JIRA API，验证 close 操作调用 |
| 5.8 | missed → JIRA issue 被更新 | 自动化：mock JIRA API，验证 update 操作调用 |
| 5.9 | 新问题 → JIRA issue 被创建 | 自动化：验证 create 操作调用 |
| 5.10 | ReviewReport 包含 fix_verification 摘要 | 自动化：验证 by_status 统计准确 |

### 设计一致性验证

| # | 验证项 | 验证方式 |
|---|--------|---------|
| 5.D1 | `FixVerificationSummary` 结构与 incremental-review.md 3 节一致 | 自动化：TypeScript 类型守卫 |
| 5.D2 | `VerificationStatus` 枚举与 incremental-review.md 5.2 节一致 | 自动化：验证 fixed/missed/false_positive/obsolete/uncertain |
| 5.D3 | Issue 插件同步规则与 incremental-review.md 6 节一致 | 自动化：验证每种 status 对应正确的操作 |
| 5.D4 | 两阶段验证流程与 incremental-review.md 5.1 节一致 | 自动化：验证批量初筛 → 深入验证 |

---

## Phase 6: 合并决策（CI Gate）

### 目标

实现 `sheepdog status` 命令，作为 CI pipeline gate。

### 前置依赖

- Track B（Phase 4）：Issue 插件 getStatus 可用
- Phase 3：ReviewReport 可用

### 交付物

- `sheepdog status` 命令实现
- `--allow-severity` 参数支持
- 项目/全局配置中的 `status.allow_severity` 支持

### 验收标准

| # | 验收标准 | 测试方式 |
|---|---------|---------|
| 6.1 | 所有 issue 关闭时退出码 0，输出 PASS | 自动化：mock getStatus 返回全部关闭，验证退出码 0 |
| 6.2 | 存在 open issue 时退出码 1，输出 BLOCKED | 自动化：mock getStatus 返回有 open，验证退出码 1 |
| 6.3 | `--allow-severity=suggestion` 时 suggestion 不阻止合并 | 自动化：mock 只有 suggestion open，验证退出码 0 |
| 6.4 | `--allow-severity=warning` 时 warning + suggestion 均不阻止合并 | 自动化：验证 |
| 6.5 | `--allow-severity=warning` 时 error 仍然阻止合并 | 自动化：mock 有 error open，验证退出码 1 |
| 6.6 | CLI 优先级高于项目配置 | 自动化：配置文件 allow_severity=warning，CLI 传 error，验证 CLI 生效 |
| 6.7 | `--json` 输出有效的 MergeDecision JSON | 自动化：验证 JSON 结构包含 can_merge/open_issues/issues |
| 6.8 | 默认输出包含 blocking issue 列表 | 自动化：验证 CLI 输出包含 issue 摘要 |

### 设计一致性验证

| # | 验证项 | 验证方式 |
|---|--------|---------|
| 6.D1 | CLI 输出格式与 merge-decision.md 5 节一致 | 自动化：验证 PASS/BLOCKED 输出 |
| 6.D2 | 退出码与 merge-decision.md 5 节一致 | 自动化：验证 0/1 映射 |
| 6.D3 | Blocking 定义与 merge-decision.md 6 节一致 | 自动化：验证 severity 严格高于 allow_severity |
| 6.D4 | 优先级与 merge-decision.md 6 节一致 | 自动化：验证 CLI > 项目配置 > 全局配置 |
| 6.D5 | `--allow-severity` / `--json` 参数与 cli.md 4.3 节一致 | 自动化：CLI 测试 |

---

## Phase 7: 项目定制化（Track C）

### 目标

实现 `.sheepdog/` 目录的定制化能力。

### 交付物

- 自定义 Agent 加载（`.sheepdog/agents/*.md`，YAML frontmatter + Markdown prompt）
- 项目规则加载（`.sheepdog/rules/*.md`）
- 项目级配置（`.sheepdog/config.yaml`）
- 项目标准感知（自动提取 ESLint/TypeScript/Prettier 配置）
- 自定义检查清单（`.sheepdog/rules/checklist.yaml`）

### 验收标准

| # | 验收标准 | 测试方式 |
|---|---------|---------|
| 7.1 | `.sheepdog/agents/` 中的 `.md` 文件被正确加载和解析 | 自动化：创建自定义 agent，验证被选中并执行 |
| 7.2 | `trigger_mode: rule` 基于文件路径和内容模式触发/不触发 | 自动化：构造匹配/不匹配文件，验证触发结果 |
| 7.3 | `trigger_mode: llm` 基于语义判断触发 | 自动化：构造语义相关的 diff，验证触发 |
| 7.4 | Markdown 正文作为 agent prompt 生效 | 自动化：验证自定义 agent 输出反映 prompt 中的关注点 |
| 7.5 | Agent frontmatter 中的 `llm` 配置（base_url/auth_token/model）生效 | 自动化：配置独立 LLM 参数后验证 Agent 使用该配置调用 |
| 7.6 | Agent frontmatter 中 `llm.auth_token` 支持 `${ENV_VAR}` 环境变量引用 | 自动化：设置环境变量后验证 token 被正确解析 |
| 7.7 | Agent 未配置 `llm` 时使用全局 `agent-model`/`model` | 自动化：不配置 llm 块，验证使用全局模型 |
| 7.8 | `global.md` 规则被注入所有 Agent | 自动化：在 global.md 中写特定禁止项，验证 agent 遵守 |
| 7.9 | `security.md` 等专属规则只注入对应 Agent | 自动化：验证 security-reviewer 收到 security.md 但 logic-reviewer 未收到 |
| 7.10 | `.sheepdog/config.yaml` 中的 `project_name` 生效 | 自动化：设置后验证 correlation_id 使用该名称 |
| 7.11 | `.sheepdog/config.yaml` 中的 `ignore_patterns` 生效 | 自动化：设置忽略模式后，验证匹配文件不被审查 |
| 7.12 | `agents.style-reviewer: false` 禁用对应 Agent | 自动化：配置后验证 style-reviewer 未被运行 |
| 7.13 | 自动提取 ESLint 配置作为审查上下文 | 自动化：创建 .eslintrc.json，验证 Agent 收到相关规则 |
| 7.14 | 自动提取 TypeScript strict 配置 | 自动化：创建 tsconfig.json（strict: true），验证 Agent 了解 strict 模式 |

### 设计一致性验证

| # | 验证项 | 验证方式 |
|---|--------|---------|
| 7.D1 | `.sheepdog/` 目录结构与 customization.md 2 节一致 | 人工：文件结构对照 |
| 7.D2 | 自定义 Agent 定义格式与 customization.md 3.1 节一致 | 自动化：解析 frontmatter 验证 |
| 7.D3 | 规则加载优先级与 customization.md 8 节一致 | 自动化：验证覆盖关系 |
| 7.D4 | 项目配置项与 customization.md 5 节一致 | 自动化：验证所有配置项可加载 |
| 7.D5 | 项目标准感知文件列表与 customization.md 6 节一致 | 自动化：验证自动提取 |

---

## Phase 8: 端到端集成

### 目标

完整流程端到端测试，验证真实 JIRA 集成。

### 前置依赖

- 所有前置 Phase 完成
- JIRA 真实环境可用

### 交付物

- 端到端测试脚本
- 真实 JIRA 集成验证

### 验收标准

| # | 验收标准 | 测试方式 |
|---|---------|---------|
| 8.1 | 首次审查完整流程：review → 报告生成 → 真实 JIRA 同步 | 手动 + 自动化：在测试 repo 中运行，验证 JIRA 中出现对应 issue |
| 8.2 | 增量审查完整流程：修复部分问题 → 增量 review → JIRA 状态同步 | 手动 + 自动化：验证 JIRA issue 状态变更 |
| 8.3 | 合并决策流程：status → exit 0/1 | 自动化：验证 exit code |
| 8.4 | 完整迭代循环：review → 修复 → 增量 review → 全部关闭 → status PASS | 手动 + 自动化：完整三步流程 |
| 8.5 | JSON 文件作为 artifact 正确传递 | 自动化：验证 --previous-review 能加载上一步输出 |
| 8.6 | Issue 同步失败后增量 review 能重试成功 | 自动化：第一次 mock 失败，第二次真实成功 |
| 8.7 | 自定义 Agent 在端到端流程中正常工作 | 自动化：配置自定义 agent 后运行完整流程 |

---

## 测试策略

### 共享测试工具

位于 `src/test-utils/`，在 Phase 0 中实现：

| 工具 | 说明 | 使用阶段 |
|------|------|---------|
| `createTestRepo()` | 创建带预设文件的临时 git repo | Phase 1, 2, 5, 8 |
| `createTestDiff()` | 构造特定类型的 diff | Phase 1, 2 |
| `createMockAgentOutput()` | 构造 Agent 输出数据 | Phase 2, 3, 5 |
| `createTestReviewReport()` | 构造完整的 ReviewReport | Phase 3, 4, 5, 6 |

### 单元测试

- 每个 Phase 的验收标准都有对应的单元测试
- 使用 Vitest 框架
- Mock 外部依赖（JIRA API、Claude Agent SDK）
- 测试数据使用临时 git repo（测试前创建、测试后清理）

### 集成测试

- Phase 4（Issue 插件）：mock JIRA API + 真实 JIRA 连接测试
- Phase 5（增量 Review）：完整的 review → 修复 → 再 review 流程

### 端到端测试

- Phase 8 覆盖完整流程
- 使用测试 repo + 真实 JIRA 实例

### 测试执行

```bash
# 运行所有测试
yarn test

# 运行特定 Phase 的测试
yarn test --grep "Phase 1"

# 运行 lint
yarn lint

# 运行真实 JIRA 集成测试（需要 .env.local 配置）
yarn test:integration
```

### 开发状态
4/13 18:39 开始开发, 中途因为权限提示，中断运行。 4/14 9:42 继续开发，连续运行42分钟，完成全部开发，输出代码`65`文件`12,298`行.