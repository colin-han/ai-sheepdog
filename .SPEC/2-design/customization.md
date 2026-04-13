# 项目定制化设计

## 1. 概述

`.sheepdog` 目录存放在项目根目录下，包含对当前项目 review 的定制化配置。系统启动时自动加载该目录。

## 2. 目录结构

```
.sheepdog/
├── agents/                        # 自定义审查 Agent（.md 文件，YAML frontmatter + Markdown prompt）
│   ├── api-security.md
│   ├── react-hooks.md
│   └── ...
├── rules/                         # 项目审查规则
│   ├── global.md                  # 全局规则（适用于所有 Agent）
│   ├── security.md                # 安全审查补充规则
│   ├── logic.md                   # 逻辑审查补充规则
│   ├── style.md                   # 风格审查补充规则
│   ├── performance.md             # 性能审查补充规则
│   └── checklist.yaml             # 自定义检查清单
└── config.yaml                    # 项目级配置（可选）
```

## 3. 自定义 Agent

用户可通过 `.md` 文件定义项目专属的审查 Agent，与内置 Agent 并行运行。文件采用 YAML frontmatter + Markdown prompt 的格式，与内置 Agent 定义格式一致。

### 3.1 定义格式

```markdown
---
name: api-security-reviewer
description: API 安全审查专家，检查 REST API 的安全性

# LLM 配置（可选，未设置时使用全局配置）
llm:
  base_url: https://api.anthropic.com      # ANTHROPIC_BASE_URL
  auth_token: ${ANTHROPIC_AUTH_TOKEN}       # 支持环境变量引用
  model: claude-sonnet-4-5-20250929         # 模型名称

# 触发模式
trigger_mode: rule                  # rule | llm

# 规则触发条件
triggers:
  files:                           # 文件匹配模式（glob）
    - "**/api/**/*.ts"
    - "**/routes/**/*.ts"
  exclude_files:                   # 排除文件
    - "**/*.test.ts"
    - "**/*.spec.ts"
  content_patterns:                # 内容正则匹配（任一匹配即触发）
    - "router\\.(get|post|put|delete)"
    - "app\\.(get|post|put|delete)"
  min_files: 1                     # 最少匹配文件数
  match_mode: any                  # all | any

# LLM 触发判断（llm 模式使用）
trigger_prompt: |
  当变更涉及 API 路由定义、请求处理、权限控制时触发此审查

# 输出配置
output:
  category: security               # 默认问题类别
  default_severity: error          # 默认严重程度
  severity_weight: 1.0             # 严重程度权重 (0-2)

enabled: true
tags:
  - api
  - security
---

你是一个 API 安全审查专家，专注于 REST API 的安全性。

## 审查关注点

1. **认证与授权**
   - API 端点是否有认证保护
   - 权限检查是否完整
   ...

2. **输入验证**
   - 请求参数是否经过验证
   ...

## 输出格式

输出 JSON:
{issues: [...], checklist: [...]}
```

### 3.2 LLM 配置

每个 Agent 可在 frontmatter 中配置独立的 LLM 连接，未设置时使用全局配置。

```yaml
llm:
  base_url: https://api.anthropic.com      # API 地址（对应 ANTHROPIC_BASE_URL）
  auth_token: ${ANTHROPIC_AUTH_TOKEN}       # 认证 token（支持 ${ENV_VAR} 环境变量引用）
  model: claude-sonnet-4-5-20250929         # 模型名称
```

**LLM 配置优先级**：Agent frontmatter `llm` > 全局配置 `agent-model`/`model`

### 3.3 触发模式

| 模式 | 说明 |
|------|------|
| **rule** | 纯规则匹配，基于文件路径和内容模式，速度快、无额外 token 消耗 |
| **llm** | 纯 LLM 判断，根据变更内容语义判断是否触发，准确但消耗 token |

### 3.3 加载逻辑

```typescript
interface CustomAgentLoadResult {
  agents: CustomAgentDefinition[];
  errors: LoadError[];
}

// 从 .sheepdog/agents/ 加载所有 .md 文件
// 解析 YAML frontmatter 提取配置，Markdown 正文作为 prompt
// 同名 agent 后加载的覆盖先加载的
async function loadCustomAgents(dirs: string[]): Promise<CustomAgentLoadResult>
```

## 4. 项目审查规则

规则是对内置 Agent 的补充，不影响 Agent 的核心审查逻辑，而是注入项目特定的上下文和关注点。

### 4.1 全局规则（global.md）

适用于所有 Agent 的项目特定规则，作为系统提示的一部分注入：

