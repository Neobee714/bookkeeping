import axios from 'axios';
import { useCallback, useEffect, useState } from 'react';

import { getAdminUsers } from '@/api/users';
import UserAvatar from '@/components/UserAvatar';
import type { AdminUser } from '@/types';
import { relativeTime } from '@/utils/timeUtils';

const getErrorMessage = (error: unknown, fallback: string): string => {
  if (axios.isAxiosError(error)) {
    return error.response?.data?.message ?? fallback;
  }
  if (error instanceof Error) {
    return error.message;
  }
  return fallback;
};

function AdminUsersPage() {
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState('');
  const [noticeMessage, setNoticeMessage] = useState('');

  const loadUsers = useCallback(async () => {
    setLoading(true);
    setErrorMessage('');
    try {
      const data = await getAdminUsers();
      setUsers(data);
    } catch (error) {
      setErrorMessage(getErrorMessage(error, '用户列表加载失败'));
      setUsers([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadUsers();
  }, [loadUsers]);

  return (
    <section className="space-y-4 pb-20">
      {noticeMessage && (
        <div className="flex items-start justify-between gap-3 rounded-[16px] border border-[#E5DFD5] bg-[#FBF7F0] px-4 py-3 text-sm text-[#5A7A6E]">
          <span>{noticeMessage}</span>
          <button type="button" onClick={() => setNoticeMessage('')} className="text-xs text-[#6B6560]">
            关闭
          </button>
        </div>
      )}

      {errorMessage ? (
        <div className="rounded-[18px] border border-[#F2D8D1] bg-white px-4 py-5 text-center">
          <p className="text-sm text-[#C27B6B]">{errorMessage}</p>
          <button
            type="button"
            onClick={() => {
              void loadUsers();
            }}
            className="mt-3 rounded-[12px] border border-[#E5DFD5] px-4 py-2 text-sm text-[#5A7A6E]"
          >
            重试
          </button>
        </div>
      ) : loading ? (
        <div className="space-y-3">
          {Array.from({ length: 4 }).map((_, index) => (
            <div key={index} className="animate-pulse rounded-[18px] border border-[#E8F0EC] bg-white px-4 py-4">
              <div className="h-4 w-24 rounded bg-[#F0EBE2]" />
              <div className="mt-3 h-3 w-36 rounded bg-[#F0EBE2]" />
            </div>
          ))}
        </div>
      ) : (
        <div className="space-y-3">
          {users.map((user) => (
            <article
              key={user.id}
              className="rounded-[18px] border border-[#F0EBE2] bg-white px-4 py-4 shadow-[0_10px_24px_rgba(45,40,36,0.06)]"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex min-w-0 gap-3">
                  <UserAvatar
                    avatar={user.avatar}
                    name={user.nickname}
                    sizeClassName="h-12 w-12"
                    textClassName="text-base"
                    className="shrink-0"
                  />
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-[#2D2824]">{user.nickname}</p>
                    <p className="mt-1 text-xs text-[#6B6560]">@{user.username}</p>
                    <p className="mt-2 text-xs text-[#9B9590]">注册于 {relativeTime(user.created_at)}</p>
                  </div>
                </div>
              </div>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}

export default AdminUsersPage;
