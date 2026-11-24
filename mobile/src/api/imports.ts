import type { ApiResponse, TransactionType } from '../types';
import type { PickedBillFile } from '../native/BillPicker';
import client, { unwrap } from './client';

/** 账单来源：微信 / 支付宝。 */
export type ImportSource = 'wechat' | 'alipay';

/**
 * 分类来源：
 * - learned 命中了用户记住的规则；
 * - builtin 命中内置关键词规则；
 * - default 兜底分类；
 * - existing 这笔之前已入过账，分类取库里的值。
 */
export type ImportMatch = 'learned' | 'builtin' | 'default' | 'existing';

export interface ImportCategoryOption {
  name: string;
  icon: string;
}

export interface ImportSkipReason {
  reason: string;
  count: number;
  amount: string;
}

export interface ImportSummary {
  total: number;
  importable: number;
  skipped: number;
  expense_count: number;
  expense_amount: string;
  income_count: number;
  income_amount: string;
  /** 转账 / 提现（记录但不计入收支）。 */
  transfer_count?: number;
  transfer_amount?: string;
  /** 账单时间范围 [起, 止]；没有可导入行时可能为 null。 */
  range: [string, string] | null;
  /** 账单抬头里的账户昵称，可能为空。 */
  account: string;
  skipped_reasons: ImportSkipReason[];
}

export interface ImportPreviewRow {
  client_id: string;
  date: string;
  /** 金额字符串，保留两位小数。 */
  amount: string;
  type: TransactionType;
  merchant: string;
  /** 平台 / 渠道（淘宝 / 美团 / 滴滴…）；老后端可能不返回。 */
  channel?: string;
  note: string;
  category: string;
  match: ImportMatch;
  /** 之前已导入过，预览默认不勾选。 */
  existing: boolean;
}

export interface ImportSkippedRow {
  reason: string;
  date: string;
  amount: string;
  merchant: string;
  type: TransactionType;
}

export interface ImportPreview {
  source: ImportSource;
  summary: ImportSummary;
  categories: {
    expense: ImportCategoryOption[];
    income: ImportCategoryOption[];
    transfer: ImportCategoryOption[];
  };
  rows: ImportPreviewRow[];
  skipped: ImportSkippedRow[];
}

export interface ImportCommitRow {
  client_id: string;
  date: string;
  amount: string;
  type: TransactionType;
  category: string;
  merchant: string;
  /** 平台 / 渠道；预览行有值时原样带回。 */
  channel?: string;
  note: string;
}

/**
 * 「以后这个商家 / 平台都用这个分类」写进后端 import_rules。
 * 平台单没有店铺名时只传 channel，店铺单只传 merchant（二选一）。
 */
export interface ImportLearnRule {
  merchant?: string;
  channel?: string;
  category: string;
}

export interface ImportCommitPayload {
  source: ImportSource;
  rows: ImportCommitRow[];
  learn: ImportLearnRule[];
}

export interface ImportCommitResult {
  imported: number;
  duplicated: number;
  learned: number;
  invalid: number;
}

/** 识别较慢（解压 / 穷举密码），单独放宽超时。 */
const PREVIEW_TIMEOUT_MS = 120000;

/**
 * 上传账单文件做预览识别：不落库，只返回汇总、分类与逐行结果。
 * password 留空时服务端会自行尝试微信账单的默认处理。
 */
export const previewImport = async (
  file: PickedBillFile,
  password?: string,
): Promise<ImportPreview> => {
  const form = new FormData();
  form.append('file', {
    uri: file.path,
    name: file.name,
    type: 'application/octet-stream',
  } as unknown as Blob);
  const trimmed = password?.trim();
  if (trimmed) {
    form.append('password', trimmed);
  }

  const response = await client.post<ApiResponse<ImportPreview>>(
    '/transactions/import/preview',
    form,
    {
      headers: { 'Content-Type': 'multipart/form-data' },
      timeout: PREVIEW_TIMEOUT_MS,
    },
  );
  return unwrap(response.data);
};

/** 提交用户勾选的行：后端去重落库，并按 learn 写商家分类规则。 */
export const commitImport = async (
  payload: ImportCommitPayload,
): Promise<ImportCommitResult> => {
  const response = await client.post<ApiResponse<ImportCommitResult>>(
    '/transactions/import/commit',
    payload,
  );
  return unwrap(response.data);
};

// ---------- 规则管理（v0.24） ----------

/** 一条导入学习规则；merchant 是后端规则键（店铺名或平台名）。 */
export interface ImportRule {
  id: number;
  /** 规则来源账单：wechat / alipay。 */
  source: string;
  merchant: string;
  category: string;
  /** 命中次数，列表已按它降序。 */
  hits: number;
}

/** 我的 → 分类规则：列出所有学过的规则。 */
export const fetchImportRules = async (): Promise<ImportRule[]> => {
  const response = await client.get<ApiResponse<ImportRule[]>>(
    '/transactions/import/rules',
  );
  return unwrap(response.data);
};

/** 改规则分类；返回更新后的规则。 */
export const updateImportRule = async (
  id: number,
  category: string,
): Promise<ImportRule> => {
  const response = await client.patch<ApiResponse<ImportRule>>(
    `/transactions/import/rules/${id}`,
    { category },
  );
  return unwrap(response.data);
};

/** 删除规则；失败时抛错由页面降级提示。 */
export const deleteImportRule = async (id: number): Promise<void> => {
  const response = await client.delete<ApiResponse<{ id: number }>>(
    `/transactions/import/rules/${id}`,
  );
  unwrap(response.data);
};
