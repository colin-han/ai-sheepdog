/**
 * rule-loader 单元测试
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import {
  loadRules,
  injectRulesToAgent,
  injectRulesToAgents,
  selectAgentsByRules,
} from '../rule-loader.js';
import type { CustomAgentDefinition } from '../../types/index.js';

describe('rule-loader', () => {
  const testDir = path.join(process.cwd(), '.tmp', 'rule-loader-test');
  const rulesDir = path.join(testDir, '.sheepdog', 'rules');

  beforeEach(() => {
    fs.mkdirSync(rulesDir, { recursive: true });
  });

  afterEach(() => {
    if (fs.existsSync(testDir)) {
      fs.rmSync(testDir, { recursive: true, force: true });
    }
  });

  describe('loadRules', () => {
    it('应该加载所有支持的规则文件', () => {
      // 创建规则文件
      fs.writeFileSync(
        path.join(rulesDir, 'global.md'),
        '# Global Rules\n\n所有代码必须遵守的规则',
        'utf-8',
      );
      fs.writeFileSync(
        path.join(rulesDir, 'security.md'),
        '# Security Rules\n\n安全检查规则',
        'utf-8',
      );
      fs.writeFileSync(
        path.join(rulesDir, 'logic.md'),
        '# Logic Rules\n\n逻辑检查规则',
        'utf-8',
      );
      fs.writeFileSync(
        path.join(rulesDir, 'style.md'),
        '# Style Rules\n\n风格检查规则',
        'utf-8',
      );
      fs.writeFileSync(
        path.join(rulesDir, 'performance.md'),
        '# Performance Rules\n\n性能检查规则',
        'utf-8',
      );

      const result = loadRules(rulesDir);

      expect(result.errors).toHaveLength(0);
      expect(result.rules).toHaveLength(5);

      // 验证全局规则
      const globalRule = result.rules.find((r) => r.id === 'global');
      expect(globalRule?.global).toBe(true);

      // 验证分类规则
      const securityRule = result.rules.find((r) => r.id === 'security');
      expect(securityRule?.category).toBe('security');
      expect(securityRule?.global).toBe(false);
    });

    it('应该忽略未知的规则文件名', () => {
      fs.writeFileSync(
        path.join(rulesDir, 'unknown.md'),
        'Unknown rule',
        'utf-8',
      );
      fs.writeFileSync(
        path.join(rulesDir, 'custom-rule.md'),
        'Custom rule',
        'utf-8',
      );

      const result = loadRules(rulesDir);

      expect(result.rules).toHaveLength(0);
    });

    it('应该处理空目录', () => {
      const result = loadRules(rulesDir);

      expect(result.rules).toHaveLength(0);
      expect(result.errors).toHaveLength(0);
    });
  });

  describe('injectRulesToAgent', () => {
    const mockAgent: CustomAgentDefinition = {
      name: 'security-reviewer',
      description: 'Security Reviewer',
      trigger_mode: 'rule',
      output: {
        category: 'security',
        default_severity: 'error',
      },
      enabled: true,
      prompt: 'Original prompt',
      source_file: '/test/security.md',
    };

    it('应该注入全局规则到所有 Agent', () => {
      const rules = [
        {
          id: 'global',
          category: 'security' as const,
          content: 'Global rule content',
          global: true,
          source_file: '/test/global.md',
        },
      ];

      const result = injectRulesToAgent(mockAgent, rules);

      expect(result).toContain('Original prompt');
      expect(result).toContain('## 全局审查规则');
      expect(result).toContain('Global rule content');
    });

    it('应该注入对应类别的专属规则', () => {
      const rules = [
        {
          id: 'security',
          category: 'security' as const,
          content: 'Security rule content',
          global: false,
          source_file: '/test/security.md',
        },
        {
          id: 'logic',
          category: 'logic' as const,
          content: 'Logic rule content',
          global: false,
          source_file: '/test/logic.md',
        },
      ];

      const result = injectRulesToAgent(mockAgent, rules);

      expect(result).toContain('## 专属审查规则');
      expect(result).toContain('Security rule content');
      expect(result).not.toContain('Logic rule content');
    });

    it('应该同时注入全局和专属规则', () => {
      const rules = [
        {
          id: 'global',
          category: 'security' as const,
          content: 'Global rule',
          global: true,
          source_file: '/test/global.md',
        },
        {
          id: 'security',
          category: 'security' as const,
          content: 'Security rule',
          global: false,
          source_file: '/test/security.md',
        },
      ];

      const result = injectRulesToAgent(mockAgent, rules);

      expect(result).toContain('## 全局审查规则');
      expect(result).toContain('Global rule');
      expect(result).toContain('## 专属审查规则');
      expect(result).toContain('Security rule');
    });

    it('没有规则时应该返回原始 prompt', () => {
      const result = injectRulesToAgent(mockAgent, []);

      expect(result).toBe('Original prompt');
    });
  });

  describe('injectRulesToAgents', () => {
    it('应该批量注入规则到多个 Agent', () => {
      const agents: CustomAgentDefinition[] = [
        {
          name: 'security-reviewer',
          description: 'Security',
          trigger_mode: 'rule',
          output: { category: 'security', default_severity: 'error' },
          enabled: true,
          prompt: 'Security prompt',
          source_file: '/test/security.md',
        },
        {
          name: 'style-reviewer',
          description: 'Style',
          trigger_mode: 'rule',
          output: { category: 'style', default_severity: 'warning' },
          enabled: true,
          prompt: 'Style prompt',
          source_file: '/test/style.md',
        },
      ];

      const rules = [
        {
          id: 'global',
          category: 'security' as const,
          content: 'Global rule',
          global: true,
          source_file: '/test/global.md',
        },
      ];

      const result = injectRulesToAgents(agents, rules);

      expect(result).toHaveLength(2);
      expect(result[0]!.prompt).toContain('Global rule');
      expect(result[1]!.prompt).toContain('Global rule');
    });
  });

  describe('selectAgentsByRules', () => {
    const securityAgent: CustomAgentDefinition = {
      name: 'security-reviewer',
      description: 'Security',
      trigger_mode: 'rule',
      triggers: {
        files: ['**/*.ts', '**/*.tsx'],
        content_patterns: ['password', 'token'],
      },
      output: { category: 'security', default_severity: 'error' },
      enabled: true,
      prompt: 'Security',
      source_file: '/test/security.md',
    };

    const disabledAgent: CustomAgentDefinition = {
      name: 'disabled-reviewer',
      description: 'Disabled',
      trigger_mode: 'rule',
      triggers: { files: ['**/*.ts'] },
      output: { category: 'style', default_severity: 'warning' },
      enabled: false,
      prompt: 'Disabled',
      source_file: '/test/disabled.md',
    };

    const llmAgent: CustomAgentDefinition = {
      name: 'llm-reviewer',
      description: 'LLM',
      trigger_mode: 'llm',
      output: { category: 'logic', default_severity: 'error' },
      enabled: true,
      prompt: 'LLM',
      source_file: '/test/llm.md',
    };

    it('应该基于文件模式选择 Agent', () => {
      const agents = [securityAgent];
      const files = ['src/index.ts', 'src/app.tsx'];

      const result = selectAgentsByRules(agents, files);

      expect(result).toHaveLength(1);
      expect(result[0]!.name).toBe('security-reviewer');
    });

    it('应该跳过不匹配的文件', () => {
      const agents = [securityAgent];
      const files = ['src/index.js', 'README.md'];

      const result = selectAgentsByRules(agents, files);

      expect(result).toHaveLength(0);
    });

    it('应该基于内容模式选择 Agent', () => {
      const agents = [securityAgent];
      const files = ['src/config.ts'];
      const contents = new Map([
        ['src/config.ts', 'const password = "secret"'],
      ]);

      const result = selectAgentsByRules(agents, files, contents);

      expect(result).toHaveLength(1);
    });

    it('应该支持排除文件模式', () => {
      const excludeAgent: CustomAgentDefinition = {
        name: 'exclude-reviewer',
        description: 'Exclude',
        trigger_mode: 'rule',
        triggers: {
          files: ['**/*.ts'],
          exclude_files: ['**/*.test.ts'],
        },
        output: { category: 'style', default_severity: 'warning' },
        enabled: true,
        prompt: 'Exclude',
        source_file: '/test/exclude.md',
      };

      // 只有被排除的文件
      const files1 = ['src/index.test.ts'];
      // 既有匹配又有被排除的文件
      const files2 = ['src/index.ts', 'src/index.test.ts'];
      // 只有匹配的文件
      const files3 = ['src/index.ts'];

      // 只有被排除的文件时不触发
      expect(selectAgentsByRules([excludeAgent], files1)).toHaveLength(0);
      // 有匹配的文件时触发
      expect(selectAgentsByRules([excludeAgent], files2)).toHaveLength(1);
      expect(selectAgentsByRules([excludeAgent], files3)).toHaveLength(1);
    });

    it('应该跳过禁用的 Agent', () => {
      const agents = [disabledAgent];
      const files = ['src/index.ts'];

      const result = selectAgentsByRules(agents, files);

      expect(result).toHaveLength(0);
    });

    it('llm 模式的 Agent 应该总是被选中', () => {
      const agents = [llmAgent];
      const files = ['README.md'];

      const result = selectAgentsByRules(agents, files);

      expect(result).toHaveLength(1);
    });

    it('应该支持 min_files 限制', () => {
      const minFilesAgent: CustomAgentDefinition = {
        name: 'min-files-reviewer',
        description: 'Min Files',
        trigger_mode: 'rule',
        triggers: {
          files: ['**/*.ts'],
          min_files: 2,
          match_mode: 'all',
        },
        output: { category: 'style', default_severity: 'warning' },
        enabled: true,
        prompt: 'Min Files',
        source_file: '/test/min-files.md',
      };

      const files1 = ['src/index.ts'];
      const files2 = ['src/index.ts', 'src/utils.ts'];

      // 只有一个匹配文件时不触发（min_files 限制）
      expect(selectAgentsByRules([minFilesAgent], files1)).toHaveLength(0);
      // 有两个匹配文件时触发
      expect(selectAgentsByRules([minFilesAgent], files2)).toHaveLength(1);
    });

    it('应该支持 match_mode: all', () => {
      const allModeAgent: CustomAgentDefinition = {
        name: 'all-mode-reviewer',
        description: 'All Mode',
        trigger_mode: 'rule',
        triggers: {
          files: ['**/*.ts'],
          content_patterns: ['password'],
          match_mode: 'all',
        },
        output: { category: 'security', default_severity: 'error' },
        enabled: true,
        prompt: 'All Mode',
        source_file: '/test/all-mode.md',
      };

      const files = ['src/index.ts'];
      const contentsWithPassword = new Map([
        ['src/index.ts', 'const password = "secret"'],
      ]);
      const contentsWithoutPassword = new Map([
        ['src/index.ts', 'const x = 1'],
      ]);

      // 文件匹配但内容不匹配
      expect(
        selectAgentsByRules([allModeAgent], files, contentsWithoutPassword),
      ).toHaveLength(0);

      // 文件和内容都匹配
      expect(
        selectAgentsByRules([allModeAgent], files, contentsWithPassword),
      ).toHaveLength(1);
    });

    it('应该支持 match_mode: any（默认）', () => {
      const anyModeAgent: CustomAgentDefinition = {
        name: 'any-mode-reviewer',
        description: 'Any Mode',
        trigger_mode: 'rule',
        triggers: {
          files: ['**/*.ts'],
          content_patterns: ['password'],
          match_mode: 'any',
        },
        output: { category: 'security', default_severity: 'error' },
        enabled: true,
        prompt: 'Any Mode',
        source_file: '/test/any-mode.md',
      };

      const files = ['src/index.ts'];
      const contentsWithoutPassword = new Map([
        ['src/index.ts', 'const x = 1'],
      ]);

      // 只需文件匹配即可
      expect(
        selectAgentsByRules([anyModeAgent], files, contentsWithoutPassword),
      ).toHaveLength(1);
    });
  });

  describe('glob 模式匹配', () => {
    it('应该支持 ** 通配符', () => {
      const agent: CustomAgentDefinition = {
        name: 'glob-test',
        description: 'Glob Test',
        trigger_mode: 'rule',
        triggers: { files: ['**/*.ts'] },
        output: { category: 'style', default_severity: 'warning' },
        enabled: true,
        prompt: 'Glob',
        source_file: '/test/glob.md',
      };

      const files = [
        'src/index.ts',
        'src/utils/helper.ts',
        'deep/nested/path/file.ts',
      ];

      const result = selectAgentsByRules([agent], files);

      expect(result).toHaveLength(1);
    });

    it('应该支持 * 通配符', () => {
      const agent: CustomAgentDefinition = {
        name: 'glob-star-test',
        description: 'Glob Star Test',
        trigger_mode: 'rule',
        triggers: { files: ['src/*.ts'] },
        output: { category: 'style', default_severity: 'warning' },
        enabled: true,
        prompt: 'Glob Star',
        source_file: '/test/glob-star.md',
      };

      const files = ['src/index.ts', 'src/utils/helper.ts'];

      const result = selectAgentsByRules([agent], files);

      expect(result).toHaveLength(1);
    });
  });
});
