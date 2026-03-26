import { create } from 'zustand';

import type { User } from '@/types';

const ACCESS_TOKEN_KEY = 'access_token';
const REFRESH_TOKEN_KEY = 'refresh_token';

const isBrowser = typeof window !== 'undefined';

const readStorage = (key: string): string | null => {
  if (!isBrowser) {
    return null;
  }
  return window.localStorage.getItem(key);
};

const writeStorage = (key: string, value: string): void => {
  if (!isBrowser) {
    return;
  }
  window.localStorage.setItem(key, value);
};

const removeStorage = (key: string): void => {
  if (!isBrowser) {
    return;
  }
  window.localStorage.removeItem(key);
};

export const getStoredAccessToken = (): string | null => readStorage(ACCESS_TOKEN_KEY);
export const getStoredRefreshToken = (): string | null => readStorage(REFRESH_TOKEN_KEY);

interface LoginPayload {
  accessToken: string;
  refreshToken: string;
  user?: User | null;
}

interface AuthState {
  user: User | null;
  accessToken: string | null;
  login: (payload: LoginPayload) => void;
  logout: () => void;
  updateUser: (user: User | null) => void;
  setAccessToken: (token: string | null) => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  accessToken: getStoredAccessToken(),
  login: ({ accessToken, refreshToken, user = null }) => {
    writeStorage(ACCESS_TOKEN_KEY, accessToken);
    writeStorage(REFRESH_TOKEN_KEY, refreshToken);
    set({ accessToken, user });
  },
  logout: () => {
    removeStorage(ACCESS_TOKEN_KEY);
    removeStorage(REFRESH_TOKEN_KEY);
    set({ accessToken: null, user: null });
  },
  updateUser: (user) => {
    set({ user });
  },
  setAccessToken: (token) => {
    if (token) {
      writeStorage(ACCESS_TOKEN_KEY, token);
    } else {
      removeStorage(ACCESS_TOKEN_KEY);
    }
    set({ accessToken: token });
  },
}));
