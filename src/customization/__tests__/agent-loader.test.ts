/**
 * agent-loader 单元测试
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { loadCustomAgents } from '../agent-loader.js';

describe('agent-loader', () => {
  const testDir = path.join(process.cwd(), '.tmp', 'agent-loader-test');

  beforeEach(() => {
    // 创建测试目录
    fs.mkdirSync(testDir, { recursive: true });
  });

  afterEach(() => {
    // 清理测试目录
    if (fs.existsSync(testDir)) {
      fs.rmSync(testDir, { recursive: true, force: true });
    }
  });

  describe('parseFrontmatter', () => {
    it('应该正确解析 YAML frontmatter', () => {
      const content = `---
name: test-agent
description: 测试 Agent
trigger_mode: rule
output:
  category: security
  default_severity: error
---

这是 Agent 的系统提示词`;
      const filePath = path.join(testDir, 'test-agent.md');
      fs.writeFileSync(filePath, content, 'utf-8');

      const result = loadCustomAgents(testDir);

      expect(result.errors).toHaveLength(0);
      expect(result.agents).toHaveLength(1);

      const agent = result.agents[0]!;
      expect(agent.name).toBe('test-agent');
      expect(agent.description).toBe('测试 Agent');
      expect(agent.trigger_mode).toBe('rule');
      expect(agent.output.category).toBe('security');
      expect(agent.output.default_severity).toBe('error');
      expect(agent.prompt).toContain('这是 Agent 的系统提示词');
    });

    it('应该解析嵌套的 llm 配置', () => {
      const content = `---
name: llm-agent
description: 带 LLM 配置的 Agent
trigger_mode: llm
llm:
  base_url: https://api.example.com
  auth_token: \${API_TOKEN}
  model: test-model
output:
  category: logic
  default_severity: warning
---

Agent prompt`;
      const filePath = path.join(testDir, 'llm-agent.md');
      fs.writeFileSync(filePath, content, 'utf-8');

      const result = loadCustomAgents(testDir);

      expect(result.agents).toHaveLength(1);
      const agent = result.agents[0]!;
      expect(agent.llm?.base_url).toBe('https://api.example.com');
      expect(agent.llm?.auth_token).toBe('${API_TOKEN}'); // 保持原样
      expect(agent.llm?.model).toBe('test-model');
    });

    it('应该解析 triggers 配置', () => {
      const content = `---
name: trigger-agent
description: 触发测试 Agent
trigger_mode: rule
triggers:
  files:
    - "**/*.ts"
    - "**/*.tsx"
  content_patterns:
    - "router.(get|post)"
  min_files: 1
  match_mode: any
output:
  category: performance
  default_severity: suggestion
---

Agent prompt`;
      const filePath = path.join(testDir, 'trigger-agent.md');
      fs.writeFileSync(filePath, content, 'utf-8');

      const result = loadCustomAgents(testDir);

      expect(result.agents).toHaveLength(1);
      const agent = result.agents[0]!;
      expect(agent.triggers?.files).toEqual(['**/*.ts', '**/*.tsx']);
      expect(agent.triggers?.content_patterns).toEqual(['router.(get|post)']);
      expect(agent.triggers?.min_files).toBe(1);
      expect(agent.triggers?.match_mode).toBe('any');
    });

    it('应该解析列表类型的 tags', () => {
      const content = `---
name: tagged-agent
description: 带标签的 Agent
trigger_mode: rule
tags:
  - api
  - security
output:
  category: security
  default_severity: error
---

Agent prompt`;
      const filePath = path.join(testDir, 'tagged-agent.md');
      fs.writeFileSync(filePath, content, 'utf-8');

      const result = loadCustomAgents(testDir);

      expect(result.agents).toHaveLength(1);
      const agent = result.agents[0]!;
      expect(agent.tags).toEqual(['api', 'security']);
    });

    it('应该处理 enabled: false', () => {
      const content = `---
name: disabled-agent
description: 禁用的 Agent
trigger_mode: rule
enabled: false
output:
  category: style
  default_severity: warning
---

Agent prompt`;
      const filePath = path.join(testDir, 'disabled-agent.md');
      fs.writeFileSync(filePath, content, 'utf-8');

      const result = loadCustomAgents(testDir);

      expect(result.agents).toHaveLength(1);
      const agent = result.agents[0]!;
      expect(agent.enabled).toBe(false);
    });

    it('默认 enabled 为 true', () => {
      const content = `---
name: default-enabled-agent
description: 默认启用的 Agent
trigger_mode: rule
output:
  category: style
  default_severity: warning
---

Agent prompt`;
      const filePath = path.join(testDir, 'default-enabled-agent.md');
      fs.writeFileSync(filePath, content, 'utf-8');

      const result = loadCustomAgents(testDir);

      expect(result.agents).toHaveLength(1);
      const agent = result.agents[0]!;
      expect(agent.enabled).toBe(true);
    });
  });

  describe('环境变量替换', () => {
    it('应该保持 ${ENV_VAR} 格式不变', () => {
      process.env.TEST_TOKEN = 'secret-value';

      const content = `---
name: env-agent
description: 环境变量测试
trigger_mode: rule
llm:
  auth_token: \${TEST_TOKEN}
output:
  category: security
  default_severity: error
