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
  const [registrationInviteCode, setRegistrationInviteCode] = useState('');
  const [partnerCode, setPartnerCode] = useState('');
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
          reg_invite_code: registrationInviteCode.trim(),
          partner_code: partnerCode.trim() || undefined,
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
      <div className="rounded-2xl border border-[#E5DFD5] bg-white p-6">
        <h1 className="text-2xl font-semibold text-[#5A7A6E]">创建账号</h1>
        <p className="mt-2 text-sm text-[#6B6560]">昵称默认可用「我」和「洗衣粉儿」</p>

        <form className="mt-6 space-y-4" onSubmit={handleSubmit}>
          <label className="block">
            <span className="mb-1 block text-sm text-[#5C5852]">用户名</span>
            <input
              type="text"
              value={username}
              onChange={(event) => setUsername(event.target.value)}
              required
              className="h-11 w-full rounded-[10px] border border-[#E5DFD5] px-3 text-sm outline-none focus:border-[#5A7A6E]"
              placeholder="请输入用户名"
            />
          </label>

          <label className="block">
            <span className="mb-1 block text-sm text-[#5C5852]">昵称</span>
            <input
              type="text"
              value={nickname}
              onChange={(event) => setNickname(event.target.value)}
              required
              className="h-11 w-full rounded-[10px] border border-[#E5DFD5] px-3 text-sm outline-none focus:border-[#5A7A6E]"
              placeholder="请输入昵称"
            />
          </label>

          <label className="block">
            <span className="mb-1 block text-sm text-[#5C5852]">密码</span>
            <input
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              required
              className="h-11 w-full rounded-[10px] border border-[#E5DFD5] px-3 text-sm outline-none focus:border-[#5A7A6E]"
              placeholder="至少 6 位"
            />
          </label>

          <label className="block">
            <span className="mb-1 block text-sm text-[#5C5852]">注册邀请码</span>
            <input
              type="text"
              value={registrationInviteCode}
              onChange={(event) => setRegistrationInviteCode(event.target.value)}
              required
              className="h-11 w-full rounded-[10px] border border-[#E5DFD5] px-3 text-sm uppercase outline-none focus:border-[#5A7A6E]"
              placeholder="请输入邀请码"
            />
          </label>

          <div className="border-t border-dashed border-[#E5DFD5] pt-4">
            <p className="text-xs font-medium text-[#6B6560]">伴侣绑定</p>
            <p className="mt-1 text-xs text-[#A09990]">可选，注册后也可以在「我的」页面再绑定</p>
          </div>

          <label className="block">
            <span className="mb-1 block text-sm text-[#5C5852]">伴侣绑定码（可选）</span>
            <input
              type="text"
              value={partnerCode}
              onChange={(event) => setPartnerCode(event.target.value)}
              className="h-11 w-full rounded-[10px] border border-[#E5DFD5] px-3 text-sm uppercase outline-none focus:border-[#5A7A6E]"
              placeholder="可选，稍后绑定"
            />
          </label>

          {errorMessage && (
            <p className="rounded-[10px] border border-[#F2D8D1] bg-[#FDF0EB] px-3 py-2 text-sm text-[#C27B6B]">
              {errorMessage}
            </p>
          )}

          {successMessage && (
            <p className="rounded-[10px] border border-[#C5D9CF] bg-[#D4E8DD] px-3 py-2 text-sm text-[#6B9E85]">
              {successMessage}
            </p>
          )}

          <button
            type="submit"
            disabled={submitting}
            className="h-11 w-full rounded-[10px] bg-[#5A7A6E] text-sm font-semibold text-white disabled:opacity-60"
          >
            {submitting ? '提交中...' : '注册'}
          </button>
        </form>

        <p className="mt-4 text-center text-sm text-[#7D7872]">
          已有账号？
          <Link to="/login" className="ml-1 font-medium text-[#5A7A6E]">
            去登录
          </Link>
        </p>
      </div>
    </div>
  );
}

export default RegisterPage;
