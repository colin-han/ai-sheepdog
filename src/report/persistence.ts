/**
 * 报告持久化
 * @see .SPEC/1-requirement/review.md §3.3
 */

import fs from 'node:fs';
import path from 'node:path';
import type { ReviewReport } from '../types/index.js';

/**
 * Sheepdog 数据目录
 */
const SHEEPDOG_DIR = '.sheepdog';
const REVIEWS_DIR = path.join(SHEEPDOG_DIR, 'reviews');

/**
 * 确保 reviews 目录存在
 */
function ensureReviewsDir(basePath: string): void {
  const reviewsPath = path.join(basePath, REVIEWS_DIR);
  if (!fs.existsSync(reviewsPath)) {
    fs.mkdirSync(reviewsPath, { recursive: true });
  }
}

/**
 * 获取 correlation ID 的目录路径
 */
function getCorrelationDir(basePath: string, correlationId: string): string {
  const reviewsPath = path.join(basePath, REVIEWS_DIR);
  const correlationDir = path.join(reviewsPath, correlationId);

  if (!fs.existsSync(correlationDir)) {
    fs.mkdirSync(correlationDir, { recursive: true });
  }

  return correlationDir;
}

/**
 * 生成报告文件名
 */
function generateReportFilename(timestamp: string): string {
  // 使用 ISO 格式的时间戳，替换特殊字符
  const safeTimestamp = timestamp.replace(/[:.]/g, '-');
  return `${safeTimestamp}.json`;
}

/**
 * 保存报告到文件
 *
 * @param basePath - 项目根目录
 * @param report - 审查报告
 * @returns 保存的文件路径
 */
export function saveReport(basePath: string, report: ReviewReport): string {
  ensureReviewsDir(basePath);

  const correlationId = report.metadata.correlation_id;
  const correlationDir = getCorrelationDir(basePath, correlationId);

  const filename = generateReportFilename(report.metadata.timestamp);
  const filepath = path.join(correlationDir, filename);

  fs.writeFileSync(filepath, JSON.stringify(report, null, 2), 'utf-8');

  return filepath;
}

/**
 * 查找上一次的 review 结果
 *
 * @param basePath - 项目根目录
 * @param correlationId - 关联 ID
 * @returns 上一次的报告，如果不存在则返回 null
 */
export function findPreviousReport(
  basePath: string,
  correlationId: string,
): ReviewReport | null {
  const correlationDir = path.join(basePath, REVIEWS_DIR, correlationId);

  if (!fs.existsSync(correlationDir)) {
    return null;
  }

  // 读取目录中的所有 JSON 文件
  const files = fs
    .readdirSync(correlationDir)
    .filter((f) => f.endsWith('.json'))
    .sort()
    .reverse();

  if (files.length === 0) {
    return null;
  }

  // 读取最新的文件
  const latestFile = path.join(correlationDir, files[0]!);
  try {
    const content = fs.readFileSync(latestFile, 'utf-8');
    return JSON.parse(content) as ReviewReport;
  } catch {
    return null;
  }
}

/**
 * 列出指定 correlation_id 的所有报告
 *
 * @param basePath - 项目根目录
 * @param correlationId - 关联 ID
 * @returns 报告列表（按时间倒序）
 */
export function listReportsByCorrelation(
  basePath: string,
  correlationId: string,
): ReviewReport[] {
  const correlationDir = path.join(basePath, REVIEWS_DIR, correlationId);

  if (!fs.existsSync(correlationDir)) {
    return [];
  }

  const files = fs
    .readdirSync(correlationDir)
    .filter((f) => f.endsWith('.json'))
    .sort()
    .reverse();

  const reports: ReviewReport[] = [];

  for (const file of files) {
    const filepath = path.join(correlationDir, file);
    try {
      const content = fs.readFileSync(filepath, 'utf-8');
      const report = JSON.parse(content) as ReviewReport;
      reports.push(report);
    } catch {
      // 跳过无效文件
    }
  }

  return reports;
}

/**
 * 清理旧的报告文件
 *
 * @param basePath - 项目根目录
 * @param correlationId - 关联 ID
 * @param keepCount - 保留的最新报告数量
 */
export function cleanupOldReports(
  basePath: string,
  correlationId: string,
  keepCount: number = 10,
): void {
  const correlationDir = path.join(basePath, REVIEWS_DIR, correlationId);

  if (!fs.existsSync(correlationDir)) {
    return;
  }

  const files = fs
    .readdirSync(correlationDir)
    .filter((f) => f.endsWith('.json'))
    .sort()
    .reverse();

  // 删除超出保留数量的旧文件
  for (let i = keepCount; i < files.length; i++) {
    const filepath = path.join(correlationDir, files[i]!);
    try {
      fs.unlinkSync(filepath);
    } catch {
      // 忽略删除失败
    }
  }
}

/**
 * 获取所有 correlation ID 列表
 *
 * @param basePath - 项目根目录
 * @returns correlation ID 列表
 */
export function listCorrelationIds(basePath: string): string[] {
  const reviewsPath = path.join(basePath, REVIEWS_DIR);

  if (!fs.existsSync(reviewsPath)) {
    return [];
  }

  return fs
    .readdirSync(reviewsPath, { withFileTypes: true })
    .filter((dirent) => dirent.isDirectory())
    .map((dirent) => dirent.name);
}
