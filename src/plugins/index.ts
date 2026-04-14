/**
 * 插件系统统一导出
 */

// 导出接口和工具函数
export {
  formatIssueDescription,
  formatCorrelationLabel,
  validateConfig,
  formatIssueTitle,
} from './interface.js';

export type {
  IssuePlugin,
  SyncContext,
  SyncResult,
  IssueStatusResult,
  IssueOperation,
  PluginConfig,
} from './interface.js';

// 导出 JIRA 插件
export { JiraPlugin, createJiraPlugin } from './jira.js';
