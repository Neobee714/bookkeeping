import { useEffect, useState } from 'react';

import { consumePendingChangelog, markChangelogSeen } from '@/utils/appUpdate';

interface NoticeState {
  version: string;
  changelog: string;
}

function UpdateNotice() {
  const [notice, setNotice] = useState<NoticeState | null>(null);

  useEffect(() => {
    const pending = consumePendingChangelog();
    if (pending) {
      setNotice({ version: pending.version, changelog: pending.changelog });
    }
  }, []);

  if (!notice) {
    return null;
  }

  const handleClose = () => {
    markChangelogSeen(notice.version);
    setNotice(null);
  };

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/40 px-6">
      <section className="w-full max-w-[380px] rounded-[18px] bg-white p-5">
        <div className="flex items-center justify-between">
          <h2 className="text-[17px] font-semibold text-[#1C1C1E]">已更新到 v{notice.version}</h2>
        </div>

        <div className="mt-3 max-h-[50vh] overflow-y-auto rounded-[12px] bg-[rgba(118,118,128,0.08)] px-4 py-3">
          {notice.changelog ? (
            <pre className="whitespace-pre-wrap break-words font-sans text-sm leading-6 text-[#1C1C1E]">
              {notice.changelog}
            </pre>
          ) : (
            <p className="text-sm text-[#8E8E93]">无更新说明</p>
          )}
        </div>

        <button
          type="button"
          onClick={handleClose}
          className="mt-5 h-11 w-full rounded-[12px] bg-[#007AFF] text-[15px] font-semibold text-white"
        >
          知道了
        </button>
      </section>
    </div>
  );
}

export default UpdateNotice;
