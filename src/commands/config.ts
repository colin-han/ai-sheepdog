/**
 * sheepdog config 命令
 * @see .SPEC/2-design/cli.md §5
 */
import type { Command } from 'commander';
import { ConfigManager, getGlobalConfigPath } from '../config/config.js';

export function registerConfigCommand(program: Command): void {
  const configCmd = program.command('config').description('管理全局配置');

  configCmd
    .command('set')
    .description('设置配置值')
    .argument('<key>', '配置键')
    .argument('<value>', '配置值')
    .action(async (key: string, value: string) => {
      try {
        const config = new ConfigManager();
        await config.initialize();
        config.set(key, value);
        console.log(`Set ${key} = ${value}`);
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error);
        console.error(`Error: ${message}`);
        process.exit(1);
      }
    });

  configCmd
    .command('get')
    .description('获取配置值')
    .argument('<key>', '配置键')
    .action(async (key: string) => {
      try {
        const config = new ConfigManager();
        await config.initialize();
        const value = config.get(key);
        if (value !== undefined) {
          console.log(value);
        } else {
          console.error(`Key "${key}" not found`);
          process.exit(1);
        }
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error);
        console.error(`Error: ${message}`);
        process.exit(1);
      }
    });

  configCmd
    .command('list')
    .description('列出所有配置')
    .action(async () => {
      try {
        const config = new ConfigManager();
        await config.initialize();
        const entries = config.list();
        for (const entry of entries) {
          console.log(`${entry.key} = ${entry.value} (${entry.source})`);
        }
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error);
        console.error(`Error: ${message}`);
        process.exit(1);
      }
    });

  configCmd
    .command('delete')
    .description('删除配置值')
    .argument('<key>', '配置键')
    .action(async (key: string) => {
      try {
        const config = new ConfigManager();
        await config.initialize();
        config.delete(key);
        console.log(`Deleted ${key}`);
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error);
        console.error(`Error: ${message}`);
        process.exit(1);
      }
    });

  configCmd
    .command('path')
    .description('显示配置文件路径')
    .action(() => {
      console.log(getGlobalConfigPath());
    });
}
