/**
 * 配置管理模块
 * 支持：全局配置 + 项目配置 + 环境变量覆盖
 * @see .SPEC/2-design/cli.md §5
 */
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { execSync } from 'node:child_process';
import yaml from 'js-yaml';
import type {
  GlobalConfig,
  ProjectConfig,
  ConfigSource,
} from '../types/index.js';
import { ENV_MAPPING, DEFAULT_CONFIG } from '../types/index.js';

/** 获取全局配置文件路径 */
export function getGlobalConfigPath(): string {
  const configDir =
    process.env['XDG_CONFIG_HOME'] ||
    path.join(os.homedir(), '.config', 'sheepdog');
  return path.join(configDir, 'config.yaml');
}

/** 加载 YAML 配置文件 */
function loadYamlFile(filePath: string): Record<string, unknown> | null {
  if (!fs.existsSync(filePath)) {
    return null;
  }
  const content = fs.readFileSync(filePath, 'utf-8');
  return yaml.load(content) as Record<string, unknown> | null;
}

/** 获取嵌套对象的值 */
function getNestedValue(obj: Record<string, unknown>, key: string): unknown {
  const parts = key.split('.');
  let current: unknown = obj;
  for (const part of parts) {
    if (
      current === null ||
      current === undefined ||
      typeof current !== 'object'
    ) {
      return undefined;
    }
    current = (current as Record<string, unknown>)[part];
  }
  return current;
}

/** 设置嵌套对象的值 */
function setNestedValue(
  obj: Record<string, unknown>,
  key: string,
  value: string,
): void {
  const parts = key.split('.');
  let current = obj;
  for (let i = 0; i < parts.length - 1; i++) {
    const part = parts[i]!;
    if (!(part in current) || typeof current[part] !== 'object') {
      current[part] = {};
    }
    current = current[part] as Record<string, unknown>;
  }
  const lastKey = parts[parts.length - 1]!;
  current[lastKey] = value;
}

/** 从环境变量读取配置 */
function loadEnvOverrides(): {
  values: Record<string, string>;
  sources: ConfigSource[];
} {
  const values: Record<string, string> = {};
  const sources: ConfigSource[] = [];

  for (const [envKey, configKey] of Object.entries(ENV_MAPPING)) {
    const envValue = process.env[envKey];
    if (envValue !== undefined && envValue !== '') {
      values[configKey] = envValue;
      sources.push({ key: configKey, value: envValue, source: 'env' });
    }
  }

  return { values, sources };
}

/** 加载全局配置 */
export function loadGlobalConfig(): {
  config: GlobalConfig;
  sources: ConfigSource[];
} {
  const configPath = getGlobalConfigPath();
  const rawConfig = loadYamlFile(configPath);
  const config = (rawConfig || {}) as GlobalConfig;
  const sources: ConfigSource[] = [];

  for (const [key, value] of Object.entries(rawConfig || {})) {
    const strValue = typeof value === 'string' ? value : JSON.stringify(value);
    sources.push({ key, value: strValue, source: 'global' });
  }

  return { config, sources };
}

/** 加载项目配置 */
export function loadProjectConfig(repoPath: string): {
  config: ProjectConfig;
  sources: ConfigSource[];
} {
  const configPath = path.join(repoPath, '.sheepdog', 'config.yaml');
  const rawConfig = loadYamlFile(configPath);
  const config = (rawConfig || {}) as ProjectConfig;
  const sources: ConfigSource[] = [];

  for (const [key, value] of Object.entries(rawConfig || {})) {
    const strValue = typeof value === 'string' ? value : JSON.stringify(value);
    sources.push({ key, value: strValue, source: 'project' });
  }

  return { config, sources };
}

/** 配置管理器 */
export class ConfigManager {
  private globalConfig: GlobalConfig = {};
  private projectConfig: ProjectConfig = {};
  private envValues: Record<string, string> = {};
  private _sources: ConfigSource[] = [];
  private _repoPath?: string;

  /** 获取当前项目路径 */
  get repoPath(): string | undefined {
    return this._repoPath;
  }

  /** 初始化配置 */
  async initialize(repoPath?: string): Promise<void> {
    this._repoPath = repoPath;

    // 1. Load global config
    const global = loadGlobalConfig();
    this.globalConfig = global.config;
    this._sources.push(...global.sources);

    // 2. Load project config
    if (repoPath) {
      const project = loadProjectConfig(repoPath);
      this.projectConfig = project.config;
      this._sources.push(...project.sources);
    }

    // 3. Load env overrides
    const env = loadEnvOverrides();
    this.envValues = env.values;
    this._sources.push(...env.sources);
  }

