import type { AdminUser, ApiResponse } from '../types';
import client, { unwrap } from './client';

/** 管理后台:用户列表(圈子功能下线后,仅返回用户基础信息)。 */
export const getAdminUsers = async (): Promise<AdminUser[]> => {
  const response = await client.get<ApiResponse<AdminUser[]>>('/api/v1/users');
  return unwrap(response.data);
};
