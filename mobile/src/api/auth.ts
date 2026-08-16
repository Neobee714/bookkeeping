import type {
  ApiResponse,
  AuthTokenData,
  RegisterPayload,
  RegisterResult,
  User,
} from '../types';
import client, { unwrap } from './client';

export const login = async (
  username: string,
  password: string,
): Promise<AuthTokenData> => {
  const response = await client.post<ApiResponse<AuthTokenData>>('/auth/login', {
    username,
    password,
  });
  return unwrap(response.data);
};

export const register = async (
  payload: RegisterPayload,
): Promise<RegisterResult> => {
  const response = await client.post<ApiResponse<RegisterResult>>(
    '/auth/register',
    payload,
  );
  return unwrap(response.data);
};

export const fetchMe = async (): Promise<User> => {
  const response = await client.get<ApiResponse<User>>('/auth/me');
  return unwrap(response.data);
};

export const bindPartner = async (partnerCode: string): Promise<User> => {
  const response = await client.post<ApiResponse<User>>('/auth/bind-partner', {
    partner_code: partnerCode,
  });
  return unwrap(response.data);
};

/** 更新资料:username / nickname 均可选,传哪个改哪个(后端校验用户名唯一)。 */
export const updateProfile = async (payload: {
  username?: string;
  nickname?: string;
}): Promise<User> => {
  const response = await client.put<ApiResponse<User>>('/auth/profile', payload);
  return unwrap(response.data);
};

/** 修改密码:需验证旧密码,旧密码错误由后端返回「旧密码错误」。 */
export const changePassword = async (
  oldPassword: string,
  newPassword: string,
): Promise<User> => {
  const response = await client.put<ApiResponse<User>>('/auth/password', {
    old_password: oldPassword,
    new_password: newPassword,
  });
  return unwrap(response.data);
};

export const updateAvatar = async (avatar: string): Promise<User> => {
  const response = await client.post<ApiResponse<User>>('/auth/avatar', {
    avatar,
  });
  return unwrap(response.data);
};
