/**
 * 自定义检查清单加载器
 * 从 .sheepdog/rules/checklist.yaml 加载检查清单
 * @see .SPEC/2-design/customization.md §3
 */

import fs from 'node:fs';
import path from 'node:path';
import yaml from 'js-yaml';
import type { Severity } from '../types/index.js';

/** 检查清单项 */
export interface ChecklistItem {
  /** 检查项 ID */
  id: string;
  /** 问题类别 */
  category: 'security' | 'logic' | 'performance' | 'style';
  /** 检查问题 */
  question: string;
  /** 默认结果 */
  defaultResult: Severity;
}

/** 检查清单加载结果 */
export interface ChecklistLoadResult {
  /** 检查清单列表 */
  items: ChecklistItem[];
  /** 加载错误 */
  error?: string;
}

/**
 * 加载检查清单 YAML 文件
 * @param checklistPath 检查清单文件路径
 * @returns 加载结果
 */
export function loadChecklist(checklistPath: string): ChecklistLoadResult {
  if (!fs.existsSync(checklistPath)) {
    return { items: [] };
  }

  try {
    const content = fs.readFileSync(checklistPath, 'utf-8');
    const data = yaml.load(content) as unknown;

    if (!Array.isArray(data)) {
      return {
        items: [],
        error: '检查清单文件必须是一个数组',
      };
    }

    const items: ChecklistItem[] = [];

    for (const item of data) {
      if (typeof item !== 'object' || item === null) {
        continue;
      }

      const obj = item as Record<string, unknown>;

      // 验证必须字段
      if (!obj.id || !obj.category || !obj.question || !obj.defaultResult) {
        continue;
      }

      const id = String(obj.id);
      const category = String(obj.category);
      const question = String(obj.question);
      const defaultResult = String(obj.defaultResult);

      // 验证 category
      const validCategories = ['security', 'logic', 'performance', 'style'];
      if (!validCategories.includes(category)) {
        continue;
      }

      // 验证 defaultResult
      const validSeverities = ['critical', 'error', 'warning', 'suggestion'];
      if (!validSeverities.includes(defaultResult)) {
        continue;
      }

      items.push({
        id,
        category: category as 'security' | 'logic' | 'performance' | 'style',
        question,
        defaultResult: defaultResult as Severity,
      });
    }

    return { items };
  } catch (err) {
    return {
      items: [],
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

/**
 * 从项目根目录加载检查清单
 * @param repoPath 项目根目录
 * @returns 加载结果
 */
export function loadChecklistFromRepo(repoPath: string): ChecklistLoadResult {
  const checklistPath = path.join(
    repoPath,
    '.sheepdog',
    'rules',
    'checklist.yaml',
  );
  return loadChecklist(checklistPath);
}

/**
 * 按类别过滤检查清单
 */
export function filterChecklistByCategory(
  items: ChecklistItem[],
  category: 'security' | 'logic' | 'performance' | 'style',
): ChecklistItem[] {
  return items.filter((item) => item.category === category);
}

/**
 * 将检查清单转换为 Agent 使用的提示文本
 */
export function checklistToPrompt(items: ChecklistItem[]): string {
  if (items.length === 0) {
    return '';
  }

  const lines: string[] = ['## 检查清单\n'];

  // 按类别分组
  const grouped: Record<string, ChecklistItem[]> = {
    security: [],
    logic: [],
    performance: [],
    style: [],
  };

  for (const item of items) {
    const cat = item.category;
    if (!grouped[cat]) {
      grouped[cat] = [];
    }
    grouped[cat].push(item);
  }

  const categoryNames: Record<string, string> = {
    security: '安全',
    logic: '逻辑',
    performance: '性能',
    style: '代码风格',
  };

  for (const [category, categoryItems] of Object.entries(grouped)) {
    if (categoryItems.length === 0) {
      continue;
    }

    lines.push(`\n### ${categoryNames[category]}\n`);

    for (const item of categoryItems) {
      lines.push(`- [ ] ${item.question} (默认: ${item.defaultResult})`);
    }
  }

  return lines.join('\n');
}
