/**
 * 项目标准感知模块
 * 自动提取项目配置（ESLint、TypeScript、Prettier）作为审查上下文
 * @see .SPEC/2-design/customization.md §3
 */

import fs from 'node:fs';
import path from 'node:path';
import { glob } from 'glob';

/** 提取的项目标准 */
export interface ProjectStandards {
  /** ESLint 配置 */
  eslint?: string;
  /** TypeScript 配置 */
  typescript?: string;
  /** Prettier 配置 */
  prettier?: string;
}

/**
 * 查找并读取 ESLint 配置文件
 * 支持多种格式：.eslintrc.js, .eslintrc.cjs, .eslintrc.json, .eslintrc.yaml, .eslintrc.yml, eslint.config.js, eslint.config.mjs
 */
function findESLintConfig(repoPath: string): string | undefined {
  const possibleFiles = [
    '.eslintrc.js',
    '.eslintrc.cjs',
    '.eslintrc.json',
    '.eslintrc.yaml',
    '.eslintrc.yml',
    'eslint.config.js',
    'eslint.config.mjs',
    'eslint.config.ts',
  ];

  for (const file of possibleFiles) {
    const filePath = path.join(repoPath, file);
    if (fs.existsSync(filePath)) {
      try {
        const content = fs.readFileSync(filePath, 'utf-8');

        // 对于 JS/CJS/TS 配置，尝试提取配置对象
        if (
          file.endsWith('.js') ||
          file.endsWith('.cjs') ||
          file.endsWith('.ts')
        ) {
          // 简化处理：直接返回源码，实际使用时可能需要动态加载
          return `/* ESLint Config: ${file} */\n${content}`;
        }

        // JSON/YAML 格式直接返回
        return content;
      } catch {
        // 读取失败，继续尝试下一个
      }
    }
  }

  // 检查 package.json 中的 eslintConfig
  const pkgJsonPath = path.join(repoPath, 'package.json');
  if (fs.existsSync(pkgJsonPath)) {
    try {
      const pkgJson = JSON.parse(fs.readFileSync(pkgJsonPath, 'utf-8'));
      if (pkgJson.eslintConfig) {
        return JSON.stringify(pkgJson.eslintConfig, null, 2);
      }
    } catch {
      // 忽略错误
    }
  }

  return undefined;
}

/**
 * 查找并读取 TypeScript 配置文件
 * 支持多种格式：tsconfig.json, tsconfig.*.json
 */
function findTypeScriptConfig(repoPath: string): string | undefined {
  // 优先查找 tsconfig.json
  const mainConfigPath = path.join(repoPath, 'tsconfig.json');
  if (fs.existsSync(mainConfigPath)) {
    try {
      const content = fs.readFileSync(mainConfigPath, 'utf-8');
      return content;
    } catch {
      // 读取失败
    }
  }

  // 查找其他 tsconfig.*.json 文件
  const tsconfigPattern = 'tsconfig.*.json';
  const matches = glob.sync(tsconfigPattern, {
    cwd: repoPath,
    windowsPathsNoEscape: true,
    absolute: false,
  });

  if (matches.length > 0) {
    // 按名称排序，取第一个
    matches.sort();
    const filePath = path.join(repoPath, matches[0]!);
    try {
      const content = fs.readFileSync(filePath, 'utf-8');
      return content;
    } catch {
      // 读取失败
    }
  }

  return undefined;
}

/**
 * 查找并读取 Prettier 配置文件
 * 支持多种格式：.prettierrc, .prettierrc.json, .prettierrc.yaml, .prettierrc.yml, .prettierrc.js, .prettierrc.cjs, prettier.config.js, prettier.config.cjs
 */
function findPrettierConfig(repoPath: string): string | undefined {
  const possibleFiles = [
    '.prettierrc',
    '.prettierrc.json',
    '.prettierrc.yaml',
    '.prettierrc.yml',
    '.prettierrc.js',
    '.prettierrc.cjs',
    'prettier.config.js',
    'prettier.config.cjs',
    '.prettierrc.toml',
  ];

  for (const file of possibleFiles) {
    const filePath = path.join(repoPath, file);
    if (fs.existsSync(filePath)) {
      try {
        const content = fs.readFileSync(filePath, 'utf-8');

        // 对于 JS/CJS 配置，返回源码
        if (file.endsWith('.js') || file.endsWith('.cjs')) {
          return `/* Prettier Config: ${file} */\n${content}`;
        }

        return content;
      } catch {
        // 读取失败，继续尝试下一个
      }
    }
  }

  // 检查 package.json 中的 prettier 配置
  const pkgJsonPath = path.join(repoPath, 'package.json');
  if (fs.existsSync(pkgJsonPath)) {
    try {
      const pkgJson = JSON.parse(fs.readFileSync(pkgJsonPath, 'utf-8'));
      if (pkgJson.prettier) {
        return JSON.stringify(pkgJson.prettier, null, 2);
      }
    } catch {
      // 忽略错误
    }
  }

  return undefined;
}

/**
 * 从项目中提取所有标准配置
 * @param repoPath 项目根目录
 * @returns 提取的项目标准
 */
export function extractProjectStandards(repoPath: string): ProjectStandards {
  const standards: ProjectStandards = {};

  // 提取 ESLint 配置
  standards.eslint = findESLintConfig(repoPath);

  // 提取 TypeScript 配置
  standards.typescript = findTypeScriptConfig(repoPath);

  // 提取 Prettier 配置
  standards.prettier = findPrettierConfig(repoPath);

  return standards;
}

/**
 * 将项目标准转换为审查上下文字符串
 * @param standards 项目标准
 * @returns 格式化的审查上下文
 */
export function standardsToReviewContext(standards: ProjectStandards): string {
  const sections: string[] = [];

  if (standards.eslint) {
    sections.push('## ESLint 配置\n```json\n' + standards.eslint + '\n```\n');
  }

  if (standards.typescript) {
    sections.push(
      '## TypeScript 配置\n```json\n' + standards.typescript + '\n```\n',
    );
  }

  if (standards.prettier) {
    sections.push(
      '## Prettier 配置\n```json\n' + standards.prettier + '\n```\n',
    );
  }

  if (sections.length === 0) {
    return '// 未找到项目标准配置';
  }

  return (
    '# 项目标准\n\n' +
    '以下配置信息来自项目的 ESLint、TypeScript 和 Prettier 配置文件，请在代码审查时参考这些标准：\n\n' +
    sections.join('\n')
  );
}

/**
 * 检查 TypeScript 是否启用 strict 模式
 */
export function isTypeScriptStrict(repoPath: string): boolean {
  const tsConfig = findTypeScriptConfig(repoPath);
  if (!tsConfig) {
    return false;
  }

  try {
    const config = JSON.parse(tsConfig);
    // strict 可能在根级别或 compilerOptions 下
    if (config.strict === true) {
      return true;
    }
    if (config.compilerOptions?.strict === true) {
      return true;
    }
    return false;
  } catch {
    return false;
  }
}
