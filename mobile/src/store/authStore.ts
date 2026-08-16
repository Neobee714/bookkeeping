import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Keychain from 'react-native-keychain';
import { create } from 'zustand';

import type { User } from '../types';

/**
 * 登录态管理。
 *
 * 持久化策略:
 * - accessToken / refreshToken → react-native-keychain(系统安全存储,不落明文)
 * - user → AsyncStorage(非敏感资料缓存)
 *
 * 启动时调用 restoreSession() 从安全存储恢复会话,实现自动登录。
 */

const ACCESS_TOKEN_SERVICE = 'bookkeeping.access_token';
const REFRESH_TOKEN_SERVICE = 'bookkeeping.refresh_token';
const USER_KEY = 'bookkeeping.auth_user';

const readFromKeychain = async (service: string): Promise<string | null> => {
  try {
    const credentials = await Keychain.getGenericPassword({ service });
    return credentials ? credentials.password : null;
  } catch {
    return null;
  }
};

const writeToKeychain = async (service: string, value: string): Promise<void> => {
  try {
    await Keychain.setGenericPassword('token', value, { service });
  } catch {
    // 写入失败时仅保留内存态:本次运行可用,下次启动需重新登录
  }
};

const removeFromKeychain = async (service: string): Promise<void> => {
  try {
    await Keychain.resetGenericPassword({ service });
  } catch {
    // 忽略清除失败
  }
};

const readStoredUser = async (): Promise<User | null> => {
  try {
    const raw = await AsyncStorage.getItem(USER_KEY);
    return raw ? (JSON.parse(raw) as User) : null;
  } catch {
    return null;
  }
};

interface LoginPayload {
  accessToken: string;
  refreshToken: string;
  user: User;
}

interface AuthState {
  user: User | null;
  accessToken: string | null;
  refreshToken: string | null;
  /** 会话是否已从本地存储恢复(自动登录完成)。 */
  hydrated: boolean;
  restoreSession: () => Promise<void>;
  login: (payload: LoginPayload) => Promise<void>;
  logout: () => Promise<void>;
  updateUser: (user: User | null) => Promise<void>;
  setTokens: (accessToken: string, refreshToken?: string) => Promise<void>;
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  accessToken: null,
  refreshToken: null,
  hydrated: false,

  restoreSession: async () => {
    const [accessToken, refreshToken, user] = await Promise.all([
      readFromKeychain(ACCESS_TOKEN_SERVICE),
      readFromKeychain(REFRESH_TOKEN_SERVICE),
      readStoredUser(),
    ]);
    set({ accessToken, refreshToken, user, hydrated: true });
  },

  login: async ({ accessToken, refreshToken, user }) => {
    await Promise.all([
      writeToKeychain(ACCESS_TOKEN_SERVICE, accessToken),
      writeToKeychain(REFRESH_TOKEN_SERVICE, refreshToken),
      AsyncStorage.setItem(USER_KEY, JSON.stringify(user)).catch(() => {}),
    ]);
    set({ accessToken, refreshToken, user });
  },

  logout: async () => {
    await Promise.all([
      removeFromKeychain(ACCESS_TOKEN_SERVICE),
      removeFromKeychain(REFRESH_TOKEN_SERVICE),
      AsyncStorage.removeItem(USER_KEY).catch(() => {}),
    ]);
    set({ accessToken: null, refreshToken: null, user: null });
  },

  updateUser: async (user) => {
    if (user) {
      await AsyncStorage.setItem(USER_KEY, JSON.stringify(user)).catch(() => {});
    } else {
      await AsyncStorage.removeItem(USER_KEY).catch(() => {});
    }
    set({ user });
  },

  setTokens: async (accessToken, refreshToken) => {
    await writeToKeychain(ACCESS_TOKEN_SERVICE, accessToken);
    set({ accessToken });
    if (refreshToken) {
      await writeToKeychain(REFRESH_TOKEN_SERVICE, refreshToken);
      set({ refreshToken });
    }
  },
}));
