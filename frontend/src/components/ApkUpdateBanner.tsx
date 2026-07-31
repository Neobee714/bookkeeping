import { useEffect, useState } from 'react';

import {
  dismissApkUpdate,
  installApkUpdate,
  subscribeApkUpdate,
  type ApkUpdateInfo,
} from '@/utils/apkUpdate';

function ApkUpdateBanner() {
  const [info, setInfo] = useState<ApkUpdateInfo | null>(null);
  const [installing, setInstalling] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => subscribeApkUpdate(setInfo), []);

  if (!info) {
    return null;
  }

  const handleInstall = async () => {
    if (installing) {
      return;
    }
    setInstalling(true);
    setError('');
    const result = await installApkUpdate();
    setInstalling(false);
    if (!result.ok) {
      setError(result.error ?? '更新失败');
    }
  };

  const handleDismiss = () => {
    dismissApkUpdate();
    setError('');
  };

  const changelog = info.changelog?.trim() ?? '';
  const sizeText = info.size ? `${(info.size / 1024 / 1024).toFixed(1)} MB` : '';
  const description = changelog
    ? changelog
    : `需要安装新版 App${sizeText ? `（${sizeText}）` : ''}`;

  return (
    <div className="pointer-events-none fixed inset-x-0 top-0 z-30 flex justify-center px-3 pt-[calc(env(safe-area-inset-top,0)+8px)]">
      <div className="pointer-events-auto flex w-full max-w-[420px] items-center gap-3 rounded-[14px] bg-white/95 px-4 py-3 shadow-[0_8px_24px_rgba(0,0,0,0.12)] backdrop-blur">
        <div className="min-w-0 flex-1">
          <p className="text-[14px] font-semibold text-[#1C1C1E]">
            发现新版本 v{info.version}
          </p>
          <p className="mt-0.5 truncate text-[12px] text-[#8E8E93]">{description}</p>
          {error && (
            <p className="mt-0.5 text-[12px] font-medium text-[#FF3B30]">{error}</p>
          )}
        </div>
        <button
          type="button"
          onClick={handleDismiss}
          disabled={installing}
          className="shrink-0 rounded-[10px] px-2.5 py-1.5 text-[13px] text-[#8E8E93] disabled:opacity-50"
        >
          稍后
        </button>
        <button
          type="button"
          onClick={handleInstall}
          disabled={installing}
          className="shrink-0 rounded-[10px] bg-[#007AFF] px-3 py-1.5 text-[13px] font-semibold text-white disabled:opacity-60"
        >
          {installing ? '下载中…' : '更新'}
        </button>
      </div>
    </div>
  );
}

export default ApkUpdateBanner;
