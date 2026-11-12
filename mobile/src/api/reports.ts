import type {
  ApiResponse,
  ReportDetail,
  ReportListResponse,
  ReportReadResult,
  ReportKind,
  ReportSettings,
  ReportSettingsPayload,
} from '../types';
import client, { unwrap } from './client';

/**
 * 财报总结接口（个人账本）。
 *
 * 契约见 docs/v0.17/ARCH.md 第六节：所有请求都不带 target / partner，
 * 后端只返回当前登录用户自己的设置与报告。
 */

/** 列表查询上限：后端限制 1–100，默认 30。 */
const DEFAULT_LIMIT = 30;

/**
 * 「还没有设置」时的服务端默认值（ARCH 6.1 固定契约）。
 * 仅用于设置弹层在 GET 失败/未落库时的表单初值，不伪造报告数据。
 */
export const DEFAULT_REPORT_SETTINGS: ReportSettings = {
  exists: false,
  enabled: false,
  kind: 'monthly',
  anchor_weekday: null,
  anchor_day: 1,
  anchor_hour: 9,
  next_run_at: null,
  last_period_end: null,
};

/** GET /reports/settings：当前用户的生成设置（无设置时返回默认值）。 */
export const fetchReportSettings = async (): Promise<ReportSettings> => {
  const response = await client.get<ApiResponse<ReportSettings>>(
    '/reports/settings',
  );
  return unwrap(response.data);
};

/** PUT /reports/settings：保存后按 enabled 计算或清空 next_run_at。 */
export const updateReportSettings = async (
  payload: ReportSettingsPayload,
): Promise<ReportSettings> => {
  const response = await client.put<ApiResponse<ReportSettings>>(
    '/reports/settings',
    payload,
  );
  return unwrap(response.data);
};

/** GET /reports：生成时间倒序的报告列表 + 未读总数。 */
export const fetchReports = async (
  limit: number = DEFAULT_LIMIT,
): Promise<ReportListResponse> => {
  const response = await client.get<ApiResponse<ReportListResponse>>(
    '/reports',
    { params: { limit } },
  );
  return unwrap(response.data);
};

/** GET /reports/{id}：别人的报告返回 404。 */
export const fetchReportDetail = async (id: number): Promise<ReportDetail> => {
  const response = await client.get<ApiResponse<ReportDetail>>(
    `/reports/${id}`,
  );
  return unwrap(response.data);
};

/** POST /reports/{id}/read：已读重复调用保持原值。 */
export const markReportRead = async (id: number): Promise<ReportReadResult> => {
  const response = await client.post<ApiResponse<ReportReadResult>>(
    `/reports/${id}/read`,
  );
  return unwrap(response.data);
};

/**
 * POST /reports/generate-now：按当前设置生成最近一期；已存在返回已有报告，
 * 不自动标记已读。
 */
export const generateReportNow = async (
  kind?: ReportKind,
): Promise<ReportDetail> => {
  const response = await client.post<ApiResponse<ReportDetail>>(
    '/reports/generate-now',
    null,
    kind ? { params: { kind } } : undefined,
  );
  return unwrap(response.data);
};
