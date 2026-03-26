import client from '@/api/client';
import type { ApiResponse, User } from '@/types';

const assertSuccess = <T>(response: ApiResponse<T>): T => {
  if (!response.success) {
    throw new Error(response.message || '请求失败');
  }
  return response.data;
};

export const fetchMe = async (): Promise<User> => {
  const response = await client.get<ApiResponse<User>>('/auth/me');
  return assertSuccess(response.data);
};

export const bindPartnerInvite = async (inviteCode: string): Promise<User> => {
  const response = await client.post<ApiResponse<User>>('/auth/bind-invite', {
    invite_code: inviteCode,
  });
  return assertSuccess(response.data);
};

export const updateProfile = async (nickname: string): Promise<User> => {
  const response = await client.put<ApiResponse<User>>('/auth/profile', {
    nickname,
  });
  return assertSuccess(response.data);
};

export const updateAvatar = async (avatar: string): Promise<User> => {
  const response = await client.post<ApiResponse<User>>('/auth/avatar', {
    avatar,
  });
  return assertSuccess(response.data);
};
