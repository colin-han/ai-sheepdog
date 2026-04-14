/**
 * Phase 0: 配置管理测试
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { ConfigManager, getCorrelationId } from '../../config/config.js';

describe('Phase 0: Config Management', () => {
  let tempDir: string;
  let originalEnv: Record<string, string | undefined>;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sheepdog-config-test-'));
    originalEnv = {};
    // Save and clear relevant env vars
    for (const key of Object.keys(process.env)) {
      if (key.startsWith('SHEEPDOG_')) {
        originalEnv[key] = process.env[key];
        delete process.env[key];
      }
    }
  });

  afterEach(() => {
    // Restore env vars
    for (const [key, value] of Object.entries(originalEnv)) {
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  describe('0.1 sheepdog --version', () => {
    it('should have version in package.json', async () => {
      const pkgPath = path.resolve(
        new URL('../../../package.json', import.meta.url).pathname.replace(
          /^\/([A-Z]:)/,
          '$1',
        ),
        '.',
      );
      const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));
      expect(pkg.version).toMatch(/^\d+\.\d+\.\d+$/);
    });
  });

  describe('0.3-0.5 config set/get', () => {
    it('should set and get a config value', async () => {
      const config = new ConfigManager();
      await config.initialize();

      config.set('jira.url', 'https://x.com');
      expect(config.get('jira.url')).toBe('https://x.com');
    });

    it('should list all config values', async () => {
      const config = new ConfigManager();
      await config.initialize();

      const entries = config.list();
      expect(entries.length).toBeGreaterThan(0);
    });

    it('should delete a config value', async () => {
      const config = new ConfigManager();
      await config.initialize();

      config.set('jira.url', 'https://test.com');
      expect(config.get('jira.url')).toBe('https://test.com');

      config.delete('jira.url');
      expect(config.get('jira.url')).toBeUndefined();
    });
  });

  describe('0.5 env var override', () => {
    it('should override config with env var', async () => {
      process.env['SHEEPDOG_JIRA_TOKEN'] = 'env-token-xxx';

      const config = new ConfigManager();
      await config.initialize();

      expect(config.get('jira.token')).toBe('env-token-xxx');
    });
  });

  describe('0.6-0.7 project config and priority', () => {
    it('should load project config', async () => {
      // Create project config
      const sheepdogDir = path.join(tempDir, '.sheepdog');
      fs.mkdirSync(sheepdogDir, { recursive: true });
      fs.writeFileSync(
        path.join(sheepdogDir, 'config.yaml'),
        'project_name: my-project\n',
      );

      const config = new ConfigManager();
      await config.initialize(tempDir);

      // Project config project_name is accessed through ProjectConfig,
      // but the get method checks project config
      expect(config.getProjectConfig().project_name).toBe('my-project');
    });

    it('should respect priority: env > project > global', async () => {
      // Create project config
      const sheepdogDir = path.join(tempDir, '.sheepdog');
      fs.mkdirSync(sheepdogDir, { recursive: true });
      fs.writeFileSync(
        path.join(sheepdogDir, 'config.yaml'),
        'project_name: project-value\n',
      );

      // Set global config
      const config = new ConfigManager();
      await config.initialize(tempDir);
      config.set('jira.url', 'https://global.com');

      // Global value
      expect(config.get('jira.url')).toBe('https://global.com');

      // Env overrides
      process.env['SHEEPDOG_JIRA_URL'] = 'https://env.com';
      const config2 = new ConfigManager();
      await config2.initialize(tempDir);
      expect(config2.get('jira.url')).toBe('https://env.com');
    });
  });

  describe('0.12 env var mapping', () => {
    it('should map all SHEEPDOG_* env vars to config keys', async () => {
      const envMappings: Record<string, string> = {
        SHEEPDOG_JIRA_URL: 'jira.url',
        SHEEPDOG_JIRA_TOKEN: 'jira.token',
        SHEEPDOG_JIRA_PROJECT: 'jira.project',
        SHEEPDOG_MODEL: 'model',
        SHEEPDOG_AGENT_MODEL: 'agent-model',
        SHEEPDOG_LIGHT_MODEL: 'light-model',
        SHEEPDOG_WORKTREE_DIR: 'worktree-dir',
      };

      for (const envKey of Object.keys(envMappings)) {
        process.env[envKey] = `test-${envKey}`;
      }

      const config = new ConfigManager();
      await config.initialize();

      for (const [envKey, configKey] of Object.entries(envMappings)) {
        expect(config.get(configKey)).toBe(`test-${envKey}`);
      }
    });
  });

  describe('correlation_id', () => {
    it('should generate correlation_id with correct format', () => {
      const id = getCorrelationId('my-project', 'feature', 'main');
      expect(id).toBe('my-project:feature:main');
    });
  });
});
