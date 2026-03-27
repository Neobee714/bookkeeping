import axios from 'axios';
import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';

import {
  createCircle,
  generateInviteCode,
  getAdminPendingCount,
  getAllCircles,
} from '@/api/circles';
import type { CircleOverview } from '@/types';

const getErrorMessage = (error: unknown, fallback: string): string => {
  if (axios.isAxiosError(error)) {
    return error.response?.data?.message ?? fallback;
  }
  if (error instanceof Error) {
    return error.message;
  }
  return fallback;
};

function CreateCircleSheet({
  open,
  submitting,
  errorMessage,
  name,
  description,
  onClose,
  onNameChange,
  onDescriptionChange,
  onSubmit,
}: {
  open: boolean;
  submitting: boolean;
  errorMessage: string;
  name: string;
  description: string;
  onClose: () => void;
  onNameChange: (value: string) => void;
  onDescriptionChange: (value: string) => void;
  onSubmit: () => void;
}) {
  if (!open) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-30 flex items-end justify-center bg-black/35">
      <button type="button" className="absolute inset-0 cursor-default" onClick={onClose} />
      <section className="relative w-full max-w-[430px] rounded-t-[28px] bg-white px-4 pb-6 pt-4 shadow-[0_-10px_30px_rgba(45,41,64,0.12)]">
        <div className="mx-auto h-1.5 w-10 rounded-full bg-[#D8D5E7]" />
        <div className="mt-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-[#2D2940]">新建圈子</h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-[10px] border border-[#E7E5F2] px-3 py-1 text-xs text-[#8A8799]"
          >
            取消
          </button>
        </div>

        <label className="mt-4 block">
          <span className="mb-2 block text-xs text-[#8A8799]">圈子名称</span>
          <input
            type="text"
            maxLength={30}
            value={name}
            onChange={(event) => onNameChange(event.target.value)}
            className="h-12 w-full rounded-[14px] border border-[#E7E5F2] px-3 text-sm text-[#2D2940] outline-none focus:border-[#534AB7]"
          />
        </label>

        <label className="mt-4 block">
          <span className="mb-2 block text-xs text-[#8A8799]">圈子描述</span>
          <textarea
            rows={4}
            maxLength={100}
            value={description}
            onChange={(event) => onDescriptionChange(event.target.value)}
            className="w-full resize-none rounded-[14px] border border-[#E7E5F2] px-3 py-3 text-sm leading-6 text-[#2D2940] outline-none focus:border-[#534AB7]"
          />
        </label>

        {errorMessage && (
          <div className="mt-4 rounded-[14px] border border-[#F3D6D6] bg-[#FFF7F7] px-3 py-3 text-xs text-[#D75A5A]">
            {errorMessage}
          </div>
        )}

        <button
          type="button"
          disabled={submitting}
          onClick={onSubmit}
          className="mt-4 h-12 w-full rounded-[14px] bg-[#534AB7] text-sm font-semibold text-white disabled:opacity-60"
        >
          {submitting ? '创建中...' : '创建'}
        </button>
      </section>
    </div>
  );
}

function InviteSheet({
  open,
  circleName,
  code,
  onClose,
  onCopy,
}: {
  open: boolean;
  circleName: string;
  code: string;
  onClose: () => void;
  onCopy: () => void;
}) {
  if (!open) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-30 flex items-end justify-center bg-black/35">
      <button type="button" className="absolute inset-0 cursor-default" onClick={onClose} />
      <section className="relative w-full max-w-[430px] rounded-t-[28px] bg-white px-4 pb-6 pt-4 shadow-[0_-10px_30px_rgba(45,41,64,0.12)]">
        <div className="mx-auto h-1.5 w-10 rounded-full bg-[#D8D5E7]" />
        <div className="mt-4 text-center">
          <p className="text-xs text-[#8A8799]">{circleName}</p>
          <h2 className="mt-2 text-lg font-semibold text-[#2D2940]">邀请码</h2>
          <p className="mt-4 text-2xl font-semibold tracking-[0.2em] text-[#534AB7]">{code}</p>
          <p className="mt-3 text-xs leading-6 text-[#8A8799]">
            将此码发给对方，在圈子页输入即可加入
          </p>
        </div>
        <button
          type="button"
          onClick={onCopy}
          className="mt-5 h-12 w-full rounded-[14px] bg-[#534AB7] text-sm font-semibold text-white"
        >
          复制邀请码
        </button>
        <button
          type="button"
          onClick={onClose}
          className="mt-3 h-11 w-full rounded-[14px] border border-[#E7E5F2] text-sm text-[#8A8799]"
        >
          关闭
        </button>
      </section>
    </div>
  );
}

