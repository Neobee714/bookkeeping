import type { ApiResponse } from '../types';
import client, { unwrap } from './client';

/** 账单邮箱服务商：QQ / 163。 */
export type BillMailboxProvider = 'qq' | '163';

/** GET / PUT 返回的邮箱配置；授权码永不回传，只看 has_password。 */
export interface BillMailboxConfig {
  configured: boolean;
  provider?: BillMailboxProvider;
  /** 后端按服务商预设的 IMAP 主机（imap.qq.com / imap.163.com）。 */
  host?: string;
  port?: number;
  username?: string;
  /** 收件文件夹，默认 INBOX。 */
  folder?: string;
  enabled?: boolean;
  has_password?: boolean;
  last_sync_at?: string | null;
  last_status?: 'ok' | 'error' | null;
  last_error?: string | null;
  last_summary?: string | null;
  /** false 表示服务器 SECRET_KEY 是临时生成的，重启后旧授权码解不开。 */
  secret_stable: boolean;
}

/**
 * 保存 / 连接测试的请求体。
 * password 留空表示沿用已保存的授权码（首次配置时必须填写）。
 */
export interface BillMailboxPayload {
  provider: BillMailboxProvider;
  username: string;
  password?: string;
  folder?: string;
  enabled: boolean;
}

export interface BillMailboxTestResult {
  ok: boolean;
}

/** 立即同步的结果；summary 是给用户看的一句话。 */
export interface BillMailboxSyncResult {
  ok: boolean;
  messages: number;
  imported: number;
  duplicated: number;
  failed: number;
  error: string | null;
  summary: string;
}

const BASE_PATH = '/transactions/import/mailbox';

/** 连接测试要等 IMAP 登录握手，比普通请求慢。 */
const TEST_TIMEOUT_MS = 60000;

/** 同步会逐封下载并解析账单附件，单独放宽超时。 */
const SYNC_TIMEOUT_MS = 180000;

/** 查询当前用户的账单邮箱配置。 */
export const fetchBillMailbox = async (): Promise<BillMailboxConfig> => {
  const response = await client.get<ApiResponse<BillMailboxConfig>>(BASE_PATH);
  return unwrap(response.data);
};

/** 保存配置；password 为空时不传，后端沿用旧授权码。 */
export const saveBillMailbox = async (
  payload: BillMailboxPayload,
): Promise<BillMailboxConfig> => {
  const response = await client.put<ApiResponse<BillMailboxConfig>>(
    BASE_PATH,
    payload,
  );
  return unwrap(response.data);
};

/** 连接测试；失败时后端返回 400 + 可读原因，由调用方转成行内提示。 */
export const testBillMailbox = async (
  payload: BillMailboxPayload,
): Promise<BillMailboxTestResult> => {
  const response = await client.post<ApiResponse<BillMailboxTestResult>>(
    `${BASE_PATH}/test`,
    payload,
    { timeout: TEST_TIMEOUT_MS },
  );
  return unwrap(response.data);
};

/** 立即同步：收信 → 取附件 → 解析 → 入账，返回本轮统计。 */
export const syncBillMailbox = async (): Promise<BillMailboxSyncResult> => {
  const response = await client.post<ApiResponse<BillMailboxSyncResult>>(
    `${BASE_PATH}/sync`,
    undefined,
    { timeout: SYNC_TIMEOUT_MS },
  );
  return unwrap(response.data);
};

/** 删除配置（授权码一并删除）。 */
export const deleteBillMailbox = async (): Promise<{ configured: false }> => {
  const response =
    await client.delete<ApiResponse<{ configured: false }>>(BASE_PATH);
  return unwrap(response.data);
};
