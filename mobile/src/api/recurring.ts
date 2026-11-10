import type {
  ApiResponse,
  RecurringCreatePayload,
  RecurringRule,
  RecurringUpdatePayload,
} from '../types';
import client, { unwrap } from './client';

/** GET /recurring：当前用户的循环规则（enabled DESC, next_run_date ASC）。 */
export const fetchRecurringRules = async (): Promise<RecurringRule[]> => {
  const response = await client.get<ApiResponse<RecurringRule[]>>('/recurring');
  return unwrap(response.data);
};

export const createRecurringRule = async (
  payload: RecurringCreatePayload,
): Promise<RecurringRule> => {
  const response = await client.post<ApiResponse<RecurringRule>>(
    '/recurring',
    payload,
  );
  return unwrap(response.data);
};

/** 局部更新；freq / start_date / enabled 变化时后端会重算 next_run_date。 */
export const updateRecurringRule = async (
  ruleId: number,
  payload: RecurringUpdatePayload,
): Promise<RecurringRule> => {
  const response = await client.patch<ApiResponse<RecurringRule>>(
    `/recurring/${ruleId}`,
    payload,
  );
  return unwrap(response.data);
};

/** DELETE /recurring/{id}：只停止未来生成，已生成的账单保留（关联置空）。 */
export const deleteRecurringRule = async (ruleId: number): Promise<void> => {
  const response = await client.delete<ApiResponse<null>>(
    `/recurring/${ruleId}`,
  );
  unwrap(response.data);
};
