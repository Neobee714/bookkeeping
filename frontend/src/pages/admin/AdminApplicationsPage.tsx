import axios from 'axios';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';

import { getAdminPendingCount, getApplications, reviewApplication } from '@/api/circles';
import UserAvatar from '@/components/UserAvatar';
import { useCircleStore } from '@/store/circleStore';
import type { CircleApplication, CircleApplicationStatus } from '@/types';
import { relativeTime } from '@/utils/timeUtils';

type FilterTab = CircleApplicationStatus;
type ToastState = {
  type: 'success' | 'error';
  message: string;
} | null;

const tabs: Array<{ key: FilterTab; label: string }> = [
  { key: 'pending', label: '待审批' },
  { key: 'approved', label: '已通过' },
  { key: 'rejected', label: '已拒绝' },
];

const getErrorMessage = (error: unknown, fallback: string): string => {
  if (axios.isAxiosError(error)) {
    return error.response?.data?.message ?? fallback;
  }
  if (error instanceof Error) {
    return error.message;
  }
  return fallback;
};

function EmptyInboxIllustration() {
  return (
    <svg viewBox="0 0 80 80" className="h-20 w-20 text-[#C5C0E5]" fill="none">
      <rect x="16" y="22" width="48" height="36" rx="10" stroke="currentColor" strokeWidth="2" />
      <path
        d="M24 34h12l4 6h16l4-6h4"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path d="M28 50h24" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

function AdminApplicationsPage() {
  const navigate = useNavigate();
  const setPendingCount = useCircleStore((state) => state.setPendingCount);

  const [activeTab, setActiveTab] = useState<FilterTab>('pending');
  const [applications, setApplications] = useState<CircleApplication[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState('');
  const [processingId, setProcessingId] = useState<number | null>(null);
  const [toast, setToast] = useState<ToastState>(null);

  const titleCount = useMemo(() => {
    if (activeTab === 'pending') {
      return `${applications.length} 条待审批`;
    }
    return `${applications.length} 条记录`;
  }, [activeTab, applications.length]);

  const showToast = useCallback((type: 'success' | 'error', message: string) => {
    setToast({ type, message });
  }, []);

  const refreshPendingCount = useCallback(async () => {
    try {
      const count = await getAdminPendingCount();
      setPendingCount(count);
    } catch {
      setPendingCount(0);
    }
  }, [setPendingCount]);

  const loadApplications = useCallback(async () => {
    setLoading(true);
    setErrorMessage('');
    try {
      const data = await getApplications(activeTab);
      setApplications(data);
    } catch (error) {
      setErrorMessage(getErrorMessage(error, '申请列表加载失败'));
      setApplications([]);
    } finally {
      setLoading(false);
    }
  }, [activeTab]);

  useEffect(() => {
    void loadApplications();
  }, [loadApplications]);

  useEffect(() => {
    void refreshPendingCount();
  }, [refreshPendingCount]);

  useEffect(() => {
    if (!toast) {
      return;
    }
    const timer = window.setTimeout(() => setToast(null), 2000);
    return () => window.clearTimeout(timer);
  }, [toast]);

  const handleReview = async (applicationId: number, action: 'approve' | 'reject') => {
    setProcessingId(applicationId);
    try {
      await reviewApplication(applicationId, action);
      setApplications((current) => current.filter((item) => item.id !== applicationId));
      await refreshPendingCount();
      showToast('success', action === 'approve' ? '已通过申请' : '已拒绝申请');
    } catch (error) {
      showToast('error', getErrorMessage(error, '操作失败，请重试'));
    } finally {
      setProcessingId(null);
    }
  };

  return (
    <section className="space-y-4 pb-20">
      {toast && (
        <div className="fixed left-1/2 top-5 z-40 -translate-x-1/2 rounded-[10px] border border-[#E7E5F2] bg-white px-4 py-2 text-sm shadow-[0_10px_30px_rgba(45,41,64,0.12)]">
          <span className={toast.type === 'success' ? 'text-[#1D9E75]' : 'text-[#E24B4A]'}>
            {toast.message}
          </span>
        </div>
      )}

      <header className="space-y-4">
        <div className="flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={() => navigate('/admin/circles')}
            className="shrink-0 text-sm font-medium text-[#534AB7]"
          >
            ← 返回
          </button>

          <div className="min-w-0 flex-1 text-center">
            <h1 className="truncate text-lg font-semibold text-[#2D2940]">圈子创建申请</h1>
          </div>

          <span className="shrink-0 text-xs text-[#8A8799]">{titleCount}</span>
        </div>

        <div className="rounded-[12px] bg-[#F2F0FA] p-1">
          <div className="grid grid-cols-3 gap-1">
            {tabs.map((tab) => (
              <button
                key={tab.key}
                type="button"
                onClick={() => setActiveTab(tab.key)}
                className={`h-10 rounded-[10px] text-sm font-medium transition ${
                  activeTab === tab.key
                    ? 'bg-white text-[#534AB7] shadow-[0_4px_12px_rgba(83,74,183,0.12)]'
                    : 'text-[#8A8799]'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>
      </header>

      {errorMessage ? (
        <div className="rounded-[18px] border border-[#F3D6D6] bg-white px-4 py-5 text-center">
          <p className="text-sm text-[#D75A5A]">{errorMessage}</p>
          <button
            type="button"
            onClick={() => {
              void loadApplications();
            }}
            className="mt-3 rounded-[12px] border border-[#E7E5F2] px-4 py-2 text-sm text-[#534AB7]"
          >
            重试
          </button>
        </div>
      ) : loading ? (
        <div className="space-y-3">
          {Array.from({ length: 3 }).map((_, index) => (
            <div
              key={`application-skeleton-${index}`}
              className="animate-pulse rounded-[16px] border border-[#ECEAF8] bg-white px-4 py-4"
            >
              <div className="flex items-start gap-3">
                <div className="h-12 w-12 rounded-full bg-[#EEEDFE]" />
                <div className="flex-1 space-y-2">
                  <div className="h-4 w-32 rounded bg-[#ECEAF8]" />
                  <div className="h-3 w-40 rounded bg-[#F3F1FB]" />
                  <div className="h-3 w-20 rounded bg-[#F3F1FB]" />
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : applications.length === 0 ? (
        <div className="rounded-[24px] border border-dashed border-[#DDD9F3] bg-white px-5 py-10 text-center">
          {activeTab === 'pending' ? (
            <>
              <div className="flex justify-center">
                <EmptyInboxIllustration />
              </div>
              <p className="mt-4 text-lg font-semibold text-[#2D2940]">暂无待审批申请</p>
              <p className="mt-2 text-sm text-[#8A8799]">新的建圈申请会在这里出现。</p>
            </>
          ) : (
            <>
              <p className="text-lg font-semibold text-[#2D2940]">暂无记录</p>
              <p className="mt-2 text-sm text-[#8A8799]">当前筛选条件下还没有申请记录。</p>
            </>
          )}
        </div>
      ) : (
        <div className="space-y-3">
          {applications.map((application) => {
            const reviewText = application.reviewed_at ? relativeTime(application.reviewed_at) : '';

            return (
              <article
                key={application.id}
                className="rounded-[18px] border border-[#ECEAF8] bg-white px-4 py-4 shadow-[0_10px_24px_rgba(45,41,64,0.06)]"
              >
                <div className="flex items-start gap-3">
                  <UserAvatar
                    avatar={application.user.avatar}
                    name={application.user.nickname}
                    sizeClassName="h-12 w-12"
                    textClassName="text-base"
                    className="shrink-0"
                  />

                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <p className="truncate text-sm font-semibold text-[#2D2940]">
                        {application.user.nickname}
                      </p>
                      <span className="text-[11px] text-[#9A97A8]">
                        {relativeTime(application.created_at)}
                      </span>
                    </div>

                    <p className="mt-2 text-lg font-semibold text-[#534AB7]">
                      {application.circle_name}
                    </p>

                    {application.circle_description && (
                      <p className="mt-1 text-sm leading-6 text-[#6F6A7E]">
                        {application.circle_description}
                      </p>
                    )}

                    <p
                      className={`mt-3 text-[13px] leading-6 text-[#8A8799] ${
                        application.message ? '' : 'italic'
                      }`}
                    >
                      {application.message || '未填写申请理由'}
                    </p>
                  </div>

                  {activeTab === 'pending' ? (
                    <div className="flex shrink-0 flex-col gap-1.5">
                      <button
                        type="button"
                        disabled={processingId === application.id}
                        onClick={() => {
                          void handleReview(application.id, 'approve');
                        }}
                        className="flex h-8 min-w-[72px] items-center justify-center rounded-[8px] bg-[#1D9E75] px-3 text-[13px] text-white disabled:opacity-60"
                      >
                        {processingId === application.id ? '处理中...' : '通过'}
                      </button>
                      <button
                        type="button"
                        disabled={processingId === application.id}
                        onClick={() => {
                          void handleReview(application.id, 'reject');
                        }}
                        className="h-8 min-w-[72px] rounded-[8px] border border-[#E24B4A] bg-transparent px-3 text-[13px] text-[#E24B4A] disabled:opacity-60"
                      >
                        拒绝
                      </button>
                    </div>
                  ) : (
                    <div className="shrink-0 text-right">
                      <span
                        className={`inline-flex rounded-full px-3 py-1 text-xs font-medium ${
                          activeTab === 'approved'
                            ? 'bg-[#E1F5EE] text-[#1D9E75]'
                            : 'bg-[#FCEBEB] text-[#E24B4A]'
                        }`}
                      >
                        {activeTab === 'approved' ? '已通过' : '已拒绝'}
                      </span>
                      {activeTab === 'approved' && (
                        <p className="mt-2 text-[11px] font-medium text-[#1D9E75]">
                          已创建：{application.circle_name}
                        </p>
                      )}
                      {reviewText && <p className="mt-1 text-[11px] text-[#9A97A8]">{reviewText}</p>}
                    </div>
                  )}
                </div>
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}

export default AdminApplicationsPage;
