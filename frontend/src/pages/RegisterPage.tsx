import axios from 'axios';
import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';

import client from '@/api/client';
import type { ApiResponse } from '@/types';

interface RegisterResponseData {
  user: {
    id: number;
  };
}

function RegisterPage() {
  const navigate = useNavigate();

  const [username, setUsername] = useState('');
  const [nickname, setNickname] = useState('');
  const [password, setPassword] = useState('');
  const [inviteCode, setInviteCode] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [successMessage, setSuccessMessage] = useState('');

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (submitting) {
      return;
    }

    setSubmitting(true);
    setErrorMessage('');
    setSuccessMessage('');

    try {
      const response = await client.post<ApiResponse<RegisterResponseData>>(
        '/auth/register',
        {
          username,
          nickname,
          password,
          invite_code: inviteCode.trim() || undefined,
        },
      );

      if (!response.data.success) {
        throw new Error(response.data.message || '注册失败');
      }

      setSuccessMessage('注册成功，请登录');
      setTimeout(() => {
        navigate('/login', { replace: true });
      }, 500);
    } catch (error) {
      if (axios.isAxiosError<ApiResponse<unknown>>(error)) {
        setErrorMessage(error.response?.data?.message ?? '注册失败，请重试');
      } else if (error instanceof Error) {
        setErrorMessage(error.message);
      } else {
        setErrorMessage('注册失败，请重试');
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="mx-auto flex min-h-screen w-full max-w-[430px] flex-col justify-center px-6">
      <div className="rounded-2xl border border-[#E8E6F8] bg-white p-6">
        <h1 className="text-2xl font-semibold text-[#534AB7]">创建账号</h1>
        <p className="mt-2 text-sm text-[#8A8799]">昵称默认可用「我」和「洗衣粉儿」</p>

        <form className="mt-6 space-y-4" onSubmit={handleSubmit}>
          <label className="block">
            <span className="mb-1 block text-sm text-[#5A5668]">用户名</span>
            <input
              type="text"
              value={username}
              onChange={(event) => setUsername(event.target.value)}
              required
              className="h-11 w-full rounded-[10px] border border-[#E2E1EC] px-3 text-sm outline-none focus:border-[#534AB7]"
              placeholder="请输入用户名"
            />
          </label>

          <label className="block">
            <span className="mb-1 block text-sm text-[#5A5668]">昵称</span>
            <input
              type="text"
              value={nickname}
              onChange={(event) => setNickname(event.target.value)}
              required
              className="h-11 w-full rounded-[10px] border border-[#E2E1EC] px-3 text-sm outline-none focus:border-[#534AB7]"
              placeholder="请输入昵称"
            />
          </label>

          <label className="block">
            <span className="mb-1 block text-sm text-[#5A5668]">密码</span>
            <input
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              required
              className="h-11 w-full rounded-[10px] border border-[#E2E1EC] px-3 text-sm outline-none focus:border-[#534AB7]"
              placeholder="至少 6 位"
            />
          </label>

          <label className="block">
            <span className="mb-1 block text-sm text-[#5A5668]">伴侣邀请码（可选）</span>
            <input
              type="text"
              value={inviteCode}
              onChange={(event) => setInviteCode(event.target.value)}
              className="h-11 w-full rounded-[10px] border border-[#E2E1EC] px-3 text-sm outline-none focus:border-[#534AB7]"
              placeholder="输入后自动互绑"
            />
          </label>

          {errorMessage && (
            <p className="rounded-[10px] border border-[#F6D7D6] bg-[#FFF7F7] px-3 py-2 text-sm text-[#E24B4A]">
              {errorMessage}
            </p>
          )}

          {successMessage && (
            <p className="rounded-[10px] border border-[#D1F1E5] bg-[#F2FBF7] px-3 py-2 text-sm text-[#1D9E75]">
              {successMessage}
            </p>
          )}

          <button
            type="submit"
            disabled={submitting}
            className="h-11 w-full rounded-[10px] bg-[#534AB7] text-sm font-semibold text-white disabled:opacity-60"
          >
            {submitting ? '提交中...' : '注册'}
          </button>
        </form>

        <p className="mt-4 text-center text-sm text-[#787488]">
          已有账号？
          <Link to="/login" className="ml-1 font-medium text-[#534AB7]">
            去登录
          </Link>
        </p>
      </div>
    </div>
  );
}

export default RegisterPage;
