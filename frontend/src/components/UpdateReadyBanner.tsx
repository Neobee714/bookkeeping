import { useEffect, useState } from 'react';

import {
  applyPendingUpdate,
  dismissUpdateReady,
  subscribeUpdateReady,
  type UpdateReadyInfo,
} from '@/utils/appUpdate';

function UpdateReadyBanner() {
  const [info, setInfo] = useState<UpdateReadyInfo | null>(null);
  const [applying, setApplying] = useState(false);

  useEffect(() => subscribeUpdateReady(setInfo), []);

  if (!info) {
    return null;
  }

  const handleApply = async () => {
    if (applying) {
      return;
    }
    setApplying(true);
    const ok = await applyPendingUpdate();
    // On success the webview reloads and this component unmounts.
    // On failure, fall back to letting the user retry or wait for bg swap.
    if (!ok) {
      setApplying(false);
    }
  };

  const handleDismiss = () => {
    dismissUpdateReady();
  };

  return (
    <div className="pointer-events-none fixed inset-x-0 top-0 z-30 flex justify-center px-3 pt-[calc(env(safe-area-inset-top,0)+8px)]">
      <div className="pointer-events-auto flex w-full max-w-[420px] items-center gap-3 rounded-[14px] bg-white/95 px-4 py-3 shadow-[0_8px_24px_rgba(0,0,0,0.12)] backdrop-blur">
        <div className="flex-1 min-w-0">
          <p className="text-[14px] font-semibold text-[#1C1C1E]">
            新版本 v{info.version} 已就绪
          </p>
          <p className="mt-0.5 truncate text-[12px] text-[#8E8E93]">
            点击立即更新，或稍后切换后台时自动生效
          </p>
        </div>
        <button
          type="button"
          onClick={handleDismiss}
          disabled={applying}
          className="shrink-0 rounded-[10px] px-2.5 py-1.5 text-[13px] text-[#8E8E93] disabled:opacity-50"
        >
          稍后
        </button>
        <button
          type="button"
          onClick={handleApply}
          disabled={applying}
          className="shrink-0 rounded-[10px] bg-[#007AFF] px-3 py-1.5 text-[13px] font-semibold text-white disabled:opacity-60"
        >
          {applying ? '更新中…' : '立即更新'}
        </button>
      </div>
    </div>
  );
}

export default UpdateReadyBanner;
