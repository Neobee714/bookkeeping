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
    <section className="space-y-3 pb-20">
      {noticeMessage && (
        <div className="ios-glass flex items-start justify-between gap-3 px-4 py-3 text-sm text-[#1C1C1E]">
          <span>{noticeMessage}</span>
          <button type="button" onClick={() => setNoticeMessage('')} className="text-xs text-[#8E8E93]">
            关闭
          </button>
        </div>
      )}

      {errorMessage ? (
        <div className="ios-glass px-4 py-5 text-center">
          <p className="text-sm text-[#FF3B30]">{errorMessage}</p>
          <button
            type="button"
            onClick={() => {
              void loadUsers();
            }}
            className="mt-3 rounded-[10px] bg-[rgba(0,122,255,0.1)] px-4 py-2 text-sm font-medium text-[#007AFF]"
          >
            重试
          </button>
        </div>
      ) : loading ? (
        <div className="space-y-3">
          {Array.from({ length: 4 }).map((_, index) => (
            <div key={index} className="ios-glass h-20 animate-pulse" />
          ))}
        </div>
      ) : (
        <div className="ios-glass px-4">
          {users.map((user, index) => (
            <article
              key={user.id}
              className={`flex items-start gap-3 py-3.5 ${
                index === users.length - 1
                  ? ''
                  : 'border-b border-[rgba(60,60,67,0.08)]'
              }`}
            >
              <UserAvatar
                avatar={user.avatar}
                name={user.nickname}
                sizeClassName="h-12 w-12"
                textClassName="text-base"
                className="shrink-0"
              />
              <div className="min-w-0">
                <p className="truncate text-[15px] font-semibold text-[#1C1C1E]">{user.nickname}</p>
                <p className="mt-0.5 text-xs text-[#8E8E93]">@{user.username}</p>
                <p className="mt-1 text-xs text-[#A0A0A5]">注册于 {relativeTime(user.created_at)}</p>
              </div>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}

export default AdminUsersPage;
