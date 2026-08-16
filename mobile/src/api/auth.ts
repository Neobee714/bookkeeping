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

export const updateProfile = async (nickname: string): Promise<User> => {
  const response = await client.put<ApiResponse<User>>('/auth/profile', {
    nickname,
  });
  return unwrap(response.data);
};

export const updateAvatar = async (avatar: string): Promise<User> => {
  const response = await client.post<ApiResponse<User>>('/auth/avatar', {
    avatar,
  });
  return unwrap(response.data);
};
