/**
 * sheepdog status 命令
 * @see .SPEC/2-design/cli.md §4
 */
import type { Command } from 'commander';
import { ConfigManager } from '../config/config.js';
import { getProjectName, getCorrelationId } from '../config/config.js';
import { JiraPlugin } from '../plugins/jira.js';
import { findPreviousReport } from '../report/persistence.js';
import type { Severity } from '../types/core.js';
import { generateMergeDecision, parseSeverity } from './merge-decision.js';
import { formatStatusOutput, formatJsonOutput } from './formatters.js';

export function registerStatusCommand(program: Command): void {
  program
    .command('status')
    .description('检查合并状态（CI gate）')
    .argument('<repo>', 'Git 仓库路径')
    .argument('<source>', 'reviewBranch')
    .argument('<target>', 'baseBranch')
    .option(
      '--allow-severity <level>',
      '允许的最高严重程度，该级别及以下均不阻止合并',
    )
    .option('--json', '以 JSON 格式输出', false)
    .action(
      async (
        repo: string,
        source: string,
        target: string,
        options: {
          allowSeverity?: string;
          json: boolean;
        },
      ) => {
        try {
          const config = new ConfigManager();
          await config.initialize(repo);

          // 获取项目名称和 correlation_id
          const projectName = getProjectName(repo);
          const correlationId = getCorrelationId(projectName, source, target);

          // 确定 allow_severity（优先级：CLI 参数 > 项目配置 > 全局配置）
          let allowSeverity: Severity | undefined;
          if (options.allowSeverity) {
            const parsed = parseSeverity(options.allowSeverity);
            if (parsed) {
              allowSeverity = parsed;
            } else {
              console.error(
                `Error: Invalid severity level: ${options.allowSeverity}. Valid values: critical, error, warning, suggestion`,
              );
              process.exit(1);
              return;
            }
          } else {
            // 从配置读取
            const configValue = config.get('status.allow-severity');
            if (configValue) {
              const parsed = parseSeverity(configValue);
              if (parsed) {
                allowSeverity = parsed;
              }
            }
          }

          // 初始化 JIRA 插件
          const plugin = new JiraPlugin();
          const pluginConfig = {
            connection: {
              url: config.get('jira.url') || '',
              token: config.get('jira.token') || '',
              email: config.get('jira.email') || '',
              project: config.get('jira.project') || '',
            },
          };
          await plugin.initialize(pluginConfig);

          // 查询 issue 状态
          const statusResult = await plugin.getStatus(correlationId);

          // 从本地报告获取 issue severity 映射
          const issueSeverities = new Map<string, Severity>();
          const previousReport = findPreviousReport(repo, correlationId);
          if (previousReport) {
            for (const issue of previousReport.issues) {
              if (issue.remote_id) {
                issueSeverities.set(issue.remote_id, issue.severity);
              }
              // 也使用本地 ID 作为 key（备用）
              issueSeverities.set(issue.id, issue.severity);
            }
          }

          // 生成分并决策
          const decision = generateMergeDecision(
            statusResult,
            issueSeverities,
            allowSeverity,
          );

          // 输出结果
          if (options.json) {
            console.log(formatJsonOutput(decision));
          } else {
            console.log(formatStatusOutput(decision));
          }

          // 根据决策设置退出码
          process.exit(decision.can_merge ? 0 : 1);
        } catch (error: unknown) {
          const message =
            error instanceof Error ? error.message : String(error);
          console.error(`Error: ${message}`);
          process.exit(1);
        }
      },
    );
}
