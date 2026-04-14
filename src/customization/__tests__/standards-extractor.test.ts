/**
 * standards-extractor 单元测试
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import {
  extractProjectStandards,
  standardsToReviewContext,
  isTypeScriptStrict,
} from '../standards-extractor.js';

describe('standards-extractor', () => {
  const testDir = path.join(process.cwd(), '.tmp', 'standards-extractor-test');

  beforeEach(() => {
    fs.mkdirSync(testDir, { recursive: true });
  });

  afterEach(() => {
    if (fs.existsSync(testDir)) {
      fs.rmSync(testDir, { recursive: true, force: true });
    }
  });

  describe('extractProjectStandards', () => {
    it('应该提取 .eslintrc.json 配置', () => {
      const eslintConfig = {
        rules: {
          'no-console': 'error',
          semi: ['error', 'always'],
        },
      };
      fs.writeFileSync(
        path.join(testDir, '.eslintrc.json'),
        JSON.stringify(eslintConfig, null, 2),
        'utf-8',
      );

      const standards = extractProjectStandards(testDir);

      expect(standards.eslint).toContain('no-console');
      expect(standards.eslint).toContain('semi');
    });

    it('应该提取 .eslintrc.js 配置', () => {
      const eslintConfig = `module.exports = {
  rules: {
    'no-console': 'error'
  }
}`;
      fs.writeFileSync(
        path.join(testDir, '.eslintrc.js'),
        eslintConfig,
        'utf-8',
      );

      const standards = extractProjectStandards(testDir);

      expect(standards.eslint).toContain('ESLint Config');
      expect(standards.eslint).toContain('no-console');
    });

    it('应该提取 eslint.config.js 配置', () => {
      const eslintConfig = `export default [
  {
    rules: {
      'no-console': 'error'
    }
  }
]`;
      fs.writeFileSync(
        path.join(testDir, 'eslint.config.js'),
        eslintConfig,
        'utf-8',
      );

      const standards = extractProjectStandards(testDir);

      expect(standards.eslint).toContain('eslint.config.js');
    });

    it('应该提取 package.json 中的 eslintConfig', () => {
      const pkgJson = {
        eslintConfig: {
          rules: {
            'no-console': 'error',
          },
        },
      };
      fs.writeFileSync(
        path.join(testDir, 'package.json'),
        JSON.stringify(pkgJson, null, 2),
        'utf-8',
      );

      const standards = extractProjectStandards(testDir);

      expect(standards.eslint).toContain('no-console');
    });

    it('应该提取 tsconfig.json 配置', () => {
      const tsConfig = {
        compilerOptions: {
          strict: true,
          target: 'ES2020',
        },
      };
      fs.writeFileSync(
        path.join(testDir, 'tsconfig.json'),
        JSON.stringify(tsConfig, null, 2),
        'utf-8',
      );

      const standards = extractProjectStandards(testDir);

      expect(standards.typescript).toContain('"strict": true');
      expect(standards.typescript).toContain('"target": "ES2020"');
    });

    it('应该提取 tsconfig.*.json 配置', () => {
      const tsConfig = {
        extends: './tsconfig.json',
        compilerOptions: {
          types: ['node'],
        },
      };
      fs.writeFileSync(
        path.join(testDir, 'tsconfig.build.json'),
        JSON.stringify(tsConfig, null, 2),
        'utf-8',
      );

      const standards = extractProjectStandards(testDir);

      // 应该提取 tsconfig.build.json 的内容
      expect(standards.typescript).toBeDefined();
      expect(standards.typescript).toContain('node');
    });

    it('应该提取 .prettierrc 配置', () => {
      const prettierConfig = {
        semi: true,
        singleQuote: true,
      };
      fs.writeFileSync(
        path.join(testDir, '.prettierrc'),
        JSON.stringify(prettierConfig, null, 2),
        'utf-8',
      );

      const standards = extractProjectStandards(testDir);

      expect(standards.prettier).toContain('"semi": true');
      expect(standards.prettier).toContain('"singleQuote": true');
    });

    it('应该提取 .prettierrc.json 配置', () => {
      const prettierConfig = {
        semi: false,
      };
      fs.writeFileSync(
        path.join(testDir, '.prettierrc.json'),
        JSON.stringify(prettierConfig, null, 2),
        'utf-8',
      );

      const standards = extractProjectStandards(testDir);

      expect(standards.prettier).toContain('"semi": false');
    });

    it('应该提取 prettier.config.js 配置', () => {
      const prettierConfig = `module.exports = {
  semi: true,
  singleQuote: true
}`;
      fs.writeFileSync(
        path.join(testDir, 'prettier.config.js'),
        prettierConfig,
        'utf-8',
      );

      const standards = extractProjectStandards(testDir);

      expect(standards.prettier).toContain('Prettier Config');
      expect(standards.prettier).toContain('semi');
    });

    it('应该提取 package.json 中的 prettier 配置', () => {
      const pkgJson = {
        prettier: {
          semi: false,
          trailingComma: 'es5',
        },
      };
      fs.writeFileSync(
        path.join(testDir, 'package.json'),
        JSON.stringify(pkgJson, null, 2),
        'utf-8',
      );

      const standards = extractProjectStandards(testDir);

      expect(standards.prettier).toContain('"semi": false');
    });

    it('没有配置文件时应该返回 undefined', () => {
      const standards = extractProjectStandards(testDir);

      expect(standards.eslint).toBeUndefined();
      expect(standards.typescript).toBeUndefined();
      expect(standards.prettier).toBeUndefined();
    });

    it('应该按优先级选择配置文件', () => {
      // 同时存在多个 ESLint 配置
      fs.writeFileSync(
        path.join(testDir, '.eslintrc.yml'),
        'rules:\n  no-console: error',
        'utf-8',
      );
      fs.writeFileSync(
        path.join(testDir, '.eslintrc.json'),
        '{"rules": {"semi": "error"}}',
        'utf-8',
      );

      const standards = extractProjectStandards(testDir);

      // 优先选择 .eslintrc.json
      expect(standards.eslint).toContain('semi');
    });
  });

  describe('standardsToReviewContext', () => {
    it('应该将所有标准格式化为审查上下文', () => {
      const standards = {
        eslint: '{"rules": {"no-console": "error"}}',
        typescript: '{"strict": true}',
        prettier: '{"semi": true}',
      };

      const context = standardsToReviewContext(standards);

      expect(context).toContain('# 项目标准');
      expect(context).toContain('## ESLint 配置');
      expect(context).toContain('## TypeScript 配置');
      expect(context).toContain('## Prettier 配置');
      expect(context).toContain('no-console');
      expect(context).toContain('strict');
      expect(context).toContain('semi');
    });

    it('没有标准时应该返回提示信息', () => {
      const context = standardsToReviewContext({});

      expect(context).toContain('未找到项目标准配置');
    });

    it('应该只包含存在的标准', () => {
      const standards = {
        eslint: '{"rules": {}}',
        typescript: undefined,
        prettier: undefined,
      };

      const context = standardsToReviewContext(standards);

      expect(context).toContain('## ESLint 配置');
      expect(context).not.toContain('## TypeScript 配置');
      expect(context).not.toContain('## Prettier 配置');
    });
  });

  describe('isTypeScriptStrict', () => {
    it('应该检测 strict: true', () => {
      const tsConfig = {
        compilerOptions: {
          strict: true,
        },
      };
      fs.writeFileSync(
        path.join(testDir, 'tsconfig.json'),
        JSON.stringify(tsConfig, null, 2),
        'utf-8',
      );

      const result = isTypeScriptStrict(testDir);

      // strict 在 compilerOptions 下
      expect(result).toBe(true);
    });

    it('应该检测 strict: false', () => {
      const tsConfig = {
        compilerOptions: {
          strict: false,
        },
      };
      fs.writeFileSync(
        path.join(testDir, 'tsconfig.json'),
        JSON.stringify(tsConfig, null, 2),
        'utf-8',
      );

      const result = isTypeScriptStrict(testDir);

      expect(result).toBe(false);
    });

    it('没有 strict 字段时应该返回 false', () => {
      const tsConfig = {
        compilerOptions: {
          target: 'ES2020',
        },
      };
      fs.writeFileSync(
        path.join(testDir, 'tsconfig.json'),
        JSON.stringify(tsConfig, null, 2),
        'utf-8',
      );

      const result = isTypeScriptStrict(testDir);

      expect(result).toBe(false);
    });

    it('没有 tsconfig.json 时应该返回 false', () => {
      const result = isTypeScriptStrict(testDir);

      expect(result).toBe(false);
    });
  });
});
