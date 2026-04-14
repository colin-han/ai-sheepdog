/**
 * Git Diff 模块测试
 */

import { describe, it, expect } from 'vitest';
import {
  detectRefType,
  determineDiffStrategy,
  categorizeFile,
  isWhitespaceOnlyChange,
  parseUnifiedDiff,
} from '../diff.js';

describe('detectRefType', () => {
  it('应该识别 commit SHA', () => {
    expect(detectRefType('abc123def')).toBe('commit');
    expect(detectRefType('ABC123DEF')).toBe('commit');
    expect(detectRefType('a1b2c3d4e5f6a7b8c9d0')).toBe('commit');
  });

  it('应该识别分支名', () => {
    expect(detectRefType('main')).toBe('branch');
    expect(detectRefType('feature/test-branch')).toBe('branch');
    expect(detectRefType('develop')).toBe('branch');
    expect(detectRefType('origin/main')).toBe('branch');
  });
});

describe('determineDiffStrategy', () => {
  it('两个 commit 应该使用 two-dot 策略', () => {
    expect(determineDiffStrategy('abc1234', 'def4567')).toBe('two-dot');
  });

  it('分支对比应该使用 three-dot 策略', () => {
    expect(determineDiffStrategy('feature', 'main')).toBe('three-dot');
  });

  it('混合 ref 应该使用 three-dot 策略', () => {
    expect(determineDiffStrategy('abc1234', 'main')).toBe('three-dot');
    expect(determineDiffStrategy('feature', 'def4567')).toBe('three-dot');
  });
});

describe('categorizeFile', () => {
  it('应该正确分类源代码文件', () => {
    expect(categorizeFile('src/index.ts')).toBe('source');
    expect(categorizeFile('lib/app.js')).toBe('source');
    expect(categorizeFile('components/Header.tsx')).toBe('source');
    expect(categorizeFile('script.py')).toBe('source');
    expect(categorizeFile('main.go')).toBe('source');
  });

  it('应该正确分类配置文件', () => {
    expect(categorizeFile('package.json')).toBe('config');
    expect(categorizeFile('tsconfig.json')).toBe('config');
    expect(categorizeFile('.eslintrc')).toBe('config');
    expect(categorizeFile('config.yaml')).toBe('config');
    expect(categorizeFile('data/config.yml')).toBe('config');
  });

  it('应该正确分类数据文件', () => {
    expect(categorizeFile('README.md')).toBe('data');
    expect(categorizeFile('docs/api.md')).toBe('data');
    expect(categorizeFile('schema.proto')).toBe('data');
    expect(categorizeFile('query.sql')).toBe('data');
  });

  it('应该正确分类资源文件', () => {
    expect(categorizeFile('style.css')).toBe('asset');
    expect(categorizeFile('main.scss')).toBe('asset');
    expect(categorizeFile('index.html')).toBe('asset');
    expect(categorizeFile('logo.png')).toBe('asset');
  });

  it('应该正确分类锁文件', () => {
    expect(categorizeFile('package-lock.json')).toBe('lock');
    expect(categorizeFile('yarn.lock')).toBe('lock');
    expect(categorizeFile('pnpm-lock.yaml')).toBe('lock');
    expect(categorizeFile('Cargo.lock')).toBe('lock');
  });

  it('应该正确分类生成文件', () => {
    expect(categorizeFile('node_modules/lodash/index.js')).toBe('generated');
    expect(categorizeFile('dist/main.js')).toBe('generated');
    expect(categorizeFile('build/app.js')).toBe('generated');
    expect(categorizeFile('types.generated.ts')).toBe('generated');
  });

  it('未知文件应该默认为 asset', () => {
    expect(categorizeFile('unknown.xyz')).toBe('asset');
  });
});

describe('isWhitespaceOnlyChange', () => {
  it('应该检测纯空白变更', () => {
    expect(isWhitespaceOnlyChange('    \n\t\n   \n')).toBe(true);
    expect(isWhitespaceOnlyChange('     ')).toBe(true);
    expect(isWhitespaceOnlyChange('\n\n\n')).toBe(true);
  });

  it('应该拒绝非空白变更', () => {
    expect(isWhitespaceOnlyChange('    const x = 1;\n')).toBe(false);
    expect(isWhitespaceOnlyChange('a\nb\nc')).toBe(false);
  });
});

