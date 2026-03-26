import { useEffect, useMemo, useRef, useState } from 'react';

import UserAvatar from '@/components/UserAvatar';
import type { CircleComment, CirclePost } from '@/types';
import { relativeTime } from '@/utils/timeUtils';

interface PostDetailSheetProps {
  open: boolean;
  post: CirclePost | null;
  comments: CircleComment[];
  loadingComments: boolean;
  submittingComment: boolean;
  deletingCommentId: number | null;
  currentUserId?: number;
  onClose: () => void;
  onSubmitComment: (postId: number, content: string) => Promise<void>;
  onDeleteComment: (comment: CircleComment) => Promise<void>;
}

const formatScore = (score: number): string =>
  Number.isInteger(score) ? score.toFixed(0) : score.toFixed(1);

interface CommentRowProps {
  comment: CircleComment;
  canDelete: boolean;
  deleting: boolean;
  onDelete: (comment: CircleComment) => Promise<void>;
}

function CommentRow({ comment, canDelete, deleting, onDelete }: CommentRowProps) {
  const timerRef = useRef<number | null>(null);

  const clearTimer = () => {
    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  };

  const startPress = () => {
    if (!canDelete || deleting) {
      return;
    }
    clearTimer();
    timerRef.current = window.setTimeout(() => {
      void onDelete(comment);
    }, 550);
  };

  useEffect(() => clearTimer, []);

  return (
    <div
      className="flex gap-3 rounded-[14px] bg-[#F8F7FE] px-3 py-3"
      onMouseDown={startPress}
      onMouseUp={clearTimer}
      onMouseLeave={clearTimer}
      onTouchStart={startPress}
      onTouchEnd={clearTimer}
      onTouchCancel={clearTimer}
    >
      <UserAvatar avatar={comment.user.avatar} name={comment.user.nickname} />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <p className="text-sm font-semibold text-[#2D2940]">{comment.user.nickname}</p>
          <span className="text-xs text-[#8A8799]">{relativeTime(comment.created_at)}</span>
        </div>
        <p className="mt-1 whitespace-pre-wrap text-sm leading-6 text-[#4A4560]">
          {comment.content}
        </p>
        {canDelete && (
          <p className="mt-2 text-[11px] text-[#8A8799]">
            {deleting ? '删除中...' : '长按可删除'}
          </p>
        )}
      </div>
    </div>
  );
}

