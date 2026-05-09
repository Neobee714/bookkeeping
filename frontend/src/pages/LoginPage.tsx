import axios from 'axios';
import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';

import client from '@/api/client';
import { useAuthStore } from '@/store/authStore';
import type { ApiResponse, AuthTokenData } from '@/types';

function LoginPage() {
  const navigate = useNavigate();
  const login = useAuthStore((state) => state.login);

  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (submitting) {
      return;
    }

    setSubmitting(true);
    setErrorMessage('');

    try {
      const loginResponse = await client.post<ApiResponse<AuthTokenData>>('/auth/login', {
        username,
        password,
      });

      if (!loginResponse.data.success || !loginResponse.data.data) {
        throw new Error(loginResponse.data.message || '登录失败');
      }

      const { access_token, refresh_token, user } = loginResponse.data.data;
      if (!access_token || !refresh_token || !user) {
        throw new Error('登录返回的令牌信息不完整');
      }

      login({
        accessToken: access_token,
        refreshToken: refresh_token,
        user,
      });

      navigate(user.is_admin ? '/admin/users' : '/app/home', { replace: true });
    } catch (error) {
      if (axios.isAxiosError<ApiResponse<unknown>>(error)) {
        if (error.code === 'ECONNABORTED') {
          setErrorMessage('请求超时，后端可能正在冷启动，请稍后重试');
        } else if (!error.response) {
          setErrorMessage('无法连接后端服务，请稍后重试');
        } else {
          setErrorMessage(error.response.data?.message ?? '登录失败，请重试');
        }
      } else if (error instanceof Error) {
        setErrorMessage(error.message);
      } else {
        setErrorMessage('登录失败，请重试');
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="relative mx-auto flex min-h-screen w-full max-w-[430px] flex-col justify-center bg-[#F2F2F7] px-6">
      <div className="ios-bg-blobs">
        <div className="blob blob-1" />
        <div className="blob blob-2" />
        <div className="blob blob-3" />
        <div className="blob blob-4" />
      </div>

      <div className="ios-glass ios-glass-strong relative z-10 p-6">
        <h1 className="text-[28px] font-bold tracking-tight text-[#1C1C1E]">欢迎回来</h1>
        <p className="mt-2 text-sm text-[#8E8E93]">登录后进入双人记账</p>

        <form className="mt-6 space-y-4" onSubmit={handleSubmit}>
          <label className="block">
            <span className="mb-1 block text-xs text-[#8E8E93]">用户名</span>
            <input
              type="text"
              value={username}
              onChange={(event) => setUsername(event.target.value)}
              required
              className="h-11 w-full rounded-[10px] border border-[rgba(60,60,67,0.12)] bg-white/80 px-3 text-sm outline-none focus:border-[#007AFF]"
              placeholder="请输入用户名"
            />
          </label>

          <label className="block">
            <span className="mb-1 block text-xs text-[#8E8E93]">密码</span>
            <input
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              required
              className="h-11 w-full rounded-[10px] border border-[rgba(60,60,67,0.12)] bg-white/80 px-3 text-sm outline-none focus:border-[#007AFF]"
              placeholder="请输入密码"
            />
          </label>

          {errorMessage && (
            <p className="rounded-[10px] bg-[rgba(255,59,48,0.1)] px-3 py-2 text-sm text-[#FF3B30]">
              {errorMessage}
            </p>
          )}

          <button
            type="submit"
            disabled={submitting}
            className="h-12 w-full rounded-[12px] bg-[#007AFF] text-[15px] font-semibold text-white disabled:opacity-60"
          >
            {submitting ? '登录中...' : '登录'}
          </button>
        </form>

        <p className="mt-4 text-center text-sm text-[#8E8E93]">
          没有账号？
          <Link to="/register" className="ml-1 font-medium text-[#007AFF]">
            去注册
          </Link>
        </p>
      </div>
    </div>
  );
}

export default LoginPage;
