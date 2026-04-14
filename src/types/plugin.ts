/**
 * Issue 插件类型
 * @see .SPEC/2-design/issue-plugin.md §2-5
 */
import type { Severity, VerificationStatus } from './core.js';
import type { ValidatedIssue } from './issue.js';

/** Issue 操作（联合类型） */
export type IssueOperation =
  | { type: 'create'; issue: ValidatedIssue }
  | {
      type: 'close';
      issue_id: string;
      reason: string;
      status: VerificationStatus;
    }
  | { type: 'update'; issue_id: string; issue: ValidatedIssue };

/** 同步上下文（插件输入） */
export interface SyncContext {
  /** 关联标识：项目名称 + reviewBranch + baseBranch */
  correlation_id: string;
  /** 本次同步的问题操作列表 */
  operations: IssueOperation[];
}

/** 操作结果 */
export interface OperationResult {
  /** 对应的本地 issue ID */
  local_issue_id: string;
  /** 远程系统的 issue ID（如 JIRA issue key） */
  remote_issue_id?: string;
  /** 操作类型 */
  operation: IssueOperation['type'];
  /** 是否成功 */
  success: boolean;
  /** 错误信息 */
  error?: string;
}

/** 同步结果（插件输出） */
export interface SyncResult {
  /** 操作结果列表 */
  results: OperationResult[];
  /** 是否全部成功 */
  success: boolean;
  /** 错误信息 */
  errors?: string[];
}

/** 远程 issue 信息 */
export interface RemoteIssue {
  /** 远程系统中的 issue ID */
  remote_id: string;
  /** 本地 issue ID */
  local_id: string;
  /** 是否已关闭 */
  is_closed: boolean;
  /** 远程系统中的状态 */
  remote_status: string;
  /** 标题 */
  title: string;
}

/** Issue 状态查询结果（CI Gate 使用） */
export interface IssueStatusResult {
  /** 关联标识 */
  correlation_id: string;
  /** 关联的所有 issue */
  issues: RemoteIssue[];
  /** 是否全部关闭 */
  all_closed: boolean;
  /** 未关闭的 issue 数量 */
  open_count: number;
}

/** 插件配置 */
export interface PluginConfig {
  /** 远程系统连接配置 */
  connection: Record<string, string>;
  /** severity → issue priority 映射 */
  severity_mapping?: Record<Severity, string>;
  /** 关联标识前缀 */
  correlation_prefix?: string;
}

/** Issue 插件接口 */
export interface IssuePlugin {
  /** 插件名称 */
  name: string;

  /** 初始化配置 */
  initialize(config: PluginConfig): Promise<void>;

  /**
   * 批量同步问题到 issue management system
   */
  sync(context: SyncContext): Promise<SyncResult>;

  /**
   * 查询关联的 issue 状态（用于 CI Gate）
   */
  getStatus(correlationId: string): Promise<IssueStatusResult>;
}