describe('parseUnifiedDiff', () => {
  it('应该解析单个文件的 diff', () => {
    const diffText = `
diff --git a/src/index.ts b/src/index.ts
index abc123..def456 100644
--- a/src/index.ts
+++ b/src/index.ts
@@ -1,3 +1,4 @@
 const x = 1;
+const y = 2;
 console.log(x);
`;

    const files = parseUnifiedDiff(diffText);
    expect(files).toHaveLength(1);
    expect(files[0].path).toBe('src/index.ts');
    expect(files[0].change_type).toBe('modified');
    expect(files[0].hunks).toHaveLength(1);
    expect(files[0].hunks![0].old_start).toBe(1);
    expect(files[0].hunks![0].new_start).toBe(1);
  });

  it('应该解析新增文件的 diff', () => {
    const diffText = `
diff --git a/src/new.ts b/src/new.ts
new file mode 100644
index 0000000..abc123
--- /dev/null
+++ b/src/new.ts
@@ -0,0 +1,3 @@
+const x = 1;
+console.log(x);
`;

    const files = parseUnifiedDiff(diffText);
    expect(files).toHaveLength(1);
    expect(files[0].path).toBe('src/new.ts');
    expect(files[0].change_type).toBe('added');
  });

  it('应该解析删除文件的 diff', () => {
    const diffText = `
diff --git a/src/old.ts b/src/old.ts
deleted file mode 100644
index abc123..0000000
--- a/src/old.ts
+++ /dev/null
@@ -1,3 +0,0 @@
-const x = 1;
-console.log(x);
`;

    const files = parseUnifiedDiff(diffText);
    expect(files).toHaveLength(1);
    expect(files[0].path).toBe('src/old.ts');
    expect(files[0].change_type).toBe('deleted');
  });

  it('应该解析重命名文件的 diff', () => {
    const diffText = `
diff --git a/src/old.ts b/src/new.ts
similarity index 100%
rename from old.ts
rename to new.ts
`;

    const files = parseUnifiedDiff(diffText);
    expect(files).toHaveLength(1);
    expect(files[0].path).toBe('src/new.ts');
    expect(files[0].old_path).toBe('src/old.ts');
    expect(files[0].change_type).toBe('renamed');
  });

  it('应该解析多个文件的 diff', () => {
    const diffText = `
diff --git a/src/a.ts b/src/a.ts
index abc123..def456 100644
--- a/src/a.ts
+++ b/src/a.ts
@@ -1,1 +1,2 @@
-const a = 1;
+const a = 2;
diff --git a/src/b.ts b/src/b.ts
index abc123..def456 100644
--- a/src/b.ts
+++ b/src/b.ts
@@ -1,1 +1,2 @@
 const b = 1;
+const b2 = 2;
`;

    const files = parseUnifiedDiff(diffText);
    expect(files).toHaveLength(2);
    expect(files[0].path).toBe('src/a.ts');
    expect(files[1].path).toBe('src/b.ts');
  });

  it('应该正确解析多个 hunk', () => {
    const diffText = `
diff --git a/src/index.ts b/src/index.ts
index abc123..def456 100644
--- a/src/index.ts
+++ b/src/index.ts
@@ -1,3 +1,4 @@
 const x = 1;
+const y = 2;
 console.log(x);
@@ -10,3 +11,4 @@
 const a = 1;
 const b = 2;
+const c = 3;
`;

    const files = parseUnifiedDiff(diffText);
    expect(files).toHaveLength(1);
    expect(files[0].hunks).toHaveLength(2);
    expect(files[0].hunks![0].old_start).toBe(1);
    expect(files[0].hunks![1].old_start).toBe(10);
  });

  it('应该正确标记纯空白变更', () => {
    const diffText = `
diff --git a/src/index.ts b/src/index.ts
index abc123..def456 100644
--- a/src/index.ts
+++ b/src/index.ts
@@ -1,2 +1,2 @@
-const x=1;
+const x = 1;
`;

    const files = parseUnifiedDiff(diffText);
    expect(files).toHaveLength(1);
    expect(files[0].is_whitespace_only).toBe(false); // 有实际变化
  });
});
