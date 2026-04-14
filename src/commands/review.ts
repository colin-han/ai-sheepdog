/**
 * sheepdog review 命令
 * @see .SPEC/2-design/cli.md §3
 */
import type { Command } from 'commander';
import { ConfigManager } from '../config/config.js';

export function registerReviewCommand(program: Command): void {
  program
    .command('review')
    .description('审查代码（首次/增量），同步 issue')
    .argument('<repo>', 'Git 仓库路径')
    .argument('<source>', 'reviewBranch（分支名或 commit SHA）')
    .argument('<target>', 'baseBranch（分支名或 commit SHA）')
    .option('--previous-review <path>', '上一次审查结果的 JSON 文件路径')
    .option('--json', '以 JSON 格式输出', false)
    .option('--verbose', '详细输出模式', false)
    .action(
      async (
        repo: string,
        source: string,
        target: string,
        options: {
          previousReview?: string;
          json: boolean;
          verbose: boolean;
        },
      ) => {
        try {
          const config = new ConfigManager();
          await config.initialize(repo);

          if (options.verbose) {
            console.log(`Reviewing ${repo}: ${source} → ${target}`);
          }

          // TODO: Phase 2+ - Implement full review pipeline
          console.log('Review command is not yet fully implemented.');
          console.log(`Would review: ${repo} ${source} ${target}`);
          process.exit(0);
        } catch (error: unknown) {
          const message =
            error instanceof Error ? error.message : String(error);
          console.error(`Error: ${message}`);
          process.exit(1);
        }
      },
    );
}