```markdown
# 项目规范

## 禁止项
- 任何 `any` 类型（使用具体类型或 `unknown`）
- 内联样式（使用 CSS Module）
- 直接使用 `console.log`（使用项目日志工具）

## 关键文件
以下文件变更需要特别关注：
- `src/config/database.ts` - 数据库连接配置
- `src/middleware/auth.ts` - 认证中间件

## 架构约定
- Controller 层只做参数校验和路由，业务逻辑在 Service 层
- 所有外部 API 调用必须通过 Gateway 层
```

### 4.2 Agent 专属规则

按文件名匹配对应的内置 Agent，作为额外上下文注入：

| 文件名 | 注入目标 Agent |
|--------|---------------|
| `security.md` | security-reviewer |
| `logic.md` | logic-reviewer |
| `style.md` | style-reviewer |
| `performance.md` | performance-reviewer |

```markdown
# 安全审查补充规范

## 关键文件
- `SecurityConfig.java` - Spring Security 配置
- `JwtAuthenticationFilter.java` - JWT 过滤器

## 项目特定检查
- 所有 /api/v1/ 端点必须经过 JWT 验证
- 数据库查询必须使用 MyBatis 参数化
```

### 4.3 自定义检查清单（checklist.yaml）

补充内置 checklist，Agent 审查时必须逐项评估：

```yaml
- id: api-auth-check
  category: security
  question: "API 端点是否都有认证保护？"
  defaultResult: error

- id: sql-parameterized
  category: security
  question: "数据库查询是否使用了参数化查询？"
  defaultResult: error

- id: error-response-format
  category: style
  question: "错误响应是否遵循项目统一的错误格式？"
  defaultResult: warning
```

## 5. 项目级配置（config.yaml）

可选的项目级配置文件：

```yaml
# 项目名称（用于 correlation_id 的组成部分）
# 如果不设置，则从 git remote URL 提取（如 github.com/org/my-project → my-project）
project_name: my-project

# 审查语言
language: zh                       # zh | en

# 忽略文件模式（不审查的文件）
ignore_patterns:
  - "**/*.generated.ts"
  - "**/dist/**"
  - "**/coverage/**"
  - "**/__snapshots__/**"

# 严重程度覆盖（允许调整内置 Agent 的默认严重程度）
severity_overrides:
  "style:*": suggestion            # 所有 style 问题降级为 suggestion
  "security:sql-injection": critical

# Agent 启用/禁用
agents:
  style-reviewer: false            # 禁用风格审查
  performance-reviewer: true
```

**项目名称获取优先级**：`.sheepdog/config.yaml` 中的 `project_name` > git remote URL 提取 > 目录名。

## 6. 项目标准感知（自动提取）

除了 `.sheepdog` 中的显式配置外，系统还自动提取项目已有的工具配置作为审查依据，无需手动配置：

| 配置类型 | 自动识别的文件 | 用途 |
|----------|-------------|------|
| ESLint | .eslintrc.*, eslint.config.* | 了解项目的代码规范和禁用规则 |
| TypeScript | tsconfig.json, tsconfig.*.json | 了解 strict 模式、target 等编译选项 |
| Prettier | .prettierrc, prettier.config.* | 了解格式化偏好，避免重复报告格式问题 |
| 命名约定 | 通过代码库推断 | 了解项目的命名风格（camelCase、snake_case 等） |

自动提取的标准与 `.sheepdog/rules/` 中的显式规则合并使用，前者提供客观基线，后者提供项目主观约定。

## 7. 配置文件层级

```
全局配置    ~/.config/sheepdog/config.yaml    （JIRA URL、API token、默认模型等）
    ↓ 被覆盖
项目配置    .sheepdog/config.yaml              （项目名称、忽略模式、Agent 启禁用等）
    ↓ 被覆盖
环境变量    SHEEPDOG_* 前缀                    （如 SHEEPDOG_JIRA_TOKEN，最高优先级）
```

## 8. 规则加载优先级

```
1. 内置 Agent 提示词（最低优先级）
    ↓
2. 自动提取的项目标准（ESLint、TypeScript 等）
    ↓
3. .sheepdog/rules/ 中的项目规则（覆盖/补充内置规则）
    ↓
4. .sheepdog/config.yaml 中的配置（最高优先级，如 severity_overrides、agents 启禁用）
```

后加载的覆盖先加载的。这意味着：
- 项目规则可以覆盖内置规则
- config.yaml 中的 severity_overrides 可以调整任何问题的严重程度
- config.yaml 中的 agents 配置可以禁用不需要的内置 Agent
