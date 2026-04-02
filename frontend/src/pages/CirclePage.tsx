import axios from 'axios';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';

import {
  addComment,
  applyCreateCircle,
  createCircle,
  createPost,
  deleteComment,
  deleteMyApplication,
  deletePost,
  generateInviteCode,
  getAdminPendingCount,
  getAllCircles,
  getCirclePosts,
  getInviteCode,
  getMyApplication,
  getMyCircles,
  getPostComments,
  joinCircle,
  leaveCircle,
  ratePost,
} from '@/api/circles';
import NewPostSheet from '@/components/NewPostSheet';
import PostCard from '@/components/PostCard';
import PostDetailSheet from '@/components/PostDetailSheet';
import { useAuthStore } from '@/store/authStore';
import { useCircleStore } from '@/store/circleStore';
import type {
  Circle,
  CircleApplication,
  CircleComment,
  CircleOverview,
  CirclePost,
} from '@/types';
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

const dedupePosts = (items: CirclePost[]): CirclePost[] => {
  const seen = new Set<number>();
  return items.filter((item) => {
    if (seen.has(item.id)) {
      return false;
    }
    seen.add(item.id);
    return true;
  });
};

function MenuButton({ expanded, onClick }: { expanded: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      aria-label="更多操作"
      aria-expanded={expanded}
      onClick={onClick}
      className="flex h-10 w-10 items-center justify-center rounded-[14px] border border-[#E7E5F2] bg-white text-[#534AB7]"
    >
      <svg
        viewBox="0 0 24 24"
        className="h-5 w-5"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      >
        <circle cx="5" cy="12" r="1.2" fill="currentColor" />
        <circle cx="12" cy="12" r="1.2" fill="currentColor" />
        <circle cx="19" cy="12" r="1.2" fill="currentColor" />
      </svg>
    </button>
  );
}

function StatusBadge({ status }: { status: 'pending' | 'approved' | 'rejected' }) {
  const className =
    status === 'pending'
      ? 'bg-[#FAEEDA] text-[#BA7517]'
      : status === 'approved'
        ? 'bg-[#E1F5EE] text-[#1D9E75]'
        : 'bg-[#FCEBEB] text-[#D75A5A]';
  const label = status === 'pending' ? '审核中' : status === 'approved' ? '已通过' : '已拒绝';

  return (
    <span className={`inline-flex rounded-full px-3 py-1 text-xs font-medium ${className}`}>
      {label}
    </span>
  );
}

function ApplicationCard({ application }: { application: CircleApplication }) {
  return (
    <article className="rounded-[20px] border border-[#E8E5FA] bg-white px-4 py-4 shadow-[0_10px_24px_rgba(45,41,64,0.06)]">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-xl font-semibold text-[#2D2940]">{application.circle_name}</p>
          {application.circle_description && (
            <p className="mt-2 text-sm leading-6 text-[#8A8799]">{application.circle_description}</p>
          )}
        </div>
        <StatusBadge status={application.status} />
      </div>

      <p className="mt-4 text-xs text-[#9A97A8]">申请时间：{relativeTime(application.created_at)}</p>

      {application.message && (
        <p className="mt-3 text-sm italic leading-6 text-[#8A8799]">{application.message}</p>
      )}
    </article>
  );
}

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
      <button
        type="button"
        className="absolute inset-0 cursor-default"
        aria-label="关闭创建圈子弹窗"
        onClick={onClose}
      />
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
            placeholder="比如：美食研究所"
            className="h-12 w-full rounded-[14px] border border-[#E7E5F2] px-3 text-sm text-[#2D2940] outline-none focus:border-[#534AB7]"
          />
        </label>

        <label className="mt-4 block">
          <span className="mb-2 block text-xs text-[#8A8799]">圈子简介</span>
          <textarea
            rows={4}
            maxLength={100}
            value={description}
            onChange={(event) => onDescriptionChange(event.target.value)}
            placeholder="写一点这个圈子是干什么的"
            className="w-full resize-none rounded-[14px] border border-[#E7E5F2] px-3 py-3 text-sm leading-6 text-[#2D2940] outline-none focus:border-[#534AB7]"
          />
          <span className="mt-2 block text-right text-xs text-[#9A97A8]">{description.length}/100</span>
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
          {submitting ? '创建中...' : '确认创建'}
        </button>
      </section>
    </div>
  );
}
function ApplyCircleSheet({
  open,
  submitting,
  errorMessage,
  circleName,
  circleDescription,
  message,
  onClose,
  onCircleNameChange,
  onCircleDescriptionChange,
  onMessageChange,
  onSubmit,
}: {
  open: boolean;
  submitting: boolean;
  errorMessage: string;
  circleName: string;
  circleDescription: string;
  message: string;
  onClose: () => void;
  onCircleNameChange: (value: string) => void;
  onCircleDescriptionChange: (value: string) => void;
  onMessageChange: (value: string) => void;
  onSubmit: () => void;
}) {
  if (!open) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-30 flex items-end justify-center bg-black/35">
      <button
        type="button"
        className="absolute inset-0 cursor-default"
        aria-label="关闭申请弹窗"
        onClick={onClose}
      />
      <section className="relative w-full max-w-[430px] rounded-t-[28px] bg-white px-4 pb-6 pt-4 shadow-[0_-10px_30px_rgba(45,41,64,0.12)]">
        <div className="mx-auto h-1.5 w-10 rounded-full bg-[#D8D5E7]" />
        <div className="mt-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-[#2D2940]">申请创建圈子</h2>
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
            value={circleName}
            onChange={(event) => onCircleNameChange(event.target.value)}
            placeholder="比如：美食圈"
            className="h-12 w-full rounded-[14px] border border-[#E7E5F2] px-3 text-sm text-[#2D2940] outline-none focus:border-[#534AB7]"
          />
        </label>

        <label className="mt-4 block">
          <span className="mb-2 block text-xs text-[#8A8799]">圈子描述</span>
          <textarea
            rows={3}
            maxLength={100}
            value={circleDescription}
            onChange={(event) => onCircleDescriptionChange(event.target.value)}
            placeholder="说说这个圈子想聊什么"
            className="w-full resize-none rounded-[14px] border border-[#E7E5F2] px-3 py-3 text-sm leading-6 text-[#2D2940] outline-none focus:border-[#534AB7]"
          />
          <span className="mt-2 block text-right text-xs text-[#9A97A8]">{circleDescription.length}/100</span>
        </label>

        <label className="mt-4 block">
          <span className="mb-2 block text-xs text-[#8A8799]">申请理由</span>
          <textarea
            rows={3}
            maxLength={100}
            value={message}
            onChange={(event) => onMessageChange(event.target.value)}
            placeholder="可选，写一点申请理由"
            className="w-full resize-none rounded-[14px] border border-[#E7E5F2] px-3 py-3 text-sm leading-6 text-[#2D2940] outline-none focus:border-[#534AB7]"
          />
          <span className="mt-2 block text-right text-xs text-[#9A97A8]">{message.length}/100</span>
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
          {submitting ? '提交中...' : '提交申请'}
        </button>
      </section>
    </div>
  );
}

