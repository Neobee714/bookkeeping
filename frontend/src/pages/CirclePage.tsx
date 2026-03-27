import axios from 'axios';
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { useNavigate } from 'react-router-dom';

import {
  addComment,
  createCircle,
  createPost,
  deleteComment,
  deletePost,
  generateInviteCode,
  getCirclePosts,
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
import type {
  Circle,
  CircleComment,
  CirclePost,
} from '@/types';

const creatorUsername = (import.meta.env.VITE_CIRCLE_CREATOR_USERNAME ?? '').trim();

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
          <h2 className="text-lg font-semibold text-[#2D2940]">创建圈子</h2>
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
          <span className="mt-2 block text-right text-xs text-[#9A97A8]">
            {description.length}/100
          </span>
        </label>

        {errorMessage && (
          <div className="rounded-[14px] border border-[#F3D6D6] bg-[#FFF7F7] px-3 py-3 text-xs text-[#D75A5A]">
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

function CirclePage() {
  const navigate = useNavigate();
  const user = useAuthStore((state) => state.user);
  const loadMoreRef = useRef<HTMLDivElement | null>(null);
  const pagingRef = useRef(false);
  const actionMenuRef = useRef<HTMLDivElement | null>(null);

  const [circles, setCircles] = useState<Circle[]>([]);
  const [loadingCircles, setLoadingCircles] = useState(true);
  const [circlesError, setCirclesError] = useState('');
  const [activeCircleId, setActiveCircleId] = useState<number | null>(null);
  const [circleListMode, setCircleListMode] = useState(false);

  const [posts, setPosts] = useState<CirclePost[]>([]);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [loadingPosts, setLoadingPosts] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [postsError, setPostsError] = useState('');

  const [joinCode, setJoinCode] = useState('');
  const [joiningCircle, setJoiningCircle] = useState(false);

  const [createSheetOpen, setCreateSheetOpen] = useState(false);
  const [creatingCircle, setCreatingCircle] = useState(false);
  const [createCircleError, setCreateCircleError] = useState('');
  const [circleName, setCircleName] = useState('');
  const [circleDescription, setCircleDescription] = useState('');

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

  const [noticeMessage, setNoticeMessage] = useState('');
  const [actionMenuOpen, setActionMenuOpen] = useState(false);

  const canCreateCircle = Boolean(
    user?.username && (creatorUsername ? user.username === creatorUsername : true),
  );
  const showCircleListView = circles.length > 0 && (circleListMode || activeCircleId === null);

  const activeCircle = useMemo(
    () => circles.find((circle) => circle.id === activeCircleId) ?? null,
    [circles, activeCircleId],
  );

  const selectedPost = useMemo(
    () => posts.find((post) => post.id === selectedPostId) ?? null,
    [posts, selectedPostId],
  );

  const openCreateSheet = () => {
    setActionMenuOpen(false);
    setCreateCircleError('');
    setCreateSheetOpen(true);
  };

  const loadCircles = useCallback(async (
    nextActiveId?: number,
    options?: { resetToList?: boolean },
  ) => {
    setLoadingCircles(true);
    setCirclesError('');
    try {
      const data = await getMyCircles();
      setCircles(data);
      const shouldResetToList = Boolean(options?.resetToList && data.length > 0);
      setCircleListMode(shouldResetToList);
      setActiveCircleId((current) => {
        if (shouldResetToList) {
          return null;
        }
        if (nextActiveId && data.some((circle) => circle.id === nextActiveId)) {
          return nextActiveId;
        }
        if (current && data.some((circle) => circle.id === current)) {
          return current;
        }
        return data[0]?.id ?? null;
      });
    } catch (error) {
      setCirclesError(getErrorMessage(error, '圈子加载失败'));
    } finally {
      setLoadingCircles(false);
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
        setPosts((current) =>
          replace ? data.items : dedupePosts([...current, ...data.items]),
        );
        setPage(data.page);
        setHasMore(data.has_more);
      } catch (error) {
        const message = getErrorMessage(error, '帖子加载失败');
        if (replace) {
          setPostsError(message);
          setPosts([]);
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

  const loadComments = useCallback(async (postId: number) => {
    setLoadingComments(true);
    try {
      const data = await getPostComments(postId);
      setComments(data);
    } catch (error) {
      setNoticeMessage(getErrorMessage(error, '评论加载失败'));
      setComments([]);
    } finally {
      setLoadingComments(false);
    }
  }, []);

  useEffect(() => {
    void loadCircles();
  }, [loadCircles]);

  useEffect(() => {
    if (!actionMenuOpen) {
      return;
    }

    const handleOutsideClick = (event: MouseEvent) => {
      if (
        actionMenuRef.current &&
        !actionMenuRef.current.contains(event.target as Node)
      ) {
        setActionMenuOpen(false);
      }
    };

    document.addEventListener('mousedown', handleOutsideClick);
    return () => document.removeEventListener('mousedown', handleOutsideClick);
  }, [actionMenuOpen]);

  useEffect(() => {
    if (!activeCircleId) {
      setPosts([]);
      setPage(1);
      setHasMore(false);
      setPostsError('');
      return;
    }

    setPosts([]);
    setPage(1);
    setHasMore(false);
    void loadPosts(activeCircleId, 1, true);
  }, [activeCircleId, loadPosts]);

  useEffect(() => {
    if (!detailOpen || !selectedPostId) {
      return;
    }
    void loadComments(selectedPostId);
  }, [detailOpen, selectedPostId, loadComments]);

  useEffect(() => {
    if (selectedPostId && !selectedPost) {
      setDetailOpen(false);
      setSelectedPostId(null);
      setComments([]);
    }
  }, [selectedPost, selectedPostId]);

  useEffect(() => {
    if (!activeCircleId || !hasMore || loadingPosts || loadingMore) {
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
  }, [activeCircleId, hasMore, loadPosts, loadingMore, loadingPosts, page]);

  const handleJoinCircle = async () => {
    const code = joinCode.trim().toUpperCase();
    if (!code) {
      setNoticeMessage('请输入邀请码');
      return;
    }

    setJoiningCircle(true);
    try {
      await joinCircle(code);
      setJoinCode('');
      setNoticeMessage('已提交申请，等待圈主审批');
    } catch (error) {
      setNoticeMessage(getErrorMessage(error, '加入圈子失败'));
    } finally {
      setJoiningCircle(false);
    }
  };

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
      const circle = await createCircle(name, description || undefined);
      setCreateSheetOpen(false);
      setCircleListMode(false);
      setCircleName('');
      setCircleDescription('');
      setNoticeMessage('圈子已创建');
      await loadCircles(circle.id);
    } catch (error) {
      setCreateCircleError(getErrorMessage(error, '创建圈子失败'));
    } finally {
      setCreatingCircle(false);
    }
  };

  const handleInvite = async () => {
    if (!activeCircle) {
      return;
    }
    try {
      const invite = await generateInviteCode(activeCircle.id);
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(invite.code);
        setNoticeMessage(`邀请码已复制：${invite.code}`);
      } else {
        setNoticeMessage(`邀请码：${invite.code}`);
      }
    } catch (error) {
      setNoticeMessage(getErrorMessage(error, '邀请码生成失败'));
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

  const handleLeaveCircle = async () => {
    if (!activeCircle) {
      return;
    }

    const confirmed = window.confirm(
      `确定退出「${activeCircle.name}」吗？退出后需重新申请加入。`,
    );
    if (!confirmed) {
      return;
    }

    setActionMenuOpen(false);
    try {
      await leaveCircle(activeCircle.id);
      setDetailOpen(false);
      setSelectedPostId(null);
      setComments([]);
      setPosts([]);
      setPage(1);
      setHasMore(false);
      setNoticeMessage('已退出圈子');
      await loadCircles(undefined, { resetToList: true });
    } catch (error) {
      setNoticeMessage(getErrorMessage(error, '退出圈子失败'));
    }
  };

  const handleOpenApplications = () => {
    setActionMenuOpen(false);
    if (!activeCircle) {
      return;
    }
    navigate(`/app/circle/admin/${activeCircle.id}/applications`);
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

  const handleOpenDetail = (postId: number) => {
    setSelectedPostId(postId);
    setDetailOpen(true);
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

  return (
    <>
      <section className="space-y-4 pb-20">
        <header className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-[#8A8799]">圈子</p>
              <h1 className="text-[28px] font-semibold tracking-[-0.02em] text-[#2D2940]">
                {showCircleListView ? '我的圈子' : (activeCircle?.name ?? '一起聊聊')}
              </h1>
            </div>

            <div ref={actionMenuRef} className="relative flex items-center gap-3">
              {!showCircleListView && activeCircle?.is_creator && (
                <button
                  type="button"
                  onClick={() => {
                    void handleInvite();
                  }}
                  className="rounded-[14px] bg-[#EEEDFE] px-4 py-2 text-sm font-medium text-[#534AB7]"
                >
                  邀请
                </button>
              )}

              {!showCircleListView && canCreateCircle && (
                <button
                  type="button"
                  aria-label="更多操作"
                  aria-expanded={actionMenuOpen}
                  onClick={() => setActionMenuOpen((current) => !current)}
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
              )}

              {!showCircleListView && !canCreateCircle && activeCircle && !activeCircle.is_creator && (
                <button
                  type="button"
                  onClick={() => {
                    void handleLeaveCircle();
                  }}
                  className="text-[13px] font-medium text-[#E24B4A]"
                >
                  退出
                </button>
              )}

              {!showCircleListView && canCreateCircle && actionMenuOpen && (
                <div className="absolute right-0 top-full z-10 mt-2 w-[156px] rounded-[10px] border border-[#E7E5F2] bg-white p-1.5 shadow-[0_12px_30px_rgba(45,41,64,0.12)]">
                  <button
                    type="button"
                    onClick={openCreateSheet}
                    className="flex h-10 w-full items-center rounded-[8px] px-3 text-sm text-[#2D2940] hover:bg-[#F7F6FD]"
                  >
                    + 新建圈子
                  </button>
                  <button
                    type="button"
                    onClick={handleOpenApplications}
                    className="flex h-10 w-full items-center rounded-[8px] px-3 text-sm text-[#2D2940] hover:bg-[#F7F6FD]"
                  >
                    管理申请
                  </button>
                </div>
              )}
            </div>
          </div>

          {noticeMessage && (
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
          )}
        </header>

        {loadingCircles ? (
          <div className="space-y-3">
            {Array.from({ length: 3 }).map((_, index) => (
              <div
                key={`circle-skeleton-${index}`}
                className="animate-pulse rounded-[18px] border border-[#EEEDFE] bg-white px-4 py-4"
              >
                <div className="h-4 w-32 rounded bg-[#ECEAF8]" />
                <div className="mt-3 h-3 w-48 rounded bg-[#F1EFFA]" />
              </div>
            ))}
          </div>
        ) : circles.length === 0 ? (
          <div className="space-y-4 rounded-[24px] border border-dashed border-[#DCD8F1] bg-white px-5 py-8 text-center">
            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-[20px] bg-[#F1EEFF] text-3xl">
              💬
            </div>
            <div>
              <p className="text-lg font-semibold text-[#2D2940]">还没有加入圈子</p>
              <p className="mt-2 text-sm leading-6 text-[#8A8799]">
                输入邀请码加入圈子，或者由圈主先创建一个。
              </p>
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
                {joiningCircle ? '加入中...' : '输入邀请码加入'}
              </button>
            </div>

            {canCreateCircle && (
              <button
                type="button"
                onClick={openCreateSheet}
                className="inline-flex h-12 items-center justify-center rounded-[14px] border border-[#534AB7] px-5 text-sm font-medium text-[#534AB7]"
              >
                创建圈子
              </button>
            )}

            {circlesError && <p className="text-sm text-[#D75A5A]">{circlesError}</p>}
          </div>
        ) : (
          <>
            <div className="space-y-3">
              {canCreateCircle && (
                <button
                  type="button"
                  onClick={openCreateSheet}
                  className="h-11 w-full rounded-[10px] bg-[#534AB7] text-sm font-semibold text-white"
                >
                  + 新建圈子
                </button>
              )}
              {activeCircle?.description && (
                <div className="rounded-[18px] border border-[#EEEDFE] bg-white px-4 py-4">
                  <p className="text-sm leading-6 text-[#6F6A7E]">{activeCircle.description}</p>
                </div>
              )}

              <div className="overflow-x-auto pb-1">
                <div className="flex gap-2">
                  {circles.map((circle) => (
                    <button
                      key={circle.id}
                      type="button"
                      onClick={() => {
                        setActionMenuOpen(false);
                        setCircleListMode(false);
                        setActiveCircleId(circle.id);
                      }}
                      className={`shrink-0 rounded-[14px] px-4 py-3 text-left ${
                        circle.id === activeCircleId
                          ? 'bg-[#534AB7] text-white'
                          : 'border border-[#E7E5F2] bg-white text-[#6F6A7E]'
                      }`}
                    >
                      <p className="text-sm font-semibold">{circle.name}</p>
                      <p
                        className={`mt-1 text-xs ${
                          circle.id === activeCircleId ? 'text-white/75' : 'text-[#9A97A8]'
                        }`}
                      >
                        {circle.member_count} 位成员
                      </p>
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {showCircleListView ? (
              <div className="rounded-[22px] border border-dashed border-[#DDD9F3] bg-white px-5 py-10 text-center">
                <p className="text-lg font-semibold text-[#2D2940]">选择一个圈子</p>
                <p className="mt-2 text-sm text-[#8A8799]">
                  选择后即可查看帖子、评论和评分，也可以继续创建新圈子。
                </p>
              </div>
            ) : postsError ? (
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
                    canDelete={Boolean(activeCircle?.is_creator || post.user.id === user?.id)}
                    ratingSubmitting={ratingPostId === post.id}
                    deleting={deletingPostId === post.id}
                    onOpenDetail={handleOpenDetail}
                    onRate={handleRatePost}
                    onDelete={handleDeletePost}
                  />
                ))}
              </div>
            )}

            <div ref={loadMoreRef} className="h-8">
              {!showCircleListView && loadingMore && (
                <p className="pt-2 text-center text-xs text-[#8A8799]">正在加载更多帖子...</p>
              )}
              {!showCircleListView && !loadingMore && hasMore && (
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
          </>
        )}
      </section>

      {activeCircle && !showCircleListView && (
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