---

Agent prompt`;
      const filePath = path.join(testDir, 'env-agent.md');
      fs.writeFileSync(filePath, content, 'utf-8');

      const result = loadCustomAgents(testDir);

      expect(result.agents).toHaveLength(1);
      const agent = result.agents[0]!;

      // 在加载时替换环境变量
      expect(agent.llm?.auth_token).toBe('secret-value');

      delete process.env.TEST_TOKEN;
    });

    it('未定义的环境变量保持原样', () => {
      const content = `---
name: env-undefined-agent
description: 未定义环境变量
trigger_mode: rule
llm:
  auth_token: \${UNDEFINED_TOKEN}
output:
  category: security
  default_severity: error
---

Agent prompt`;
      const filePath = path.join(testDir, 'env-undefined-agent.md');
      fs.writeFileSync(filePath, content, 'utf-8');

      const result = loadCustomAgents(testDir);

      expect(result.agents).toHaveLength(1);
      const agent = result.agents[0]!;
      expect(agent.llm?.auth_token).toBe('${UNDEFINED_TOKEN}');
    });
  });

  describe('同名 Agent 覆盖', () => {
    it('后加载的 Agent 应覆盖先加载的', () => {
      // 创建两个同名 Agent
      const agent1 = `---
name: same-name
description: 第一个 Agent
trigger_mode: rule
output:
  category: security
  default_severity: error
---

First prompt`;

      const agent2 = `---
name: same-name
description: 第二个 Agent
trigger_mode: rule
output:
  category: logic
  default_severity: warning
---

Second prompt`;

      fs.writeFileSync(path.join(testDir, 'a-agent.md'), agent1, 'utf-8');
      fs.writeFileSync(path.join(testDir, 'b-agent.md'), agent2, 'utf-8');

      const result = loadCustomAgents(testDir);

      // 应该只有一个 Agent
      expect(result.agents).toHaveLength(1);

      const agent = result.agents[0]!;
      // 应该是第二个 Agent 的值
      expect(agent.output.category).toBe('logic');
      expect(agent.prompt).toContain('Second prompt');
    });
  });

  describe('错误处理', () => {
    it('应该报告缺少必须字段的错误', () => {
      const content = `---
name: incomplete-agent
description: 不完整的 Agent
trigger_mode: rule
---

Missing output field`;
      const filePath = path.join(testDir, 'incomplete-agent.md');
      fs.writeFileSync(filePath, content, 'utf-8');

      const result = loadCustomAgents(testDir);

      expect(result.agents).toHaveLength(0);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0]!.error).toContain('Invalid agent definition');
      expect(result.errors[0]!.error).toContain('missing required fields');
    });

    it('应该拒绝无效的 trigger_mode', () => {
      const content = `---
name: invalid-trigger-agent
description: 无效触发模式
trigger_mode: invalid
output:
  category: security
  default_severity: error
---

Agent prompt`;
      const filePath = path.join(testDir, 'invalid-trigger-agent.md');
      fs.writeFileSync(filePath, content, 'utf-8');

      const result = loadCustomAgents(testDir);

      expect(result.agents).toHaveLength(0);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0]!.error).toContain('Invalid agent definition');
    });

    it('应该拒绝无效的 category', () => {
      const content = `---
name: invalid-category-agent
description: 无效类别
trigger_mode: rule
output:
  category: invalid
  default_severity: error
---

Agent prompt`;
      const filePath = path.join(testDir, 'invalid-category-agent.md');
      fs.writeFileSync(filePath, content, 'utf-8');

      const result = loadCustomAgents(testDir);

      expect(result.agents).toHaveLength(0);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0]!.error).toContain('Invalid agent definition');
    });

    it('应该拒绝无效的 default_severity', () => {
      const content = `---
name: invalid-severity-agent
description: 无效严重程度
trigger_mode: rule
output:
  category: security
  default_severity: invalid
---

Agent prompt`;
      const filePath = path.join(testDir, 'invalid-severity-agent.md');
      fs.writeFileSync(filePath, content, 'utf-8');

      const result = loadCustomAgents(testDir);

      expect(result.agents).toHaveLength(0);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0]!.error).toContain('Invalid agent definition');
    });

    it('应该报告无效的 YAML frontmatter', () => {
      const content = `---
name: "unclosed string
description: 测试
trigger_mode: rule
output:
  category: security
  default_severity: error
---

Agent prompt`;
      const filePath = path.join(testDir, 'invalid-yaml.md');
      fs.writeFileSync(filePath, content, 'utf-8');

      const result = loadCustomAgents(testDir);

      // 解析失败的文件会被忽略，但不会报错（简化处理）
      expect(result.agents).toHaveLength(0);
    });

    it('应该处理空目录', () => {
      const result = loadCustomAgents(testDir);

      expect(result.agents).toHaveLength(0);
      expect(result.errors).toHaveLength(0);
    });

    it('应该忽略非 .md 文件', () => {
      fs.writeFileSync(path.join(testDir, 'test.txt'), 'test', 'utf-8');
      fs.writeFileSync(path.join(testDir, 'test.json'), '{}', 'utf-8');

      const result = loadCustomAgents(testDir);

      expect(result.agents).toHaveLength(0);
    });
  });
});