function AdminCirclesPage() {
  const navigate = useNavigate();
  const [circles, setCircles] = useState<CircleOverview[]>([]);
  const [pendingCount, setPendingCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState('');
  const [noticeMessage, setNoticeMessage] = useState('');
  const [inviteLoadingId, setInviteLoadingId] = useState<number | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState('');
  const [circleName, setCircleName] = useState('');
  const [circleDescription, setCircleDescription] = useState('');
  const [inviteOpen, setInviteOpen] = useState(false);
  const [inviteCircleName, setInviteCircleName] = useState('');
  const [inviteCode, setInviteCode] = useState('');

  const loadData = useCallback(async () => {
    setLoading(true);
    setErrorMessage('');
    try {
      const [items, pending] = await Promise.all([getAllCircles(), getAdminPendingCount()]);
      setCircles(items);
      setPendingCount(pending);
    } catch (error) {
      setErrorMessage(getErrorMessage(error, '圈子管理数据加载失败'));
      setCircles([]);
      setPendingCount(0);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const handleCreateCircle = async () => {
    const name = circleName.trim();
    const description = circleDescription.trim();
    if (!name) {
      setCreateError('圈子名称不能为空');
      return;
    }

    setCreating(true);
    setCreateError('');
    try {
      await createCircle(name, description || undefined);
      setCircleName('');
      setCircleDescription('');
      setCreateOpen(false);
      setNoticeMessage('圈子已创建');
      await loadData();
    } catch (error) {
      setCreateError(getErrorMessage(error, '创建圈子失败'));
    } finally {
      setCreating(false);
    }
  };

  const handleGenerateInvite = async (circle: CircleOverview) => {
    setInviteLoadingId(circle.id);
    try {
      const data = await generateInviteCode(circle.id);
      setInviteCircleName(circle.name);
      setInviteCode(data.code);
      setInviteOpen(true);
    } catch (error) {
      setNoticeMessage(getErrorMessage(error, '邀请码生成失败'));
    } finally {
      setInviteLoadingId(null);
    }
  };

  const handleCopyInvite = async () => {
    if (!inviteCode) {
      return;
    }
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(inviteCode);
        setNoticeMessage(`邀请码已复制：${inviteCode}`);
      } else {
        setNoticeMessage(`邀请码：${inviteCode}`);
      }
    } catch {
      setNoticeMessage(`邀请码：${inviteCode}`);
    }
  };

  return (
    <>
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
                void loadData();
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
                <div className="h-4 w-28 rounded bg-[#ECEAF8]" />
                <div className="mt-3 h-3 w-40 rounded bg-[#F1EFFA]" />
              </div>
            ))}
          </div>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-[20px] bg-[#FFF3E4] px-4 py-4">
                <p className="text-xs text-[#BA7517]">待审批</p>
                <p className="mt-2 text-2xl font-semibold text-[#A86C19]">{pendingCount}</p>
              </div>
              <div className="rounded-[20px] bg-[#EEEDFE] px-4 py-4">
                <p className="text-xs text-[#534AB7]">已创建圈子数</p>
                <p className="mt-2 text-2xl font-semibold text-[#534AB7]">{circles.length}</p>
              </div>
            </div>

            <button
              type="button"
              onClick={() => navigate('/admin/applications')}
              className="h-12 w-full rounded-[16px] bg-[#534AB7] text-sm font-semibold text-white"
            >
              查看申请
            </button>

            <div className="space-y-3">
              {circles.map((circle) => (
                <article
                  key={circle.id}
                  className="rounded-[18px] border border-[#ECEAF8] bg-white px-4 py-4 shadow-[0_10px_24px_rgba(45,41,64,0.06)]"
                >
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-base font-semibold text-[#2D2940]">{circle.name}</p>
                      {circle.description && (
                        <p className="mt-1 line-clamp-2 text-sm leading-6 text-[#8A8799]">
                          {circle.description}
                        </p>
                      )}
                      <p className="mt-2 text-xs text-[#8A8799]">{circle.member_count} 位成员</p>
                    </div>
                    <button
                      type="button"
                      disabled={inviteLoadingId === circle.id}
                      onClick={() => {
                        void handleGenerateInvite(circle);
                      }}
                      className="rounded-[12px] bg-[#EEEDFE] px-4 py-2 text-sm font-medium text-[#534AB7] disabled:opacity-60"
                    >
                      {inviteLoadingId === circle.id ? '生成中...' : '生成邀请码'}
                    </button>
                  </div>
                </article>
              ))}
            </div>

            <button
              type="button"
              onClick={() => setCreateOpen(true)}
              className="h-12 w-full rounded-[16px] bg-[#534AB7] text-sm font-semibold text-white"
            >
              + 新建圈子
            </button>
          </>
        )}
      </section>

      <CreateCircleSheet
        open={createOpen}
        submitting={creating}
        errorMessage={createError}
        name={circleName}
        description={circleDescription}
        onClose={() => setCreateOpen(false)}
        onNameChange={setCircleName}
        onDescriptionChange={setCircleDescription}
        onSubmit={handleCreateCircle}
      />

      <InviteSheet
        open={inviteOpen}
        circleName={inviteCircleName}
        code={inviteCode}
        onClose={() => setInviteOpen(false)}
        onCopy={() => {
          void handleCopyInvite();
        }}
      />
    </>
  );
}

export default AdminCirclesPage;
