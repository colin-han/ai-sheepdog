/**
 * JIRA Issue 插件实现
 * @see .SPEC/2-design/issue-plugin.md §6
 */

import type {
  IssuePlugin,
  SyncContext,
  SyncResult,
  IssueStatusResult,
  IssueOperation,
  PluginConfig,
  RemoteIssue,
  OperationResult,
} from '../types/plugin.js';
import type { ValidatedIssue } from '../types/issue.js';
import type { Severity } from '../types/core.js';
import {
  formatIssueDescription,
  formatCorrelationLabel,
  formatIssueTitle,
  validateConfig,
} from './interface.js';
import { DEFAULT_SEVERITY_TO_JIRA_PRIORITY } from '../types/core.js';

/**
 * JIRA REST API 响应类型
 */
interface JiraIssue {
  id: string;
  key: string;
  self: string;
  fields: {
    project: { key: string };
    issuetype: { name: string };
    summary: string;
    description?: string;
    priority: { name: string };
    status: { name: string };
    labels: string[];
  };
}

interface JiraSearchResponse {
  startAt: number;
  maxResults: number;
  total: number;
  issues: JiraIssue[];
}

interface JiraCreateResponse {
  id: string;
  key: string;
  self: string;
}

interface JiraTransition {
  id: string;
  name: string;
  to: {
    name: string;
  };
}

interface JiraTransitionsResponse {
  transitions: JiraTransition[];
}

/**
 * JIRA 插件配置
 */
interface JiraConfig {
  baseUrl: string;
  email: string;
  apiToken: string;
  project: string;
  issueType: string;
  severityMapping: Record<Severity, string>;
  closedStatuses: string[];
}

/**
 * JIRA Issue 状态映射（已关闭的状态名称）
 */
const DEFAULT_CLOSED_STATUSES = ['Done', 'Closed', 'Resolved'] as const;

/**
 * 构建 Basic Auth 头
 */
function buildAuthHeader(email: string, apiToken: string): string {
  const credentials = `${email}:${apiToken}`;
  return `Basic ${Buffer.from(credentials).toString('base64')}`;
}

/**
 * 执行 JIRA API 请求
 */
async function jiraFetch<T>(
  config: JiraConfig,
  endpoint: string,
  options: RequestInit = {},
): Promise<T> {
  const url = `${config.baseUrl}/rest/api/2/${endpoint}`;
  const headers = {
    Authorization: buildAuthHeader(config.email, config.apiToken),
    'Content-Type': 'application/json',
    Accept: 'application/json',
    ...options.headers,
  };

  const response = await fetch(url, {
    ...options,
    headers,
  });

  if (!response.ok) {
    const errorText = await response.text().catch(() => 'Unknown error');
    throw new Error(
      `JIRA API error: ${response.status} ${response.statusText} - ${errorText}`,
    );
  }

  return (await response.json()) as T;
}

/**
 * JIRA 插件实现
 */
export class JiraPlugin implements IssuePlugin {
  readonly name = 'jira';
  private config?: JiraConfig;

  /**
   * 初始化插件配置
   */
  async initialize(config: PluginConfig): Promise<void> {
    // 验证必需的配置字段
    const validation = validateConfig(config, [
      'url',
      'token',
      'email',
      'project',
    ]);
    if (!validation.valid) {
      throw new Error(
        `JIRA plugin missing required fields: ${validation.missing?.join(', ')}`,
      );
    }

    const { url, token, email, project } = config.connection;

    if (!url || !token || !email || !project) {
      throw new Error(
        `JIRA plugin missing required fields: ${[!url && 'url', !token && 'token', !email && 'email', !project && 'project'].filter(Boolean).join(', ')}`,
      );
    }

    this.config = {
      baseUrl: url.replace(/\/$/, ''), // 移除末尾斜杠
      email,
      apiToken: token,
      project,
      issueType: config.connection['issueType'] || 'Bug',
      severityMapping:
        config.severity_mapping || DEFAULT_SEVERITY_TO_JIRA_PRIORITY,
      closedStatuses: config.connection['closedStatuses']
        ? config.connection['closedStatuses'].split(',')
        : [...DEFAULT_CLOSED_STATUSES],
    };
  }

  /**
   * 确保配置已初始化
   */
  private ensureInitialized(): JiraConfig {
    if (!this.config) {
      throw new Error('JIRA plugin not initialized. Call initialize() first.');
    }
    return this.config;
  }

  /**
   * 批量同步问题到 JIRA
   */
  async sync(context: SyncContext): Promise<SyncResult> {
    this.ensureInitialized();
    const results: OperationResult[] = [];
    const errors: string[] = [];

    for (const operation of context.operations) {
      try {
        const result = await this.executeOperation(
          operation,
          context.correlation_id,
        );
        results.push(result);
        if (!result.success) {
          errors.push(`[${result.local_issue_id}] ${result.error}`);
        }
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : 'Unknown error';
        results.push({
          local_issue_id:
            operation.type === 'create'
              ? operation.issue.id
              : operation.issue_id,
          operation: operation.type,
          success: false,
          error: errorMessage,
        });
        errors.push(`[${operation.type}] ${errorMessage}`);
      }
    }

    return {
      results,
      success: errors.length === 0,
      errors: errors.length > 0 ? errors : undefined,
    };
  }

  /**
   * 执行单个操作
   */
  private async executeOperation(
    operation: IssueOperation,
    correlationId: string,
  ): Promise<OperationResult> {
    this.ensureInitialized();

    switch (operation.type) {
      case 'create':
        return this.createIssue(operation.issue, correlationId);
      case 'update':
        return this.updateIssue(
          operation.issue_id,
          operation.issue,
          correlationId,
        );
      case 'close':
        return this.closeIssue(
          operation.issue_id,
          operation.reason,
          operation.status,
        );
    }
    // exhaustive check - should never reach here
    const _exhaustive: never = operation;
    return {
      local_issue_id: '',
      operation: (_exhaustive as IssueOperation).type,
      success: false,
      error: 'Unknown operation type',
    };
  }

