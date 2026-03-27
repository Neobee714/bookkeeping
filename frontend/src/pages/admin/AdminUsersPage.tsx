import axios from 'axios';
import { useCallback, useEffect, useState } from 'react';

import { getAdminUsers, removeCircleMember } from '@/api/circles';
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
  const [processingUserId, setProcessingUserId] = useState<number | null>(null);

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

  const handleRemove = async (user: AdminUser) => {
    if (!user.joined_circle) {
      return;
    }

    const confirmed = window.confirm(
      `确定将 ${user.nickname} 移出「${user.joined_circle.name}」吗？`,
    );
    if (!confirmed) {
      return;
    }

    setProcessingUserId(user.id);
    try {
      await removeCircleMember(user.joined_circle.id, user.id);
      setUsers((current) =>
        current.map((item) =>
          item.id === user.id
            ? {
                ...item,
                joined_circle: null,
              }
            : item,
        ),
      );
      setNoticeMessage('已移出圈子');
    } catch (error) {
      setNoticeMessage(getErrorMessage(error, '移出圈子失败'));
    } finally {
      setProcessingUserId(null);
    }
  };

  return (
    <section className="space-y-4 pb-20">
      {noticeMessage && (
        <div className="flex items-start justify-between gap-3 rounded-[16px] border border-[#E9E6FA] bg-[#F8F7FE] px-4 py-3 text-sm text-[#534AB7]">
          <span>{noticeMessage}</span>
          <button type="button" onClick={() => setNoticeMessage('')} className="text-xs text-[#8A8799]">
            关闭
          </button>
        </div>
      )}

      {errorMessage ? (
        <div className="rounded-[18px] border border-[#F3D6D6] bg-white px-4 py-5 text-center">
          <p className="text-sm text-[#D75A5A]">{errorMessage}</p>
          <button
            type="button"
            onClick={() => {
              void loadUsers();
            }}
            className="mt-3 rounded-[12px] border border-[#E7E5F2] px-4 py-2 text-sm text-[#534AB7]"
          >
            重试
          </button>
        </div>
      ) : loading ? (
        <div className="space-y-3">
          {Array.from({ length: 4 }).map((_, index) => (
            <div key={index} className="animate-pulse rounded-[18px] border border-[#EEEDFE] bg-white px-4 py-4">
              <div className="h-4 w-24 rounded bg-[#ECEAF8]" />
              <div className="mt-3 h-3 w-36 rounded bg-[#F1EFFA]" />
            </div>
          ))}
        </div>
      ) : (
        <div className="space-y-3">
          {users.map((user) => (
            <article
              key={user.id}
              className="rounded-[18px] border border-[#ECEAF8] bg-white px-4 py-4 shadow-[0_10px_24px_rgba(45,41,64,0.06)]"
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
                    <p className="truncate text-sm font-semibold text-[#2D2940]">{user.nickname}</p>
                    <p className="mt-1 text-xs text-[#8A8799]">@{user.username}</p>
                    <p className="mt-2 text-xs text-[#9A97A8]">注册于 {relativeTime(user.created_at)}</p>
                    <div className="mt-3">
                      {user.joined_circle ? (
                        <span className="inline-flex rounded-full bg-[#EEEDFE] px-3 py-1 text-xs text-[#534AB7]">
                          {user.joined_circle.name}
                        </span>
                      ) : (
                        <span className="text-xs text-[#9A97A8]">未加入圈子</span>
                      )}
                    </div>
                  </div>
                </div>

                {user.joined_circle && !user.is_admin && (
                  <button
                    type="button"
                    disabled={processingUserId === user.id}
                    onClick={() => {
                      void handleRemove(user);
                    }}
                    className="shrink-0 rounded-[10px] border border-[#F3D6D6] px-3 py-2 text-xs text-[#D75A5A] disabled:opacity-60"
                  >
                    {processingUserId === user.id ? '处理中...' : '移出圈子'}
                  </button>
                )}
              </div>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}

export default AdminUsersPage;
