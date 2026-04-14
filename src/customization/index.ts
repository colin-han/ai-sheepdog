/**
 * 定制化模块导出
 * @see .SPEC/2-design/customization.md
 */

// Agent 加载器
export {
  loadCustomAgents,
  loadAgentsFromRepo,
  type CustomAgentLoadResult,
  type LoadError,
} from './agent-loader.js';

// 规则加载器
export {
  loadRules,
  loadRulesFromRepo,
  injectRulesToAgent,
  injectRulesToAgents,
  selectAgentsByRules,
  type RuleDefinition,
  type RuleLoadResult,
} from './rule-loader.js';

// 项目标准感知
export {
  extractProjectStandards,
  standardsToReviewContext,
  isTypeScriptStrict,
  type ProjectStandards,
} from './standards-extractor.js';

// 检查清单加载器
export {
  loadChecklist,
  loadChecklistFromRepo,
  filterChecklistByCategory,
  checklistToPrompt,
  type ChecklistItem,
  type ChecklistLoadResult,
} from './checklist-loader.js';
