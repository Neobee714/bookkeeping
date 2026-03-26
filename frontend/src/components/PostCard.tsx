import { useEffect, useMemo, useState } from 'react';

import UserAvatar from '@/components/UserAvatar';
import type { CirclePost } from '@/types';
import { relativeTime } from '@/utils/timeUtils';

interface PostCardProps {
  post: CirclePost;
  canDelete: boolean;
  ratingSubmitting: boolean;
  deleting: boolean;
  onOpenDetail: (postId: number) => void;
  onRate: (postId: number, score: number) => Promise<void>;
  onDelete: (post: CirclePost) => void;
}

const formatScore = (score: number | null | undefined): string => {
  if (score == null || Number.isNaN(score)) {
    return '0.0';
  }
  return Number.isInteger(score) ? score.toFixed(0) : score.toFixed(1);
};

function PostCard({
  post,
  canDelete,
  ratingSubmitting,
  deleting,
  onOpenDetail,
  onRate,
  onDelete,
}: PostCardProps) {
  const [ratingOpen, setRatingOpen] = useState(false);
  const [draftScore, setDraftScore] = useState(post.my_score ?? 8);
  const [previewImage, setPreviewImage] = useState(false);

  useEffect(() => {
    setDraftScore(post.my_score ?? 8);
  }, [post.my_score]);

  const previewComments = useMemo(
    () => post.comments_preview.slice(0, 2),
    [post.comments_preview],
  );

  const handleSubmitRating = async () => {
    await onRate(post.id, draftScore);
    setRatingOpen(false);
  };

  return (
    <>
      <article className="rounded-[20px] border border-[#EEEDFE] bg-white px-4 py-4 shadow-[0_8px_18px_rgba(83,74,183,0.06)]">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <UserAvatar avatar={post.user.avatar} name={post.user.nickname} />
            <div>
              <p className="text-sm font-semibold text-[#2D2940]">{post.user.nickname}</p>
              <p className="text-xs text-[#8A8799]">{relativeTime(post.created_at)}</p>
            </div>
          </div>

          {canDelete && (
            <button
              type="button"
              disabled={deleting}
              onClick={() => onDelete(post)}
              className="rounded-[10px] border border-[#F1D8D8] px-3 py-1 text-xs text-[#D75A5A] disabled:opacity-60"
            >
              {deleting ? '删除中...' : '删除'}
            </button>
          )}
        </div>

        {post.image && (
          <button
            type="button"
            onClick={() => setPreviewImage(true)}
            className="mt-3 block w-full overflow-hidden rounded-[12px] bg-[#F4F2FD]"
          >
            <img src={post.image} alt="帖子图片" className="max-h-[320px] w-full object-cover" />
          </button>
        )}

        {post.content && (
          <p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-[#3A3550]">
            {post.content}
          </p>
        )}

        {previewComments.length > 0 && (
          <div className="mt-3 space-y-2 rounded-[14px] bg-[#F8F7FE] px-3 py-3">
            {previewComments.map((comment) => (
              <button
                key={comment.id}
                type="button"
                onClick={() => onOpenDetail(post.id)}
                className="flex w-full items-start gap-2 text-left"
              >
                <span className="shrink-0 text-xs font-semibold text-[#534AB7]">
                  {comment.user.nickname}:
                </span>
                <span className="line-clamp-1 text-xs text-[#6F6A7E]">{comment.content}</span>
              </button>
            ))}
          </div>
        )}

        <div className="mt-4 flex items-center justify-between gap-3 border-t border-[#F1EFFA] pt-3">
          <button
            type="button"
            onClick={() => onOpenDetail(post.id)}
            className="flex items-center gap-2 text-sm text-[#6F6A7E]"
          >
            <span className="text-base">💬</span>
            <span>{post.comment_count} 条评论</span>
          </button>

          <div className="flex items-center gap-2 text-sm">
            {post.my_score != null ? (
              <span className="font-semibold text-[#534AB7]">
                你给了 {formatScore(post.my_score)} 分
              </span>
            ) : (
              <span className="text-[#8A8799]">均分 {formatScore(post.average_score)}</span>
            )}

            {post.my_score != null && (
              <span className="text-xs text-[#8A8799]">
                均分 {formatScore(post.average_score)}
              </span>
            )}

            {!ratingOpen ? (
              <button
                type="button"
                onClick={() => setRatingOpen(true)}
                className="rounded-[10px] bg-[#EEEDFE] px-3 py-1 text-xs font-medium text-[#534AB7]"
              >
                {post.my_score != null ? '改分' : '打分'}
              </button>
            ) : (
              <button
                type="button"
                onClick={() => setRatingOpen(false)}
                className="rounded-[10px] border border-[#E7E5F2] px-3 py-1 text-xs text-[#8A8799]"
              >
                收起
              </button>
            )}
          </div>
        </div>

        {ratingOpen && (
          <div className="mt-3 rounded-[16px] border border-[#E8E5FA] bg-[#F8F7FE] px-3 py-3">
            <div className="flex items-center gap-3">
              <input
                type="range"
                min="0"
                max="10"
                step="0.5"
                value={draftScore}
                onChange={(event) => setDraftScore(Number(event.target.value))}
                className="h-2 flex-1 accent-[#534AB7]"
              />
              <span className="min-w-[48px] text-right text-lg font-semibold text-[#534AB7]">
                {formatScore(draftScore)}
              </span>
            </div>
            <div className="mt-3 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setRatingOpen(false)}
                className="rounded-[10px] border border-[#E7E5F2] px-3 py-2 text-xs text-[#8A8799]"
              >
                取消
              </button>
              <button
                type="button"
                disabled={ratingSubmitting}
                onClick={() => {
                  void handleSubmitRating();
                }}
                className="rounded-[10px] bg-[#534AB7] px-3 py-2 text-xs font-medium text-white disabled:opacity-60"
              >
                {ratingSubmitting ? '提交中...' : '确认'}
              </button>
            </div>
          </div>
        )}
      </article>

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

export default PostCard;