  /**
   * 创建 JIRA issue
   */
  private async createIssue(
    issue: ValidatedIssue,
    correlationId: string,
  ): Promise<OperationResult> {
    const config = this.ensureInitialized();
    const priority = config.severityMapping[issue.severity];
    const description = formatIssueDescription(issue, correlationId);
    const labels = [formatCorrelationLabel(correlationId)];

    const payload = {
      fields: {
        project: { key: config.project },
        summary: formatIssueTitle({ type: 'create', issue }),
        description,
        issuetype: { name: config.issueType },
        priority: { name: priority },
        labels,
      },
    };

    try {
      const response = await jiraFetch<JiraCreateResponse>(config, 'issue', {
        method: 'POST',
        body: JSON.stringify(payload),
      });

      return {
        local_issue_id: issue.id,
        remote_issue_id: response.key,
        operation: 'create',
        success: true,
      };
    } catch (error) {
      return {
        local_issue_id: issue.id,
        operation: 'create',
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * 更新 JIRA issue
   */
  private async updateIssue(
    issueId: string,
    issue: ValidatedIssue,
    correlationId: string,
  ): Promise<OperationResult> {
    const config = this.ensureInitialized();
    const priority = config.severityMapping[issue.severity];
    const description = formatIssueDescription(issue, correlationId);

    const payload = {
      fields: {
        summary: formatIssueTitle({ type: 'update', issue_id: issueId, issue }),
        description,
        priority: { name: priority },
      },
    };

    try {
      await jiraFetch<void>(config, `issue/${issueId}`, {
        method: 'PUT',
        body: JSON.stringify(payload),
      });

      return {
        local_issue_id: issue.id,
        remote_issue_id: issueId,
        operation: 'update',
        success: true,
      };
    } catch (error) {
      return {
        local_issue_id: issue.id,
        remote_issue_id: issueId,
        operation: 'update',
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * 关闭 JIRA issue（转换到 Done 状态）
   */
  private async closeIssue(
    issueId: string,
    reason: string,
    status: string,
  ): Promise<OperationResult> {
    const config = this.ensureInitialized();

    try {
      // 获取可用的转换
      const transitionsResponse = await jiraFetch<JiraTransitionsResponse>(
        config,
        `issue/${issueId}/transitions`,
      );

      // 查找转换到 Done/Closed/Resolved 状态的转换
      const transition = transitionsResponse.transitions.find((t) =>
        config.closedStatuses.includes(t.to.name),
      );

      if (!transition) {
        return {
          local_issue_id: issueId,
          remote_issue_id: issueId,
          operation: 'close',
          success: false,
          error: `No transition to closed status found. Available: ${transitionsResponse.transitions.map((t) => t.to.name).join(', ')}`,
        };
      }

      // 添加评论说明关闭原因
      const commentPayload = {
        body: `Issue closed by AI Sheepdog.\n\nReason: ${reason}\nStatus: ${status}`,
      };
      await jiraFetch<void>(config, `issue/${issueId}/comment`, {
        method: 'POST',
        body: JSON.stringify(commentPayload),
      });

      // 执行转换
      await jiraFetch<void>(config, `issue/${issueId}/transitions`, {
        method: 'POST',
        body: JSON.stringify({ transition: { id: transition.id } }),
      });

      return {
        local_issue_id: issueId,
        remote_issue_id: issueId,
        operation: 'close',
        success: true,
      };
    } catch (error) {
      return {
        local_issue_id: issueId,
        remote_issue_id: issueId,
        operation: 'close',
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * 查询关联的 issue 状态（用于 CI Gate）
   */
  async getStatus(correlationId: string): Promise<IssueStatusResult> {
    const config = this.ensureInitialized();
    const label = formatCorrelationLabel(correlationId);

    try {
      // 使用 JQL 查询带有特定 label 的所有 issue
      const jql = encodeURIComponent(`labels = "${label}"`);
      const response = await jiraFetch<JiraSearchResponse>(
        config,
        `search?jql=${jql}&fields=key,status,summary,description`,
      );

      const issues: RemoteIssue[] = response.issues.map((jiraIssue) => {
        // 从 description 中解析出本地 issue ID
        const localId = this.extractLocalId(jiraIssue);

        return {
          remote_id: jiraIssue.key,
          local_id: localId || jiraIssue.key,
          is_closed: config.closedStatuses.includes(
            jiraIssue.fields.status.name,
          ),
          remote_status: jiraIssue.fields.status.name,
          title: jiraIssue.fields.summary,
        };
      });

      const openIssues = issues.filter((issue) => !issue.is_closed);

      return {
        correlation_id: correlationId,
        issues,
        all_closed: openIssues.length === 0,
        open_count: openIssues.length,
      };
    } catch {
      // 如果查询失败，返回空结果（不阻塞 review 流程）
      return {
        correlation_id: correlationId,
        issues: [],
        all_closed: true,
        open_count: 0,
      };
    }
  }

  /**
   * 从 JIRA issue 中提取本地 issue ID
   */
  private extractLocalId(jiraIssue: JiraIssue): string | null {
    // 从 summary 中提取本地 ID，格式为 [sec-001] Title
    const match = jiraIssue.fields.summary.match(/^\[([^\]]+)\]/);
    return match?.[1] ?? null;
  }
}

/**
 * 创建 JIRA 插件实例
 */
export function createJiraPlugin(): JiraPlugin {
  return new JiraPlugin();
}
