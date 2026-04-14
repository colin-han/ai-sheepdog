/**
 * checklist-loader 单元测试
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import {
  loadChecklist,
  loadChecklistFromRepo,
  filterChecklistByCategory,
  checklistToPrompt,
} from '../checklist-loader.js';

describe('checklist-loader', () => {
  const testDir = path.join(process.cwd(), '.tmp', 'checklist-loader-test');
  const rulesDir = path.join(testDir, '.sheepdog', 'rules');

  beforeEach(() => {
    fs.mkdirSync(rulesDir, { recursive: true });
  });

  afterEach(() => {
    if (fs.existsSync(testDir)) {
      fs.rmSync(testDir, { recursive: true, force: true });
    }
  });

  describe('loadChecklist', () => {
    it('应该正确解析 YAML 检查清单', () => {
      const yamlContent = `- id: api-auth-check
  category: security
  question: "API 端点是否都有认证保护？"
  defaultResult: error
- id: async-check
  category: performance
  question: "异步操作是否正确处理？"
  defaultResult: warning
`;

      const checklistPath = path.join(rulesDir, 'checklist.yaml');
      fs.writeFileSync(checklistPath, yamlContent, 'utf-8');

      const result = loadChecklist(checklistPath);

      expect(result.error).toBeUndefined();
      expect(result.items).toHaveLength(2);

      const apiItem = result.items.find((i) => i.id === 'api-auth-check');
      expect(apiItem).toBeDefined();
      expect(apiItem?.category).toBe('security');
      expect(apiItem?.question).toBe('API 端点是否都有认证保护？');
      expect(apiItem?.defaultResult).toBe('error');

      const asyncItem = result.items.find((i) => i.id === 'async-check');
      expect(asyncItem).toBeDefined();
      expect(asyncItem?.category).toBe('performance');
      expect(asyncItem?.defaultResult).toBe('warning');
    });

    it('应该支持所有有效的 category', () => {
      const yamlContent = `- id: security-check
  category: security
  question: "安全检查"
  defaultResult: error
- id: logic-check
  category: logic
  question: "逻辑检查"
  defaultResult: error
- id: performance-check
  category: performance
  question: "性能检查"
  defaultResult: warning
- id: style-check
  category: style
  question: "风格检查"
  defaultResult: suggestion
`;

      const checklistPath = path.join(rulesDir, 'checklist.yaml');
      fs.writeFileSync(checklistPath, yamlContent, 'utf-8');

      const result = loadChecklist(checklistPath);

      expect(result.items).toHaveLength(4);
    });

    it('应该支持所有有效的 defaultResult', () => {
      const yamlContent = `- id: critical-check
  category: security
  question: "关键检查"
  defaultResult: critical
- id: error-check
  category: security
  question: "错误检查"
  defaultResult: error
- id: warning-check
  category: security
  question: "警告检查"
  defaultResult: warning
- id: suggestion-check
  category: security
  question: "建议检查"
  defaultResult: suggestion
`;

      const checklistPath = path.join(rulesDir, 'checklist.yaml');
      fs.writeFileSync(checklistPath, yamlContent, 'utf-8');

      const result = loadChecklist(checklistPath);

      expect(result.items).toHaveLength(4);
    });

    it('应该跳过无效的检查项', () => {
      const yamlContent = `- id: valid-check
  category: security
  question: "有效检查"
  defaultResult: error
- id: invalid-category
  category: invalid
  question: "无效类别"
  defaultResult: error
- id: invalid-severity
  category: security
  question: "无效严重程度"
  defaultResult: invalid
- id: missing-fields
  category: security
  defaultResult: error
`;

      const checklistPath = path.join(rulesDir, 'checklist.yaml');
      fs.writeFileSync(checklistPath, yamlContent, 'utf-8');

      const result = loadChecklist(checklistPath);

      // 只应该有有效的一项
      expect(result.items).toHaveLength(1);
      expect(result.items[0]!.id).toBe('valid-check');
    });

    it('文件不存在时应该返回空数组', () => {
      const checklistPath = path.join(rulesDir, 'nonexistent.yaml');
      const result = loadChecklist(checklistPath);

      expect(result.items).toHaveLength(0);
      expect(result.error).toBeUndefined();
    });

    it('无效的 YAML 应该返回错误', () => {
      const checklistPath = path.join(rulesDir, 'invalid.yaml');
      fs.writeFileSync(checklistPath, 'invalid: yaml: content:', 'utf-8');

      const result = loadChecklist(checklistPath);

      expect(result.items).toHaveLength(0);
      expect(result.error).toBeDefined();
    });

    it('YAML 不是数组时应该返回错误', () => {
      const checklistPath = path.join(rulesDir, 'not-array.yaml');
      fs.writeFileSync(
        checklistPath,
        'id: single-item\ncategory: security\n',
        'utf-8',
      );

      const result = loadChecklist(checklistPath);

      expect(result.items).toHaveLength(0);
      expect(result.error).toContain('数组');
    });
  });

  describe('loadChecklistFromRepo', () => {
    it('应该从项目目录加载检查清单', () => {
      const yamlContent = `- id: test-check
  category: security
  question: "测试检查"
  defaultResult: error
`;

      const checklistPath = path.join(rulesDir, 'checklist.yaml');
      fs.writeFileSync(checklistPath, yamlContent, 'utf-8');

      const result = loadChecklistFromRepo(testDir);

      expect(result.items).toHaveLength(1);
      expect(result.items[0]!.id).toBe('test-check');
    });
  });

  describe('filterChecklistByCategory', () => {
    const sampleItems = [
      {
        id: 'security-1',
        category: 'security' as const,
        question: '安全检查 1',
        defaultResult: 'error' as const,
      },
      {
        id: 'security-2',
        category: 'security' as const,
        question: '安全检查 2',
        defaultResult: 'warning' as const,
      },
      {
        id: 'logic-1',
        category: 'logic' as const,
        question: '逻辑检查 1',
        defaultResult: 'error' as const,
      },
      {
        id: 'style-1',
        category: 'style' as const,
        question: '风格检查 1',
        defaultResult: 'suggestion' as const,
      },
    ];

    it('应该按类别过滤检查清单', () => {
      const securityItems = filterChecklistByCategory(sampleItems, 'security');

      expect(securityItems).toHaveLength(2);
      expect(securityItems[0]!.id).toBe('security-1');
      expect(securityItems[1]!.id).toBe('security-2');
    });

    it('没有匹配项时应该返回空数组', () => {
      const perfItems = filterChecklistByCategory(sampleItems, 'performance');

      expect(perfItems).toHaveLength(0);
    });
  });

  describe('checklistToPrompt', () => {
    const sampleItems = [
      {
        id: 'api-auth',
        category: 'security' as const,
        question: 'API 端点是否都有认证保护？',
        defaultResult: 'error' as const,
      },
      {
        id: 'async-await',
        category: 'logic' as const,
        question: '异步操作是否正确使用 await？',
        defaultResult: 'warning' as const,
      },
      {
        id: 'naming',
        category: 'style' as const,
        question: '变量命名是否符合规范？',
        defaultResult: 'suggestion' as const,
      },
    ];

    it('应该将检查清单转换为提示文本', () => {
      const prompt = checklistToPrompt(sampleItems);

      expect(prompt).toContain('## 检查清单');
      expect(prompt).toContain('### 安全');
      expect(prompt).toContain('### 逻辑');
      expect(prompt).toContain('### 代码风格');
      expect(prompt).toContain('API 端点是否都有认证保护？');
      expect(prompt).toContain('(默认: error)');
    });

    it('空数组应该返回空字符串', () => {
      const prompt = checklistToPrompt([]);

      expect(prompt).toBe('');
    });

    it('应该正确分组和排序', () => {
      const prompt = checklistToPrompt(sampleItems);

      // 验证类别顺序
      const securityIndex = prompt.indexOf('### 安全');
      const logicIndex = prompt.indexOf('### 逻辑');
      const styleIndex = prompt.indexOf('### 代码风格');

      expect(securityIndex).toBeLessThan(logicIndex);
      expect(logicIndex).toBeLessThan(styleIndex);
    });
  });
});