function InviteSheet({
  open,
  circleName,
  code,
  copied,
  onClose,
  onCopy,
}: {
  open: boolean;
  circleName: string;
  code: string;
  copied: boolean;
  onClose: () => void;
  onCopy: () => void;
}) {
  if (!open) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-30 flex items-end justify-center bg-black/35">
      <button
        type="button"
        className="absolute inset-0 cursor-default"
        aria-label="关闭邀请码弹窗"
        onClick={onClose}
      />
      <section className="relative w-full max-w-[430px] rounded-t-[28px] bg-white px-4 pb-6 pt-4 shadow-[0_-10px_30px_rgba(45,41,64,0.12)]">
        <div className="mx-auto h-1.5 w-10 rounded-full bg-[#D8D5E7]" />
        <div className="mt-4 text-center">
          <p className="text-xs text-[#8A8799]">{circleName}</p>
          <h2 className="mt-2 text-lg font-semibold text-[#2D2940]">邀请码</h2>
          <p className="mt-4 text-[30px] font-semibold tracking-[0.2em] text-[#534AB7]">{code}</p>
          <p className="mt-3 text-xs leading-6 text-[#8A8799]">
            将此码发给对方，对方在圈子页输入即可加入
          </p>
        </div>

        <button
          type="button"
          onClick={onCopy}
          className="mt-5 h-12 w-full rounded-[14px] bg-[#534AB7] text-sm font-semibold text-white"
        >
          {copied ? '已复制 ✓' : '复制邀请码'}
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

function CirclePage() {
  const navigate = useNavigate();
  const user = useAuthStore((state) => state.user);
  const setPendingCount = useCircleStore((state) => state.setPendingCount);

  const menuRef = useRef<HTMLDivElement | null>(null);
  const loadMoreRef = useRef<HTMLDivElement | null>(null);
  const pagingRef = useRef(false);

  const [noticeMessage, setNoticeMessage] = useState('');
  const [menuOpen, setMenuOpen] = useState<'pending' | 'member' | null>(null);
  const [showApplicationProgress, setShowApplicationProgress] = useState(false);

  const [adminCircles, setAdminCircles] = useState<CircleOverview[]>([]);
  const [adminPending, setAdminPending] = useState(0);
  const [loadingAdmin, setLoadingAdmin] = useState(true);
  const [adminError, setAdminError] = useState('');
  const [inviteLoadingId, setInviteLoadingId] = useState<number | null>(null);

  const [userCircles, setUserCircles] = useState<Circle[]>([]);
  const [myApplication, setMyApplication] = useState<CircleApplication | null>(null);
  const [loadingUser, setLoadingUser] = useState(true);
  const [userError, setUserError] = useState('');
  const [activeCircleId, setActiveCircleId] = useState<number | null>(null);

  const [joinCode, setJoinCode] = useState('');
  const [joiningCircle, setJoiningCircle] = useState(false);

  const [createSheetOpen, setCreateSheetOpen] = useState(false);
  const [creatingCircle, setCreatingCircle] = useState(false);
  const [createCircleError, setCreateCircleError] = useState('');
  const [circleName, setCircleName] = useState('');
  const [circleDescription, setCircleDescription] = useState('');

  const [applySheetOpen, setApplySheetOpen] = useState(false);
  const [applyingCircle, setApplyingCircle] = useState(false);
  const [applyError, setApplyError] = useState('');
  const [applyCircleName, setApplyCircleName] = useState('');
  const [applyCircleDescription, setApplyCircleDescription] = useState('');
  const [applyMessage, setApplyMessage] = useState('');

  const [inviteSheetOpen, setInviteSheetOpen] = useState(false);
  const [inviteCircleName, setInviteCircleName] = useState('');
  const [inviteCode, setInviteCode] = useState('');
  const [inviteCopied, setInviteCopied] = useState(false);
  const [circleInviteCodes, setCircleInviteCodes] = useState<Record<number, string>>({});
  const [loadingInviteCode, setLoadingInviteCode] = useState(false);

  const [posts, setPosts] = useState<CirclePost[]>([]);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [loadingPosts, setLoadingPosts] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [postsError, setPostsError] = useState('');

  const [newPostOpen, setNewPostOpen] = useState(false);
  const [submittingPost, setSubmittingPost] = useState(false);
  const [ratingPostId, setRatingPostId] = useState<number | null>(null);
  const [deletingPostId, setDeletingPostId] = useState<number | null>(null);

  const [detailOpen, setDetailOpen] = useState(false);
  const [selectedPostId, setSelectedPostId] = useState<number | null>(null);
  const [comments, setComments] = useState<CircleComment[]>([]);
  const [loadingComments, setLoadingComments] = useState(false);
  const [submittingComment, setSubmittingComment] = useState(false);
  const [deletingCommentId, setDeletingCommentId] = useState<number | null>(null);

  const isAdmin = Boolean(user?.is_admin);
  const activeCircle = useMemo(
    () => userCircles.find((circle) => circle.id === activeCircleId) ?? null,
    [activeCircleId, userCircles],
  );
  const selectedPost = useMemo(
    () => posts.find((post) => post.id === selectedPostId) ?? null,
    [posts, selectedPostId],
  );

  const loadAdminState = useCallback(async () => {
    setLoadingAdmin(true);
    setAdminError('');
    try {
      const [circles, pending] = await Promise.all([getAllCircles(), getAdminPendingCount()]);
      setAdminCircles(circles);
      setAdminPending(pending);
      setPendingCount(pending);
    } catch (error) {
      setAdminError(getErrorMessage(error, '圈子管理数据加载失败'));
      setAdminCircles([]);
      setAdminPending(0);
      setPendingCount(0);
    } finally {
      setLoadingAdmin(false);
    }
  }, [setPendingCount]);

  const loadUserState = useCallback(async (nextActiveCircleId?: number) => {
    setLoadingUser(true);
    setUserError('');
    try {
      const [circles, application] = await Promise.all([getMyCircles(), getMyApplication()]);
      setUserCircles(circles);
      setMyApplication(application);
      setActiveCircleId((current) => {
        if (nextActiveCircleId && circles.some((circle) => circle.id === nextActiveCircleId)) {
          return nextActiveCircleId;
        }
        if (current && circles.some((circle) => circle.id === current)) {
          return current;
        }
        return circles[0]?.id ?? null;
      });
    } catch (error) {
      setUserError(getErrorMessage(error, '圈子数据加载失败'));
      setUserCircles([]);
      setMyApplication(null);
      setActiveCircleId(null);
    } finally {
      setLoadingUser(false);
    }
  }, []);
  const loadPosts = useCallback(
    async (circleId: number, nextPage: number, replace = false) => {
      if (!replace && pagingRef.current) {
        return;
      }

      if (replace) {
        setLoadingPosts(true);
        setPostsError('');
      } else {
        pagingRef.current = true;
        setLoadingMore(true);
      }

      try {
        const data = await getCirclePosts(circleId, nextPage);
        setPosts((current) => (replace ? data.items : dedupePosts([...current, ...data.items])));
        setPage(data.page);
        setHasMore(data.has_more);
      } catch (error) {
        const message = getErrorMessage(error, '帖子加载失败');
        if (replace) {
          setPosts([]);
          setPostsError(message);
        } else {
          setNoticeMessage(message);
        }
      } finally {
        if (replace) {
          setLoadingPosts(false);
        } else {
          pagingRef.current = false;
          setLoadingMore(false);
        }
      }
    },
    [],
  );

  useEffect(() => {
    if (isAdmin) {
      void loadAdminState();
      return;
    }

    setPendingCount(0);
    void loadUserState();
  }, [isAdmin, loadAdminState, loadUserState, setPendingCount]);

  useEffect(() => {
    if (isAdmin || userCircles.length === 0) {
      return;
    }

    const ownedCircles = userCircles.filter((circle) => circle.is_creator);
    if (ownedCircles.length === 0) {
      return;
    }

    let cancelled = false;
    setLoadingInviteCode(true);

    const loadInviteCodes = async () => {
      const codes: Record<number, string> = {};
      await Promise.all(
        ownedCircles.map(async (circle) => {
          try {
            const invite = await getInviteCode(circle.id);
            if (invite && !cancelled) {
              codes[circle.id] = invite.code;
            }
          } catch {
            // ignore errors for individual circles
          }
        }),
      );
      if (!cancelled) {
        setCircleInviteCodes((prev) => ({ ...prev, ...codes }));
        setLoadingInviteCode(false);
      }
    };

    void loadInviteCodes();
    return () => {
      cancelled = true;
    };
  }, [isAdmin, userCircles]);

  useEffect(() => {
    if (!menuOpen) {
      return;
    }

    const handleOutsideClick = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setMenuOpen(null);
      }
    };

    document.addEventListener('mousedown', handleOutsideClick);
    return () => document.removeEventListener('mousedown', handleOutsideClick);
  }, [menuOpen]);

  useEffect(() => {
    if (!inviteCopied) {
      return;
    }

    const timer = window.setTimeout(() => setInviteCopied(false), 2000);
    return () => window.clearTimeout(timer);
  }, [inviteCopied]);

  useEffect(() => {
    if (isAdmin || !activeCircleId) {
      setPosts([]);
      setPostsError('');
      setHasMore(false);
      return;
    }

    setPosts([]);
    setPage(1);
    setHasMore(false);
    void loadPosts(activeCircleId, 1, true);
  }, [activeCircleId, isAdmin, loadPosts]);

  useEffect(() => {
    if (!detailOpen || !selectedPostId) {
      return;
    }

    setLoadingComments(true);
    getPostComments(selectedPostId)
      .then((data) => {
        setComments(data);
      })
      .catch((error) => {
        setComments([]);
        setNoticeMessage(getErrorMessage(error, '评论加载失败'));
      })
      .finally(() => {
        setLoadingComments(false);
      });
  }, [detailOpen, selectedPostId]);

  useEffect(() => {
    if (selectedPostId && !selectedPost) {
      setDetailOpen(false);
      setSelectedPostId(null);
      setComments([]);
    }
  }, [selectedPost, selectedPostId]);

  useEffect(() => {
    if (isAdmin || !activeCircleId || !hasMore || loadingPosts || loadingMore) {
      return;
    }

    const node = loadMoreRef.current;
    if (!node) {
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) {
          void loadPosts(activeCircleId, page + 1, false);
        }
      },
      { rootMargin: '180px 0px' },
    );

    observer.observe(node);
    return () => observer.disconnect();
  }, [activeCircleId, hasMore, isAdmin, loadPosts, loadingMore, loadingPosts, page]);

  const handleCreateCircle = async () => {
    const name = circleName.trim();
    const description = circleDescription.trim();
    if (!name) {
      setCreateCircleError('圈子名称不能为空');
      return;
    }

    setCreatingCircle(true);
    setCreateCircleError('');
    try {
      await createCircle(name, description || undefined);
      setCircleName('');
      setCircleDescription('');
      setCreateSheetOpen(false);
      setNoticeMessage('圈子已创建');
      await loadAdminState();
    } catch (error) {
      setCreateCircleError(getErrorMessage(error, '创建圈子失败'));
    } finally {
      setCreatingCircle(false);
    }
  };

  const handleGenerateInvite = async (circle: { id: number; name: string }) => {
    setInviteLoadingId(circle.id);
    try {
      const data = await generateInviteCode(circle.id);
      setInviteCircleName(circle.name);
      setInviteCode(data.code);
      setInviteCopied(false);
      setInviteSheetOpen(true);
      setCircleInviteCodes((prev) => ({ ...prev, [circle.id]: data.code }));
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

    const fallbackCopy = () => {
      const input = document.createElement('textarea');
      input.value = inviteCode;
      input.setAttribute('readonly', 'true');
      input.style.position = 'fixed';
      input.style.opacity = '0';
      document.body.appendChild(input);
      input.select();
      input.setSelectionRange(0, input.value.length);
      const copied = document.execCommand('copy');
      document.body.removeChild(input);
      return copied;
    };

    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(inviteCode);
        setInviteCopied(true);
        return;
      }

      if (fallbackCopy()) {
        setInviteCopied(true);
        return;
      }
    } catch {
      if (fallbackCopy()) {
        setInviteCopied(true);
        return;
      }
    }

    setNoticeMessage(`邀请码：${inviteCode}`);
  };

  const handleJoinCircle = async () => {
    const code = joinCode.trim().toUpperCase();
    if (!code) {
      setNoticeMessage('请输入邀请码');
      return;
    }

    setJoiningCircle(true);
    try {
      const circle = await joinCircle(code);
      setJoinCode('');
      setNoticeMessage('加入成功');
      await loadUserState(circle.id);
    } catch (error) {
      setNoticeMessage(getErrorMessage(error, '加入圈子失败'));
    } finally {
      setJoiningCircle(false);
    }
  };

  const handleApplyCreate = async () => {
    const name = applyCircleName.trim();
    const description = applyCircleDescription.trim();
    const message = applyMessage.trim();
    if (!name) {
      setApplyError('圈子名称不能为空');
      return;
    }

    setApplyingCircle(true);
    setApplyError('');
    try {
      const application = await applyCreateCircle(name, description || undefined, message || undefined);
      setMyApplication(application);
      setApplySheetOpen(false);
      setNoticeMessage('申请已提交，等待管理员审批');
    } catch (error) {
      setApplyError(getErrorMessage(error, '申请提交失败'));
    } finally {
      setApplyingCircle(false);
    }
  };

  const handleWithdrawApplication = async () => {
    setMenuOpen(null);
    try {
      await deleteMyApplication();
      setMyApplication(null);
      setNoticeMessage('申请已撤回');
    } catch (error) {
      setNoticeMessage(getErrorMessage(error, '撤回申请失败'));
    }
  };

  const handleLeaveCircle = async () => {
    if (!activeCircle) {
      return;
    }

    const confirmMessage =
      activeCircle.is_creator && activeCircle.member_count === 1
        ? '退出后圈子将被解散，确定继续吗？'
        : `确定退出「${activeCircle.name}」吗？退出后需重新申请加入。`;
    const confirmed = window.confirm(confirmMessage);
    if (!confirmed) {
      return;
    }

    setMenuOpen(null);
    setShowApplicationProgress(false);
    try {
      await leaveCircle(activeCircle.id);
      setPosts([]);
      setPage(1);
      setHasMore(false);
      setDetailOpen(false);
      setSelectedPostId(null);
      setComments([]);
      setNoticeMessage(
        activeCircle.is_creator && activeCircle.member_count === 1
          ? '已退出并解散圈子'
          : '已退出圈子',
      );
      await loadUserState();
    } catch (error) {
      setNoticeMessage(getErrorMessage(error, '退出圈子失败'));
    }
  };
  const handleCreatePost = async (payload: { content?: string; image?: string }) => {
    if (!activeCircle) {
      throw new Error('请先选择圈子');
    }

    setSubmittingPost(true);
    try {
      const post = await createPost(activeCircle.id, payload.content, payload.image);
      setPosts((current) => [post, ...current]);
      setNewPostOpen(false);
      setNoticeMessage('发布成功');
    } catch (error) {
      throw new Error(getErrorMessage(error, '发布失败'));
    } finally {
      setSubmittingPost(false);
    }
  };

  const handleRatePost = async (postId: number, score: number) => {
    setRatingPostId(postId);
    try {
      await ratePost(postId, score);
      setPosts((current) =>
        current.map((post) => {
          if (post.id !== postId) {
            return post;
          }
          const oldScore = post.my_score;
          const nextRatingCount = oldScore == null ? post.rating_count + 1 : post.rating_count;
          const totalScore = post.average_score * post.rating_count;
          const nextTotal = oldScore == null ? totalScore + score : totalScore - oldScore + score;
          const nextAverage = nextRatingCount > 0 ? nextTotal / nextRatingCount : 0;
          return {
            ...post,
            my_score: score,
            rating_count: nextRatingCount,
            average_score: Number(nextAverage.toFixed(2)),
          };
        }),
      );
    } catch (error) {
      setNoticeMessage(getErrorMessage(error, '打分失败'));
      throw error instanceof Error ? error : new Error('打分失败');
    } finally {
      setRatingPostId(null);
    }
  };

  const handleDeletePost = async (post: CirclePost) => {
    if (!activeCircle) {
      return;
    }

    const confirmed = window.confirm('确定删除这条帖子吗？');
    if (!confirmed) {
      return;
    }

    setDeletingPostId(post.id);
    try {
      await deletePost(activeCircle.id, post.id);
      setPosts((current) => current.filter((item) => item.id !== post.id));
      if (selectedPostId === post.id) {
        setDetailOpen(false);
        setSelectedPostId(null);
        setComments([]);
      }
      setNoticeMessage('帖子已删除');
    } catch (error) {
      setNoticeMessage(getErrorMessage(error, '删除帖子失败'));
    } finally {
      setDeletingPostId(null);
    }
  };

  const handleSubmitComment = async (postId: number, content: string) => {
    setSubmittingComment(true);
    try {
      const comment = await addComment(postId, content);
      setComments((current) => [...current, comment]);
      setPosts((current) =>
        current.map((post) =>
          post.id === postId
            ? {
                ...post,
                comment_count: post.comment_count + 1,
                comments_preview: [comment, ...post.comments_preview].slice(0, 3),
              }
            : post,
        ),
      );
    } catch (error) {
      setNoticeMessage(getErrorMessage(error, '评论发送失败'));
      throw error instanceof Error ? error : new Error('评论发送失败');
    } finally {
      setSubmittingComment(false);
    }
  };

  const handleDeleteComment = async (comment: CircleComment) => {
    const confirmed = window.confirm('确定删除这条评论吗？');
    if (!confirmed) {
      return;
    }

    setDeletingCommentId(comment.id);
    try {
      await deleteComment(comment.id);
      setComments((current) => current.filter((item) => item.id !== comment.id));
      setPosts((current) =>
        current.map((post) =>
          post.id === comment.post_id
            ? {
                ...post,
                comment_count: Math.max(0, post.comment_count - 1),
                comments_preview: post.comments_preview.filter((item) => item.id !== comment.id),
              }
            : post,
        ),
      );
    } catch (error) {
      setNoticeMessage(getErrorMessage(error, '删除评论失败'));
      throw error instanceof Error ? error : new Error('删除评论失败');
    } finally {
      setDeletingCommentId(null);
    }
  };

  const renderNotice = () => {
    if (!noticeMessage) {
      return null;
    }

    return (
      <div className="flex items-start justify-between gap-3 rounded-[16px] border border-[#E9E6FA] bg-[#F8F7FE] px-4 py-3 text-sm text-[#534AB7]">
        <span>{noticeMessage}</span>
        <button
          type="button"
          onClick={() => setNoticeMessage('')}
          className="shrink-0 text-xs text-[#8A8799]"
        >
          关闭
        </button>
      </div>
    );
  };

  const renderAdminView = () => {
    if (adminError) {
      return (
        <div className="rounded-[18px] border border-[#F3D6D6] bg-white px-4 py-5 text-center">
          <p className="text-sm text-[#D75A5A]">{adminError}</p>
          <button
            type="button"
            onClick={() => {
              void loadAdminState();
            }}
            className="mt-3 rounded-[12px] border border-[#E7E5F2] px-4 py-2 text-sm text-[#534AB7]"
          >
            重试
          </button>
        </div>
      );
    }

    if (loadingAdmin) {
      return (
        <div className="space-y-3">
          {Array.from({ length: 4 }).map((_, index) => (
            <div
              key={`admin-skeleton-${index}`}
              className="animate-pulse rounded-[18px] border border-[#EEEDFE] bg-white px-4 py-4"
            >
              <div className="h-4 w-28 rounded bg-[#ECEAF8]" />
              <div className="mt-3 h-3 w-40 rounded bg-[#F1EFFA]" />
            </div>
          ))}
        </div>
      );
    }

    return (
      <>
        <div className="grid grid-cols-2 gap-3">
          <div className="rounded-[20px] bg-[#FFF3E4] px-4 py-4">
            <p className="text-xs text-[#BA7517]">待审批申请数</p>
            <p className="mt-2 text-2xl font-semibold text-[#A86C19]">{adminPending}</p>
          </div>
          <div className="rounded-[20px] bg-[#EEEDFE] px-4 py-4">
            <p className="text-xs text-[#534AB7]">已创建圈子数</p>
            <p className="mt-2 text-2xl font-semibold text-[#534AB7]">{adminCircles.length}</p>
          </div>
        </div>

        <button
          type="button"
          onClick={() => navigate('/app/circle/admin/applications')}
          className="h-12 w-full rounded-[16px] bg-[#534AB7] text-sm font-semibold text-white"
        >
          申请管理
        </button>

        <section className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-semibold text-[#2D2940]">已创建的圈子</h2>
            <span className="text-xs text-[#8A8799]">{adminCircles.length} 个</span>
          </div>

          {adminCircles.length === 0 ? (
            <div className="rounded-[20px] border border-dashed border-[#DDD9F3] bg-white px-5 py-8 text-center">
              <p className="text-lg font-semibold text-[#2D2940]">还没有圈子</p>
              <p className="mt-2 text-sm text-[#8A8799]">先创建一个圈子，再生成邀请码给别人加入。</p>
            </div>
          ) : (
            adminCircles.map((circle) => (
              <article
                key={circle.id}
                className="rounded-[18px] border border-[#ECEAF8] bg-white px-4 py-4 shadow-[0_10px_24px_rgba(45,41,64,0.06)]"
              >
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-base font-semibold text-[#2D2940]">{circle.name}</p>
                    <p className="mt-1 text-xs text-[#8A8799]">{circle.member_count} 位成员</p>
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
            ))
          )}
        </section>

        <button
          type="button"
          onClick={() => setCreateSheetOpen(true)}
          className="h-12 w-full rounded-[16px] bg-[#534AB7] text-sm font-semibold text-white"
        >
          + 新建圈子
        </button>
      </>
    );
  };
  const renderNoCircleView = () => (
    <div className="space-y-4 rounded-[24px] border border-dashed border-[#DCD8F1] bg-white px-5 py-8 text-center">
      <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-[20px] bg-[#F1EEFF] text-3xl">
        💬
      </div>
      <div>
        <p className="text-lg font-semibold text-[#2D2940]">还没有加入任何圈子</p>
        <p className="mt-2 text-sm leading-6 text-[#8A8799]">输入邀请码直接加入，或者申请创建一个新的圈子。</p>
      </div>

      <div className="space-y-3 rounded-[18px] bg-[#F8F7FE] px-4 py-4">
        <input
          type="text"
          value={joinCode}
          maxLength={8}
          placeholder="输入 8 位邀请码"
          onChange={(event) => setJoinCode(event.target.value.toUpperCase())}
          className="h-12 w-full rounded-[14px] border border-[#E7E5F2] bg-white px-3 text-sm text-[#2D2940] outline-none focus:border-[#534AB7]"
        />
        <button
          type="button"
          disabled={joiningCircle}
          onClick={() => {
            void handleJoinCircle();
          }}
          className="h-12 w-full rounded-[14px] bg-[#534AB7] text-sm font-semibold text-white disabled:opacity-60"
        >
          {joiningCircle ? '加入中...' : '加入'}
        </button>
      </div>

      <div className="flex items-center gap-3 px-2">
        <div className="h-px flex-1 bg-[#ECEAF8]" />
        <span className="text-xs text-[#B2AEC4]">或</span>
        <div className="h-px flex-1 bg-[#ECEAF8]" />
      </div>

      <button
        type="button"
        onClick={() => {
          setApplyError('');
          setApplyCircleName('');
          setApplyCircleDescription('');
          setApplyMessage('');
          setApplySheetOpen(true);
        }}
        className="text-sm text-[#8A8799]"
      >
        没有邀请码？申请创建圈子 →
      </button>

      {userError && <p className="text-sm text-[#D75A5A]">{userError}</p>}
    </div>
  );

  const renderApplicationView = () => {
    if (!myApplication) {
      return null;
    }

    return (
      <>
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm text-[#8A8799]">圈子</p>
            <h1 className="text-[28px] font-semibold tracking-[-0.02em] text-[#2D2940]">申请进度</h1>
          </div>

          {myApplication.status === 'pending' && (
            <div ref={menuRef} className="relative">
              <MenuButton
                expanded={menuOpen === 'pending'}
                onClick={() => setMenuOpen((current) => (current === 'pending' ? null : 'pending'))}
              />
              {menuOpen === 'pending' && (
                <div className="absolute right-0 top-full z-10 mt-2 w-[132px] rounded-[10px] border border-[#E7E5F2] bg-white p-1.5 shadow-[0_12px_30px_rgba(45,41,64,0.12)]">
                  <button
                    type="button"
                    onClick={() => {
                      void handleWithdrawApplication();
                    }}
                    className="flex h-10 w-full items-center rounded-[8px] px-3 text-sm text-[#E24B4A] hover:bg-[#FFF6F6]"
                  >
                    撤回申请
                  </button>
                </div>
              )}
            </div>
          )}
        </div>

        <ApplicationCard application={myApplication} />

        {myApplication.status === 'pending' ? (
          <p className="px-1 text-sm text-[#8A8799]">等待管理员审批，通过后将自动为你创建圈子。</p>
        ) : (
          <button
            type="button"
            onClick={() => {
              setApplyError('');
              setApplyCircleName(myApplication.circle_name);
              setApplyCircleDescription(myApplication.circle_description ?? '');
              setApplyMessage(myApplication.message ?? '');
              setApplySheetOpen(true);
            }}
            className="h-12 w-full rounded-[16px] bg-[#534AB7] text-sm font-semibold text-white"
          >
            重新申请
          </button>
        )}
      </>
    );
  };

  const renderMemberView = () => {
    const isCircleOwner = activeCircle?.is_creator === true;

    return (
      <>
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-sm text-[#8A8799]">我的圈子</p>
            <h1 className="text-[28px] font-semibold tracking-[-0.02em] text-[#2D2940]">{activeCircle?.name ?? '圈子'}</h1>
          </div>

          <div ref={menuRef} className="relative">
            <MenuButton
              expanded={menuOpen === 'member'}
              onClick={() => setMenuOpen((current) => (current === 'member' ? null : 'member'))}
            />
            {menuOpen === 'member' && (
              <div className="absolute right-0 top-full z-10 mt-2 w-[168px] rounded-[10px] border border-[#E7E5F2] bg-white p-1.5 shadow-[0_12px_30px_rgba(45,41,64,0.12)]">
                {!isCircleOwner && (
                  <button
                    type="button"
                    onClick={() => {
                      setShowApplicationProgress((current) => !current);
                      setMenuOpen(null);
                    }}
                    className="flex h-10 w-full items-center rounded-[8px] px-3 text-sm text-[#2D2940] hover:bg-[#F7F6FD]"
                  >
                    申请进度
                  </button>
                )}
                {isCircleOwner && activeCircle && (
                  <button
                    type="button"
                    onClick={() => {
                      setMenuOpen(null);
                      void handleGenerateInvite({ id: activeCircle.id, name: activeCircle.name });
                    }}
                    className="flex h-10 w-full items-center rounded-[8px] px-3 text-sm text-[#2D2940] hover:bg-[#F7F6FD]"
                  >
                    生成邀请码
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => {
                    setApplyError('');
                    setApplyCircleName(myApplication?.circle_name ?? '');
                    setApplyCircleDescription(myApplication?.circle_description ?? '');
                    setApplyMessage(myApplication?.message ?? '');
                    setApplySheetOpen(true);
                    setMenuOpen(null);
                  }}
                  className="flex h-10 w-full items-center rounded-[8px] px-3 text-sm text-[#2D2940] hover:bg-[#F7F6FD]"
                >
                  申请创建圈子
                </button>
                <button
                  type="button"
                  onClick={() => {
                    void handleLeaveCircle();
                  }}
                  className="flex h-10 w-full items-center rounded-[8px] px-3 text-sm text-[#E24B4A] hover:bg-[#FFF6F6]"
                >
                  退出圈子
                </button>
              </div>
            )}
          </div>
        </div>
      {activeCircle?.description && (
        <div className="rounded-[18px] border border-[#EEEDFE] bg-white px-4 py-4">
          <p className="text-sm leading-6 text-[#6F6A7E]">{activeCircle.description}</p>
        </div>
      )}

      {isCircleOwner && activeCircle && (
        <div className="rounded-[18px] border border-[#EEEDFE] bg-[#F8F7FE] px-4 py-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs text-[#8A8799]">邀请码</p>
              <p className="mt-1 text-lg font-semibold tracking-[0.15em] text-[#534AB7]">
                {loadingInviteCode ? '加载中...' : (circleInviteCodes[activeCircle.id] ?? '暂无邀请码')}
              </p>
            </div>
            <button
              type="button"
              onClick={() => {
                void handleGenerateInvite({ id: activeCircle.id, name: activeCircle.name });
              }}
              className="rounded-[10px] bg-[#534AB7] px-3 py-1.5 text-xs font-medium text-white"
            >
              {circleInviteCodes[activeCircle.id] ? '重新生成' : '生成邀请码'}
            </button>
          </div>
          {circleInviteCodes[activeCircle.id] && (
            <p className="mt-2 text-xs text-[#8A8799]">
              将此码发给对方，对方在圈子页输入即可加入
            </p>
          )}
        </div>
      )}

      {showApplicationProgress &&
        (myApplication ? (
          <ApplicationCard application={myApplication} />
        ) : (
          <div className="rounded-[18px] border border-[#E9E6FA] bg-[#F8F7FE] px-4 py-4 text-sm text-[#8A8799]">暂无申请记录</div>
        ))}

      <div className="overflow-x-auto pb-1">
        <div className="flex gap-2">
          {userCircles.map((circle) => (
            <button
              key={circle.id}
              type="button"
              onClick={() => {
                setMenuOpen(null);
                setActiveCircleId(circle.id);
              }}
              className={`shrink-0 rounded-[14px] px-4 py-3 text-left ${
                circle.id === activeCircleId
                  ? 'bg-[#534AB7] text-white'
                  : 'border border-[#E7E5F2] bg-white text-[#6F6A7E]'
              }`}
            >
              <p className="text-sm font-semibold">{circle.name}</p>
              <p className={`mt-1 text-xs ${circle.id === activeCircleId ? 'text-white/75' : 'text-[#9A97A8]'}`}>
                {circle.member_count} 位成员
              </p>
            </button>
          ))}
        </div>
      </div>

      {postsError ? (
        <div className="rounded-[18px] border border-[#F3D6D6] bg-white px-4 py-5 text-center">
          <p className="text-sm text-[#D75A5A]">{postsError}</p>
          <button
            type="button"
            onClick={() => {
              if (activeCircleId) {
                void loadPosts(activeCircleId, 1, true);
              }
            }}
            className="mt-3 rounded-[12px] border border-[#E7E5F2] px-4 py-2 text-sm text-[#534AB7]"
          >
            重试
          </button>
        </div>
      ) : loadingPosts ? (
        <div className="space-y-3">
          {Array.from({ length: 3 }).map((_, index) => (
            <div
              key={`post-skeleton-${index}`}
              className="animate-pulse rounded-[20px] border border-[#EEEDFE] bg-white px-4 py-4"
            >
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-full bg-[#ECEAF8]" />
                <div className="flex-1 space-y-2">
                  <div className="h-3 w-24 rounded bg-[#ECEAF8]" />
                  <div className="h-3 w-16 rounded bg-[#F0EEF9]" />
                </div>
              </div>
              <div className="mt-4 h-32 rounded-[16px] bg-[#F5F3FD]" />
            </div>
          ))}
        </div>
      ) : posts.length === 0 ? (
        <div className="rounded-[22px] border border-dashed border-[#DDD9F3] bg-white px-5 py-10 text-center">
          <p className="text-lg font-semibold text-[#2D2940]">还没有帖子</p>
          <p className="mt-2 text-sm text-[#8A8799]">发一条图文帖，开始圈子里的第一段互动。</p>
        </div>
      ) : (
        <div className="space-y-4">
          {posts.map((post) => (
            <PostCard
              key={post.id}
              post={post}
              canDelete={post.user.id === user?.id}
              ratingSubmitting={ratingPostId === post.id}
              deleting={deletingPostId === post.id}
              onOpenDetail={(postId) => {
                setSelectedPostId(postId);
                setDetailOpen(true);
              }}
              onRate={handleRatePost}
              onDelete={handleDeletePost}
            />
          ))}
        </div>
      )}

      <div ref={loadMoreRef} className="h-8">
        {loadingMore && <p className="pt-2 text-center text-xs text-[#8A8799]">正在加载更多帖子...</p>}
        {!loadingMore && hasMore && (
          <button
            type="button"
            onClick={() => {
              if (activeCircleId) {
                void loadPosts(activeCircleId, page + 1, false);
              }
            }}
            className="mx-auto block rounded-[10px] border border-[#E7E5F2] px-4 py-2 text-xs text-[#6F6A7E]"
          >
            加载更多
          </button>
        )}
      </div>

      {activeCircle && (
        <div className="pointer-events-none fixed bottom-[92px] left-1/2 z-20 w-full max-w-[430px] -translate-x-1/2 px-4">
          <div className="flex justify-end">
            <button
              type="button"
              onClick={() => setNewPostOpen(true)}
              className="pointer-events-auto flex h-14 w-14 items-center justify-center rounded-[18px] bg-[#534AB7] text-3xl text-white shadow-[0_16px_30px_rgba(83,74,183,0.28)]"
            >
              +
            </button>
          </div>
        </div>
      )}
    </>
    );
  };

  return (
    <>
      <section className="space-y-4 pb-20">
        {!isAdmin && !loadingUser && renderNotice()}
        {isAdmin && !loadingAdmin && renderNotice()}

        {isAdmin ? (
          <>
            <header>
              <p className="text-sm text-[#8A8799]">圈子</p>
              <h1 className="text-[28px] font-semibold tracking-[-0.02em] text-[#2D2940]">圈子管理</h1>
            </header>
            {renderAdminView()}
          </>
        ) : loadingUser ? (
          <div className="space-y-3">
            {Array.from({ length: 4 }).map((_, index) => (
              <div
                key={`circle-state-skeleton-${index}`}
                className="animate-pulse rounded-[18px] border border-[#EEEDFE] bg-white px-4 py-4"
              >
                <div className="h-4 w-32 rounded bg-[#ECEAF8]" />
                <div className="mt-3 h-3 w-48 rounded bg-[#F1EFFA]" />
              </div>
            ))}
          </div>
        ) : userCircles.length > 0 ? (
          renderMemberView()
        ) : myApplication?.status === 'pending' || myApplication?.status === 'rejected' ? (
          renderApplicationView()
        ) : (
          <>
            <header>
              <p className="text-sm text-[#8A8799]">圈子</p>
              <h1 className="text-[28px] font-semibold tracking-[-0.02em] text-[#2D2940]">一起聊聊</h1>
            </header>
            {renderNoCircleView()}
          </>
        )}
      </section>

      <CreateCircleSheet
        open={createSheetOpen}
        submitting={creatingCircle}
        errorMessage={createCircleError}
        name={circleName}
        description={circleDescription}
        onClose={() => setCreateSheetOpen(false)}
        onNameChange={setCircleName}
        onDescriptionChange={setCircleDescription}
        onSubmit={handleCreateCircle}
      />

      <ApplyCircleSheet
        open={applySheetOpen}
        submitting={applyingCircle}
        errorMessage={applyError}
        circleName={applyCircleName}
        circleDescription={applyCircleDescription}
        message={applyMessage}
        onClose={() => setApplySheetOpen(false)}
        onCircleNameChange={setApplyCircleName}
        onCircleDescriptionChange={setApplyCircleDescription}
        onMessageChange={setApplyMessage}
        onSubmit={handleApplyCreate}
      />

      <InviteSheet
        open={inviteSheetOpen}
        circleName={inviteCircleName}
        code={inviteCode}
        copied={inviteCopied}
        onClose={() => {
          setInviteSheetOpen(false);
          setInviteCopied(false);
        }}
        onCopy={() => {
          void handleCopyInvite();
        }}
      />

      <NewPostSheet
        open={newPostOpen}
        submitting={submittingPost}
        onClose={() => setNewPostOpen(false)}
        onSubmit={handleCreatePost}
      />

      <PostDetailSheet
        open={detailOpen}
        post={selectedPost}
        comments={comments}
        loadingComments={loadingComments}
        submittingComment={submittingComment}
        deletingCommentId={deletingCommentId}
        currentUserId={user?.id}
        onClose={() => {
          setDetailOpen(false);
          setSelectedPostId(null);
          setComments([]);
        }}
        onSubmitComment={handleSubmitComment}
        onDeleteComment={handleDeleteComment}
      />
    </>
  );
}

export default CirclePage;