function PostDetailSheet({
  open,
  post,
  comments,
  loadingComments,
  submittingComment,
  deletingCommentId,
  currentUserId,
  onClose,
  onSubmitComment,
  onDeleteComment,
}: PostDetailSheetProps) {
  const [content, setContent] = useState('');
  const [previewImage, setPreviewImage] = useState(false);

  useEffect(() => {
    if (!open) {
      setContent('');
    }
  }, [open]);

  const canSend = useMemo(() => content.trim().length > 0, [content]);

  if (!open || !post) {
    return null;
  }

  const handleSubmit = async () => {
    const value = content.trim();
    if (!value) {
      return;
    }
    await onSubmitComment(post.id, value);
    setContent('');
  };

  return (
    <>
      <div className="fixed inset-0 z-30 flex items-end justify-center bg-black/35">
        <button
          type="button"
          className="absolute inset-0 cursor-default"
          aria-label="关闭详情"
          onClick={onClose}
        />

        <section className="relative flex h-[82vh] w-full max-w-[430px] flex-col rounded-t-[28px] bg-white shadow-[0_-10px_30px_rgba(45,41,64,0.12)]">
          <div className="px-4 pt-4">
            <div className="mx-auto h-1.5 w-10 rounded-full bg-[#D8D5E7]" />
            <div className="mt-4 flex items-start justify-between gap-3">
              <div className="flex items-center gap-3">
                <UserAvatar avatar={post.user.avatar} name={post.user.nickname} />
                <div>
                  <p className="text-sm font-semibold text-[#2D2940]">{post.user.nickname}</p>
                  <p className="text-xs text-[#8A8799]">{relativeTime(post.created_at)}</p>
                </div>
              </div>
              <button
                type="button"
                onClick={onClose}
                className="rounded-[10px] border border-[#E7E5F2] px-3 py-1 text-xs text-[#8A8799]"
              >
                关闭
              </button>
            </div>
          </div>

          <div className="mt-4 flex-1 overflow-y-auto px-4 pb-28">
            {post.image && (
              <button
                type="button"
                onClick={() => setPreviewImage(true)}
                className="block w-full overflow-hidden rounded-[16px] bg-[#F6F4FE]"
              >
                <img src={post.image} alt="帖子图片" className="max-h-[280px] w-full object-cover" />
              </button>
            )}

            {post.content && (
              <p className="mt-4 whitespace-pre-wrap text-sm leading-7 text-[#3A3550]">
                {post.content}
              </p>
            )}

            <div className="mt-4 rounded-[18px] bg-[#F8F7FE] px-4 py-4">
              <div className="flex items-end justify-between gap-3">
                <div>
                  <p className="text-xs text-[#8A8799]">平均分</p>
                  <p className="mt-1 text-3xl font-semibold text-[#534AB7]">
                    {formatScore(post.average_score)}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-xs text-[#8A8799]">参与人数</p>
                  <p className="mt-1 text-sm font-medium text-[#2D2940]">
                    {post.rating_count} 人
                  </p>
                </div>
              </div>
            </div>

            <div className="mt-5 border-t border-[#F0EEF9] pt-4">
              <div className="flex items-center justify-between">
                <h3 className="text-base font-semibold text-[#2D2940]">评论</h3>
                <span className="text-xs text-[#8A8799]">{post.comment_count} 条</span>
              </div>

              {loadingComments ? (
                <div className="mt-4 space-y-3">
                  {Array.from({ length: 3 }).map((_, index) => (
                    <div
                      key={`comment-skeleton-${index}`}
                      className="animate-pulse rounded-[14px] bg-[#F8F7FE] px-3 py-3"
                    >
                      <div className="h-3 w-24 rounded bg-[#ECEAF8]" />
                      <div className="mt-2 h-3 w-full rounded bg-[#F0EEF9]" />
                    </div>
                  ))}
                </div>
              ) : comments.length > 0 ? (
                <div className="mt-4 space-y-3">
                  {comments.map((comment) => (
                    <CommentRow
                      key={comment.id}
                      comment={comment}
                      canDelete={comment.user.id === currentUserId}
                      deleting={deletingCommentId === comment.id}
                      onDelete={onDeleteComment}
                    />
                  ))}
                </div>
              ) : (
                <div className="mt-4 rounded-[16px] border border-dashed border-[#E7E5F2] bg-[#FAF9FE] px-4 py-6 text-center text-sm text-[#8A8799]">
                  还没有评论，发一条吧
                </div>
              )}
            </div>
          </div>

          <div className="absolute inset-x-0 bottom-0 rounded-t-[24px] border-t border-[#F0EEF9] bg-white px-4 pb-5 pt-3">
            <div className="flex items-end gap-3">
              <textarea
                value={content}
                maxLength={500}
                rows={1}
                placeholder="写下你的评论..."
                onChange={(event) => setContent(event.target.value)}
                className="min-h-[44px] flex-1 resize-none rounded-[14px] border border-[#E7E5F2] px-3 py-3 text-sm text-[#2D2940] outline-none focus:border-[#534AB7]"
              />
              <button
                type="button"
                disabled={!canSend || submittingComment}
                onClick={() => {
                  void handleSubmit();
                }}
                className="h-11 rounded-[12px] bg-[#534AB7] px-4 text-sm font-medium text-white disabled:opacity-60"
              >
                {submittingComment ? '发送中...' : '发送'}
              </button>
            </div>
          </div>
        </section>
      </div>

      {previewImage && post.image && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-[#1E183B]/90 px-4">
          <button
            type="button"
            className="absolute inset-0 cursor-default"
            aria-label="关闭大图"
            onClick={() => setPreviewImage(false)}
          />
          <div className="relative z-10 w-full max-w-[430px]">
            <button
              type="button"
              onClick={() => setPreviewImage(false)}
              className="absolute right-0 top-[-44px] rounded-full border border-white/20 bg-white/10 px-3 py-1 text-sm text-white"
            >
              关闭
            </button>
            <img src={post.image} alt="帖子大图" className="max-h-[80vh] w-full rounded-[18px] object-contain" />
          </div>
        </div>
      )}
    </>
  );
}

export default PostDetailSheet;