  /** 获取配置值（优先级：env > project > global > default） */
  get(key: string): string | undefined {
    // Env has highest priority
    if (this.envValues[key] !== undefined) {
      return this.envValues[key];
    }
    // Project config
    const projectVal = getNestedValue(
      this.projectConfig as unknown as Record<string, unknown>,
      key,
    );
    if (projectVal !== undefined) {
      return String(projectVal);
    }
    // Global config
    const globalVal = getNestedValue(
      this.globalConfig as unknown as Record<string, unknown>,
      key,
    );
    if (globalVal !== undefined) {
      return String(globalVal);
    }
    // Default
    const defaultVal = DEFAULT_CONFIG[key as keyof typeof DEFAULT_CONFIG];
    if (defaultVal !== undefined) {
      return defaultVal;
    }
    return undefined;
  }

  /** 设置全局配置值 */
  set(key: string, value: string): void {
    setNestedValue(
      this.globalConfig as unknown as Record<string, unknown>,
      key,
      value,
    );
    this.saveGlobalConfig();
  }

  /** 删除全局配置值 */
  delete(key: string): void {
    const parts = key.split('.');
    let current: unknown = this.globalConfig;
    for (let i = 0; i < parts.length - 1; i++) {
      const part = parts[i]!;
      if (
        current === null ||
        current === undefined ||
        typeof current !== 'object'
      ) {
        return;
      }
      current = (current as Record<string, unknown>)[part];
    }
    if (typeof current === 'object' && current !== null && parts.length > 0) {
      delete (current as Record<string, unknown>)[parts[parts.length - 1]!];
    }
    this.saveGlobalConfig();
  }

  /** 列出所有配置 */
  list(): Array<{ key: string; value: string; source: string }> {
    const result: Array<{ key: string; value: string; source: string }> = [];
    const seen = new Set<string>();

    // Add all known config keys
    for (const source of this._sources) {
      if (!seen.has(source.key)) {
        seen.add(source.key);
        result.push({
          key: source.key,
          value: source.value,
          source: source.source,
        });
      }
    }

    // Add defaults
    for (const [key, value] of Object.entries(DEFAULT_CONFIG)) {
      if (!seen.has(key)) {
        result.push({ key, value, source: 'default' });
      }
    }

    return result;
  }

  /** 获取配置来源追踪 */
  get sources(): ConfigSource[] {
    return this._sources;
  }

  /** 获取合并后的全局配置 */
  getGlobalConfig(): GlobalConfig {
    return this.globalConfig;
  }

  /** 获取合并后的项目配置 */
  getProjectConfig(): ProjectConfig {
    return this.projectConfig;
  }

  /** 获取运行时配置 */
  getRuntimeConfig() {
    return {
      global: this.globalConfig,
      project: this.projectConfig,
      sources: this._sources,
    };
  }

  /** 保存全局配置到文件 */
  private saveGlobalConfig(): void {
    const configPath = getGlobalConfigPath();
    const configDir = path.dirname(configPath);

    if (!fs.existsSync(configDir)) {
      fs.mkdirSync(configDir, { recursive: true });
    }

    const content = yaml.dump(this.globalConfig as Record<string, unknown>);
    fs.writeFileSync(configPath, content, 'utf-8');
  }
}

/** 获取项目名称
 * 优先级：.sheepdog/config.yaml > git remote URL > 目录名
 */
export function getProjectName(repoPath: string): string {
  const projectConfig = loadProjectConfig(repoPath).config;
  if (projectConfig.project_name) {
    return projectConfig.project_name;
  }

  // Try to get from git remote URL
  try {
    const remoteUrl = execSync('git remote get-url origin', {
      cwd: repoPath,
      encoding: 'utf-8',
    }).trim();
    // Extract project name from URL
    const match = remoteUrl.match(/([^/]+?)(?:\.git)?$/);
    if (match?.[1]) {
      return match[1];
    }
  } catch {
    // Ignore errors
  }

  // Fallback to directory name
  return path.basename(repoPath);
}

/** 生成 correlation_id
 * 格式：项目名称:reviewBranch:baseBranch
 */
export function getCorrelationId(
  projectName: string,
  sourceRef: string,
  targetRef: string,
): string {
  return `${projectName}:${sourceRef}:${targetRef}`;
}
