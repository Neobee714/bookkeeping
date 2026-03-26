import { create } from 'zustand';

import type { User } from '@/types';

const ACCESS_TOKEN_KEY = 'access_token';
const REFRESH_TOKEN_KEY = 'refresh_token';
const USER_KEY = 'auth_user';

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

const readStoredUser = (): User | null => {
  const rawUser = readStorage(USER_KEY);
  if (!rawUser) {
    return null;
  }

  try {
    return JSON.parse(rawUser) as User;
  } catch {
    removeStorage(USER_KEY);
    return null;
  }
};

const writeStoredUser = (user: User | null): void => {
  if (!isBrowser) {
    return;
  }

  if (user) {
    window.localStorage.setItem(USER_KEY, JSON.stringify(user));
  } else {
    removeStorage(USER_KEY);
  }
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
  user: readStoredUser(),
  accessToken: getStoredAccessToken(),
  login: ({ accessToken, refreshToken, user = null }) => {
    writeStorage(ACCESS_TOKEN_KEY, accessToken);
    writeStorage(REFRESH_TOKEN_KEY, refreshToken);
    writeStoredUser(user);
    set({ accessToken, user });
  },
  logout: () => {
    removeStorage(ACCESS_TOKEN_KEY);
    removeStorage(REFRESH_TOKEN_KEY);
    removeStorage(USER_KEY);
    set({ accessToken: null, user: null });
  },
  updateUser: (user) => {
    writeStoredUser(user);
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
