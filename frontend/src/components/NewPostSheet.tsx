import { useEffect, useRef, useState, type ChangeEvent } from 'react';

import { compressImage } from '@/utils/imageUtils';

interface NewPostSheetProps {
  open: boolean;
  submitting: boolean;
  onClose: () => void;
  onSubmit: (payload: { content?: string; image?: string }) => Promise<void>;
}

function NewPostSheet({ open, submitting, onClose, onSubmit }: NewPostSheetProps) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [content, setContent] = useState('');
  const [image, setImage] = useState<string | null>(null);
  const [processingImage, setProcessingImage] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  useEffect(() => {
    if (!open) {
      setContent('');
      setImage(null);
      setProcessingImage(false);
      setErrorMessage('');
    }
  }, [open]);

  if (!open) {
    return null;
  }

  const handlePickImage = () => {
    if (processingImage || submitting) {
      return;
    }
    inputRef.current?.click();
  };

  const handleImageChange = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0] ?? null;
    event.target.value = '';
    if (!file) {
      return;
    }

    setProcessingImage(true);
    setErrorMessage('');
    try {
      const nextImage = await compressImage(file, { maxSide: 800, quality: 0.75 });
      setImage(nextImage);
    } catch (error) {
      if (error instanceof Error) {
        setErrorMessage(error.message);
      } else {
        setErrorMessage('图片处理失败');
      }
    } finally {
      setProcessingImage(false);
    }
  };

  const handleSubmit = async () => {
    const trimmedContent = content.trim();
    if (!trimmedContent && !image) {
      setErrorMessage('文字内容和图片至少填写一项');
      return;
    }

    setErrorMessage('');

    try {
      await onSubmit({
        content: trimmedContent || undefined,
        image: image ?? undefined,
      });
    } catch (error) {
      if (error instanceof Error) {
        setErrorMessage(error.message);
      } else {
        setErrorMessage('发布失败');
      }
    }
  };

  return (
    <div className="fixed inset-0 z-30 flex items-end justify-center bg-black/35">
      <button
        type="button"
        className="absolute inset-0 cursor-default"
        aria-label="关闭发帖弹窗"
        onClick={onClose}
      />

      <section className="relative w-full max-w-[430px] rounded-t-[28px] bg-white px-4 pb-6 pt-4 shadow-[0_-10px_30px_rgba(45,41,64,0.12)]">
        <div className="mx-auto h-1.5 w-10 rounded-full bg-[#D8D5E7]" />

        <div className="mt-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-[#2D2940]">新帖子</h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-[10px] border border-[#E7E5F2] px-3 py-1 text-xs text-[#8A8799]"
          >
            取消
          </button>
        </div>

        <div className="mt-4">
          {image ? (
            <div className="relative overflow-hidden rounded-[18px] border border-[#E7E5F2] bg-[#F6F4FE]">
              <img src={image} alt="预览图" className="h-[180px] w-full object-cover" />
              <button
                type="button"
                onClick={() => setImage(null)}
                className="absolute right-3 top-3 flex h-8 w-8 items-center justify-center rounded-full bg-[#2D2940]/75 text-lg text-white"
              >
                ×
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={handlePickImage}
              className="flex h-[160px] w-full flex-col items-center justify-center rounded-[18px] border border-dashed border-[#D8D4F1] bg-[#FAF9FE] text-[#6F6A7E]"
            >
              <span className="text-2xl">🖼️</span>
              <span className="mt-2 text-sm font-medium">
                {processingImage ? '正在处理图片...' : '添加图片'}
              </span>
              <span className="mt-1 text-xs text-[#9A97A8]">最多 1 张，自动压缩</span>
            </button>
          )}
        </div>

        <label className="mt-4 block">
          <textarea
            value={content}
            maxLength={200}
            rows={5}
            placeholder="分享今天的美食..."
            onChange={(event) => setContent(event.target.value)}
            className="w-full resize-none rounded-[18px] border border-[#E7E5F2] px-4 py-3 text-sm leading-6 text-[#2D2940] outline-none focus:border-[#534AB7]"
          />
          <span className="mt-2 block text-right text-xs text-[#9A97A8]">
            {content.length}/200
          </span>
        </label>

        {errorMessage && (
          <div className="rounded-[14px] border border-[#F3D6D6] bg-[#FFF7F7] px-3 py-3 text-xs text-[#D75A5A]">
            {errorMessage}
          </div>
        )}

        <button
          type="button"
          disabled={submitting || processingImage}
          onClick={() => {
            void handleSubmit();
          }}
          className="mt-4 h-12 w-full rounded-[14px] bg-[#534AB7] text-sm font-semibold text-white disabled:opacity-60"
        >
          {submitting ? '发布中...' : '发布'}
        </button>

        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(event) => {
            void handleImageChange(event);
          }}
        />
      </section>
    </div>
  );
}

export default NewPostSheet;
