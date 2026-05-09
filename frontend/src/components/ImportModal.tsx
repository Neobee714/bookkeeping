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
    <div className="mx-auto h-10 w-10 animate-spin rounded-full border-[3px] border-[rgba(60,60,67,0.12)] border-t-[#007AFF]" />
  );
}

function SuccessIcon() {
  return (
    <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-[rgba(52,199,89,0.12)]">
      <svg viewBox="0 0 24 24" className="h-7 w-7" fill="none">
        <path
          d="M7 12.5l3.2 3.2L17.5 8.5"
          stroke="#34C759"
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
    <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-[rgba(255,59,48,0.12)]">
      <svg viewBox="0 0 24 24" className="h-7 w-7" fill="none">
        <path
          d="M12 7v6m0 4h.01M10.3 4.8 3.8 16a2 2 0 0 0 1.7 3h13a2 2 0 0 0 1.7-3L13.7 4.8a2 2 0 0 0-3.4 0Z"
          stroke="#FF3B30"
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

      <section className="relative w-full max-w-[430px] rounded-t-3xl bg-white px-5 pb-8 pt-4">
        <div className="mx-auto h-1.5 w-10 rounded-full bg-[#D5D5DB]" />

        {status === 'ready' && (
          <>
            <div className="mt-4 flex items-center justify-between">
              <h2 className="text-[18px] font-semibold text-[#1C1C1E]">导入历史账单</h2>
              <button
                type="button"
                onClick={onClose}
                className="h-8 rounded-[10px] bg-[rgba(118,118,128,0.12)] px-3 text-xs text-[#1C1C1E]"
              >
                取消
              </button>
            </div>

            <div className="mt-4 rounded-[14px] bg-[rgba(118,118,128,0.08)] px-4 py-4">
              <p className="text-xs text-[#8E8E93]">已选择文件</p>
              <p className="mt-2 break-all text-sm font-medium text-[#1C1C1E]">
                {file?.name ?? '未选择文件'}
              </p>
            </div>

            <button
              type="button"
              onClick={() => void onConfirm()}
              className="mt-4 h-12 w-full rounded-[12px] bg-[#007AFF] text-[15px] font-semibold text-white"
            >
              开始导入
            </button>
          </>
        )}

        {status === 'uploading' && (
          <div className="py-10 text-center">
            <Spinner />
            <p className="mt-4 text-sm font-medium text-[#1C1C1E]">正在导入...</p>
            <p className="mt-2 text-xs text-[#8E8E93]">请保持页面开启，等待处理完成</p>
          </div>
        )}

        {status === 'success' && (
          <div className="py-8 text-center">
            <SuccessIcon />
            <p className="mt-4 text-base font-semibold text-[#1C1C1E]">
              成功导入 {result?.imported ?? 0} 条记录
            </p>
            {(result?.skipped ?? 0) > 0 && (
              <p className="mt-2 text-sm text-[#8E8E93]">
                跳过 {result?.skipped ?? 0} 条（格式错误）
              </p>
            )}
            <button
              type="button"
              onClick={onClose}
              className="mt-5 h-12 w-full rounded-[12px] bg-[#007AFF] text-[15px] font-semibold text-white"
            >
              完成
            </button>
          </div>
        )}

        {status === 'error' && (
          <div className="py-8 text-center">
            <ErrorIcon />
            <p className="mt-4 text-base font-semibold text-[#1C1C1E]">导入失败</p>
            <p className="mt-2 rounded-[10px] bg-[rgba(255,59,48,0.1)] px-3 py-2 text-sm text-[#FF3B30]">
              {errorMessage}
            </p>
            <button
              type="button"
              onClick={() => void onRetry()}
              className="mt-5 h-12 w-full rounded-[12px] bg-[#007AFF] text-[15px] font-semibold text-white"
            >
              重试
            </button>
            <button
              type="button"
              onClick={onClose}
              className="mt-3 h-12 w-full rounded-[12px] bg-[rgba(118,118,128,0.12)] text-[15px] font-medium text-[#1C1C1E]"
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
