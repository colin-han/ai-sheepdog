#!/usr/bin/env node
/**
 * AI Sheepdog CLI 入口
 * @see .SPEC/2-design/cli.md
 */
import { Command } from 'commander';
import { registerReviewCommand } from './commands/review.js';
import { registerStatusCommand } from './commands/status.js';
import { registerConfigCommand } from './commands/config.js';

const program = new Command();

program
  .name('sheepdog')
  .description('AI Code Review tool using multi-agent system')
  .version('0.1.0');

registerReviewCommand(program);
registerStatusCommand(program);
registerConfigCommand(program);

program.parse();
