import type { TransactionImportResult } from '@/types';

type ImportStatus = 'ready' | 'uploading' | 'success' | 'error';

interface ImportModalProps {
  open: boolean;
  file: File | null;
  status: ImportStatus;
  result: TransactionImportResult | null;
  errorMessage: string;
  onClose: () => void;
  onConfirm: () => Promise<void>;
  onRetry: () => Promise<void>;
}

function Spinner() {
  return (
    <div className="mx-auto h-10 w-10 animate-spin rounded-full border-[3px] border-[#E5DFD5] border-t-[#5A7A6E]" />
  );
}

function SuccessIcon() {
  return (
    <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-[#D4E8DD]">
      <svg viewBox="0 0 24 24" className="h-7 w-7" fill="none">
        <path
          d="M7 12.5l3.2 3.2L17.5 8.5"
          stroke="#6B9E85"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </div>
  );
}

function ErrorIcon() {
  return (
    <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-[#FDF0EB]">
      <svg viewBox="0 0 24 24" className="h-7 w-7" fill="none">
        <path
          d="M12 7v6m0 4h.01M10.3 4.8 3.8 16a2 2 0 0 0 1.7 3h13a2 2 0 0 0 1.7-3L13.7 4.8a2 2 0 0 0-3.4 0Z"
          stroke="#C27B6B"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </div>
  );
}

function ImportModal({
  open,
  file,
  status,
  result,
  errorMessage,
  onClose,
  onConfirm,
  onRetry,
}: ImportModalProps) {
  if (!open) {
    return null;
  }

  const canDismiss = status !== 'uploading';

  return (
    <div className="fixed inset-0 z-30 flex items-end justify-center bg-black/30">
      <button
        type="button"
        className="absolute inset-0 cursor-default"
        aria-label="关闭导入弹窗"
        onClick={canDismiss ? onClose : undefined}
      />

      <section className="relative w-full max-w-[430px] rounded-t-3xl bg-white px-4 pb-6 pt-4 shadow-[0_-4px_20px_rgba(0,0,0,0.08)]">
        <div className="mx-auto h-1.5 w-10 rounded-full bg-[#D5CFC5]" />

        {status === 'ready' && (
          <>
            <div className="mt-4 flex items-center justify-between">
              <h2 className="text-lg font-semibold text-[#2D2824]">导入历史账单</h2>
              <button
                type="button"
                onClick={onClose}
                className="h-8 rounded-[10px] border border-[#E5DFD5] px-3 text-xs text-[#6B6560]"
              >
                取消
              </button>
            </div>

            <div className="mt-4 rounded-2xl border border-[#E8F0EC] bg-[#FBF7F0] px-4 py-4">
              <p className="text-xs text-[#6B6560]">已选择文件</p>
              <p className="mt-2 break-all text-sm font-medium text-[#2D2824]">
                {file?.name ?? '未选择文件'}
              </p>
            </div>

            <button
              type="button"
              onClick={() => void onConfirm()}
              className="mt-4 h-11 w-full rounded-[10px] bg-[#5A7A6E] text-sm font-semibold text-white"
            >
              开始导入
            </button>
          </>
        )}

        {status === 'uploading' && (
          <div className="py-10 text-center">
            <Spinner />
            <p className="mt-4 text-sm font-medium text-[#2D2824]">正在导入...</p>
            <p className="mt-2 text-xs text-[#6B6560]">请保持页面开启，等待处理完成</p>
          </div>
        )}

        {status === 'success' && (
          <div className="py-8 text-center">
            <SuccessIcon />
            <p className="mt-4 text-base font-semibold text-[#2D2824]">
              成功导入 {result?.imported ?? 0} 条记录
            </p>
            {(result?.skipped ?? 0) > 0 && (
              <p className="mt-2 text-sm text-[#6B6560]">
                跳过 {result?.skipped ?? 0} 条（格式错误）
              </p>
            )}
            <button
              type="button"
              onClick={onClose}
              className="mt-5 h-11 w-full rounded-[10px] bg-[#5A7A6E] text-sm font-semibold text-white"
            >
              完成
            </button>
          </div>
        )}

        {status === 'error' && (
          <div className="py-8 text-center">
            <ErrorIcon />
            <p className="mt-4 text-base font-semibold text-[#2D2824]">导入失败</p>
            <p className="mt-2 rounded-[10px] border border-[#F2D8D1] bg-[#FDF0EB] px-3 py-2 text-sm text-[#C27B6B]">
              {errorMessage}
            </p>
            <button
              type="button"
              onClick={() => void onRetry()}
              className="mt-5 h-11 w-full rounded-[10px] bg-[#5A7A6E] text-sm font-semibold text-white"
            >
              重试
            </button>
            <button
              type="button"
              onClick={onClose}
              className="mt-3 h-11 w-full rounded-[10px] border border-[#E5DFD5] bg-white text-sm font-semibold text-[#6B6560]"
            >
              取消
            </button>
          </div>
        )}
      </section>
    </div>
  );
}

export default ImportModal;
