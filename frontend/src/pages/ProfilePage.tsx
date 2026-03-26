declare const __APP_VERSION__: string;

import axios from 'axios';
import { useEffect, useRef, useState, type ChangeEvent } from 'react';
import { useNavigate } from 'react-router-dom';

import { bindPartnerInvite, fetchMe, updateAvatar, updateProfile } from '@/api/auth';
import { importTransactions } from '@/api/transactions';
import ImportModal from '@/components/ImportModal';
import UserAvatar from '@/components/UserAvatar';
import { useAuthStore } from '@/store/authStore';
import { useTransactionSyncStore } from '@/store/transactionSyncStore';
import type { TransactionImportResult } from '@/types';
import { isNativeImportPicker, pickImportCsvFile } from '@/utils/importFilePicker';
import { compressImage } from '@/utils/imageUtils';

type Currency = 'CNY' | 'USD';
type ImportStatus = 'ready' | 'uploading' | 'success' | 'error';

const CURRENCY_STORAGE_KEY = 'preferred_currency';

const readCurrency = (): Currency => {
  if (typeof window === 'undefined') {
    return 'CNY';
  }
  const cached = window.localStorage.getItem(CURRENCY_STORAGE_KEY);
  return cached === 'USD' ? 'USD' : 'CNY';
};

const currencyLabel: Record<Currency, string> = {
  CNY: '人民币 ¥',
  USD: '美元 $',
};

const copyText = async (value: string): Promise<void> => {
  if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(value);
    return;
  }

  const input = document.createElement('textarea');
  input.value = value;
  document.body.appendChild(input);
  input.select();
  document.execCommand('copy');
  document.body.removeChild(input);
};

function ProfilePage() {
  const navigate = useNavigate();
  const user = useAuthStore((state) => state.user);
  const logout = useAuthStore((state) => state.logout);
  const updateUser = useAuthStore((state) => state.updateUser);
  const bumpRefreshVersion = useTransactionSyncStore((state) => state.bumpRefreshVersion);

  const [loading, setLoading] = useState(true);
  const [inviteInput, setInviteInput] = useState('');
  const [submittingBind, setSubmittingBind] = useState(false);
  const [message, setMessage] = useState('');
  const [currency, setCurrency] = useState<Currency>(() => readCurrency());
  const [nicknameDraft, setNicknameDraft] = useState('');
  const [editingNickname, setEditingNickname] = useState(false);
  const [savingProfile, setSavingProfile] = useState(false);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [importStatus, setImportStatus] = useState<ImportStatus>('ready');
  const [importResult, setImportResult] = useState<TransactionImportResult | null>(null);
  const [importError, setImportError] = useState('');
  const [showAbout, setShowAbout] = useState(false);

  const avatarInputRef = useRef<HTMLInputElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      setMessage('');
      try {
        const profile = await fetchMe();
        updateUser(profile);
      } catch (error) {
        if (axios.isAxiosError(error)) {
          setMessage(error.response?.data?.message ?? '用户信息加载失败');
        } else if (error instanceof Error) {
          setMessage(error.message);
        } else {
          setMessage('用户信息加载失败');
        }
      } finally {
        setLoading(false);
      }
    };

    void load();
  }, [updateUser]);

  useEffect(() => {
    setNicknameDraft(user?.nickname ?? '');
  }, [user?.nickname]);

  const handleLogout = () => {
    logout();
    navigate('/login', { replace: true });
  };

  const handleCopyInvite = async () => {
    if (!user?.invite_code) {
      return;
    }

    try {
      await copyText(user.invite_code);
      setMessage('邀请码已复制');
    } catch {
      setMessage('复制失败，请手动复制');
    }
  };

  const handleBindPartner = async () => {
    if (submittingBind) {
      return;
    }

    const inviteCode = inviteInput.trim();
    if (!inviteCode) {
      setMessage('请输入邀请码');
      return;
    }

    setSubmittingBind(true);
    setMessage('');

    try {
      const updatedUser = await bindPartnerInvite(inviteCode);
      updateUser(updatedUser);
      setInviteInput('');
      setMessage('绑定成功');
    } catch (error) {
      if (axios.isAxiosError(error)) {
        setMessage(error.response?.data?.message ?? '绑定失败');
      } else if (error instanceof Error) {
        setMessage(error.message);
      } else {
        setMessage('绑定失败');
      }
    } finally {
      setSubmittingBind(false);
    }
  };

  const handleChangeCurrency = (next: Currency) => {
    setCurrency(next);
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(CURRENCY_STORAGE_KEY, next);
    }
    setMessage(`已切换为 ${currencyLabel[next]}`);
  };

  const handleStartEditNickname = () => {
    setNicknameDraft(user?.nickname ?? '');
    setEditingNickname(true);
    setMessage('');
  };

  const handleCancelEditNickname = () => {
    setNicknameDraft(user?.nickname ?? '');
    setEditingNickname(false);
  };

  const handleSaveNickname = async () => {
    if (savingProfile) {
      return;
    }

    const nickname = nicknameDraft.trim();
    if (!nickname) {
      setMessage('昵称不能为空');
      return;
    }

    setSavingProfile(true);
    setMessage('');

    try {
      const updatedUser = await updateProfile(nickname);
      updateUser(updatedUser);
      setEditingNickname(false);
      setMessage('昵称已更新');
    } catch (error) {
      if (axios.isAxiosError(error)) {
        setMessage(error.response?.data?.message ?? '昵称更新失败');
      } else if (error instanceof Error) {
        setMessage(error.message);
      } else {
        setMessage('昵称更新失败');
      }
    } finally {
      setSavingProfile(false);
    }
  };

  const handleOpenAvatarPicker = () => {
    if (uploadingAvatar) {
      return;
    }
    avatarInputRef.current?.click();
  };

  const handleAvatarChange = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0] ?? null;
    event.target.value = '';
    if (!file) {
      return;
    }

    setUploadingAvatar(true);
    setMessage('');

    try {
      const avatar = await compressImage(file);
      const updatedUser = await updateAvatar(avatar);
      updateUser(updatedUser);
      setMessage('头像已更新');
    } catch (error) {
      if (axios.isAxiosError(error)) {
        setMessage(error.response?.data?.message ?? '头像上传失败');
      } else if (error instanceof Error) {
        setMessage(error.message);
      } else {
        setMessage('头像上传失败');
      }
    } finally {
      setUploadingAvatar(false);
    }
  };

  const resetImportState = () => {
    setImportOpen(false);
    setSelectedFile(null);
    setImportStatus('ready');
    setImportResult(null);
    setImportError('');
  };

  const openImportSheetWithFile = (file: File) => {
    setSelectedFile(file);
    setImportResult(null);
    setImportError('');
    setImportStatus('ready');
    setImportOpen(true);
  };

  const handleOpenImportPicker = async () => {
    if (!isNativeImportPicker()) {
      fileInputRef.current?.click();
      return;
    }

    try {
      const file = await pickImportCsvFile();
      if (!file) {
        return;
      }
      openImportSheetWithFile(file);
    } catch (error) {
      if (error instanceof Error) {
        if (error.message === 'permission_denied') {
          setMessage('请先允许读取文件权限，再重新选择 CSV');
        } else if (error.message === 'file_read_failed') {
          setMessage('读取文件失败，请重新选择 CSV');
        } else {
          setMessage(error.message);
        }
      } else {
        setMessage('读取文件权限失败，请重试');
      }
    }
  };

  const handleFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0] ?? null;
    event.target.value = '';
    if (!file) {
      return;
    }
    openImportSheetWithFile(file);
  };

  const submitImport = async () => {
    if (!selectedFile) {
      setImportStatus('error');
      setImportError('请选择 CSV 文件后再导入');
      return;
    }

    setImportStatus('uploading');
    setImportError('');

    try {
      const result = await importTransactions(selectedFile);
      setImportResult(result);
      setImportStatus('success');
      bumpRefreshVersion();
      setMessage(`导入完成，新增 ${result.imported} 条记录`);
    } catch (error) {
      setImportStatus('error');
      if (axios.isAxiosError(error)) {
        setImportError(error.response?.data?.message ?? '导入失败，请重试');
      } else if (error instanceof Error) {
        setImportError(error.message);
      } else {
        setImportError('导入失败，请重试');
      }
    }
  };

  return (
    <section className="space-y-4 pb-2">
      <article className="rounded-2xl border border-[#EEEDFE] bg-white p-5">
        <div className="flex items-center gap-3">
          <div className="relative">
            <UserAvatar
              avatar={user?.avatar}
              name={user?.nickname}
              sizeClassName="h-14 w-14"
              textClassName="text-lg"
            />
            {uploadingAvatar && (
              <div className="absolute inset-0 flex items-center justify-center rounded-full bg-[#2D2940]/35">
                <span className="h-5 w-5 animate-spin rounded-full border-2 border-white/30 border-t-white" />
              </div>
            )}
            <button
              type="button"
              aria-label="更换头像"
              onClick={handleOpenAvatarPicker}
              className="absolute -bottom-1 -right-1 flex h-7 w-7 items-center justify-center rounded-full border border-white bg-[#534AB7] text-white shadow-sm"
            >
              <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none">
                <path
                  d="M4 7h3l1.5-2h7L17 7h3v10H4V7Zm8 8a4 4 0 1 0 0-8 4 4 0 0 0 0 8Z"
                  stroke="currentColor"
                  strokeWidth="1.8"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </button>
          </div>
          <div className="min-w-0">
            {editingNickname ? (
              <div className="space-y-2">
                <input
                  type="text"
                  value={nicknameDraft}
                  onChange={(event) => setNicknameDraft(event.target.value)}
                  maxLength={16}
                  placeholder="请输入昵称"
                  className="h-10 w-full rounded-[10px] border border-[#E7E5F2] px-3 text-sm outline-none focus:border-[#534AB7]"
                />
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    disabled={savingProfile}
                    onClick={() => void handleSaveNickname()}
                    className="rounded-[10px] bg-[#534AB7] px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-60"
                  >
                    {savingProfile ? '保存中...' : '保存'}
                  </button>
                  <button
                    type="button"
                    disabled={savingProfile}
                    onClick={handleCancelEditNickname}
                    className="rounded-[10px] border border-[#E7E5F2] bg-white px-3 py-1.5 text-xs text-[#6F6A7E] disabled:opacity-60"
                  >
                    取消
                  </button>
                </div>
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <p className="truncate text-lg font-semibold text-[#2D2940]">
                  {loading ? '加载中...' : user?.nickname ?? '未命名用户'}
                </p>
                <button
                  type="button"
                  aria-label="编辑昵称"
                  onClick={handleStartEditNickname}
                  className="flex h-7 w-7 items-center justify-center rounded-full bg-[#F4F2FD] text-[#534AB7]"
                >
                  <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none">
                    <path
                      d="M4 20h4l9.5-9.5a2.121 2.121 0 0 0-3-3L5 17v3Z"
                      stroke="currentColor"
                      strokeWidth="1.8"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                </button>
              </div>
            )}
            <p className="mt-1 truncate text-sm text-[#8A8799]">@{user?.username ?? 'guest'}</p>
          </div>
        </div>
      </article>

      <article className="rounded-2xl border border-[#EEEDFE] bg-white p-4">
        <h2 className="text-sm font-semibold text-[#2D2940]">我的伴侣</h2>
        {user?.partner ? (
          <div className="mt-3 flex items-center gap-3 rounded-[10px] bg-[#F8F7FE] p-3">
            <UserAvatar avatar={user.partner.avatar} name={user.partner.nickname} />
            <div>
              <p className="text-sm font-semibold text-[#2D2940]">{user.partner.nickname}</p>
              <p className="text-xs text-[#8A8799]">@{user.partner.username}</p>
            </div>
          </div>
        ) : (
          <div className="mt-3 space-y-3">
            <div className="rounded-[10px] border border-[#E8E6F2] bg-[#F8F7FE] p-3">
              <p className="text-xs text-[#8A8799]">我的邀请码</p>
              <p className="mt-1 text-sm font-semibold text-[#534AB7]">
                {user?.invite_code ?? '加载中...'}
              </p>
              <button
                type="button"
                onClick={handleCopyInvite}
                className="mt-2 h-8 rounded-[10px] border border-[#E2DFFF] bg-white px-3 text-xs text-[#534AB7]"
              >
                复制邀请码
              </button>
            </div>

            <label className="block">
              <span className="mb-1 block text-xs text-[#8A8799]">输入对方邀请码</span>
              <input
                type="text"
                value={inviteInput}
                onChange={(event) => setInviteInput(event.target.value)}
                placeholder="例如：ABC123-XXXXXX"
                className="h-11 w-full rounded-[10px] border border-[#E7E5F2] px-3 text-sm outline-none focus:border-[#534AB7]"
              />
            </label>
            <button
              type="button"
              disabled={submittingBind}
              onClick={handleBindPartner}
              className="h-11 w-full rounded-[10px] bg-[#534AB7] text-sm font-semibold text-white disabled:opacity-60"
            >
              {submittingBind ? '绑定中...' : '绑定伴侣'}
            </button>
          </div>
        )}
      </article>

      <article className="rounded-2xl border border-[#EEEDFE] bg-white p-4">
        <h2 className="text-sm font-semibold text-[#2D2940]">货币设置</h2>
        <p className="mt-1 text-xs text-[#8A8799]">仅本地保存，后续可接入账户设置</p>
        <div className="mt-3 grid grid-cols-2 gap-2 rounded-[10px] bg-[#F4F2FD] p-1">
          {(['CNY', 'USD'] as const).map((item) => (
            <button
              key={item}
              type="button"
              onClick={() => handleChangeCurrency(item)}
              className={`h-9 rounded-[10px] text-xs ${
                currency === item ? 'bg-white text-[#534AB7]' : 'text-[#8A8799]'
              }`}
            >
              {currencyLabel[item]}
            </button>
          ))}
        </div>
      </article>

      <article className="rounded-2xl border border-[#EEEDFE] bg-white p-4">
        <h2 className="text-sm font-semibold text-[#2D2940]">设置</h2>

        <div className="mt-3 space-y-3">
          <button
            type="button"
            onClick={() => void handleOpenImportPicker()}
            className="flex w-full items-center justify-between rounded-[16px] border border-[#E7E5F2] bg-[#F8F7FE] px-4 py-4 text-left"
          >
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-[12px] bg-[#EEEDFE] text-[#534AB7]">
                <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none">
                  <path
                    d="M12 16V6m0 0-4 4m4-4 4 4M5 18h14"
                    stroke="currentColor"
                    strokeWidth="1.8"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </div>
              <div>
                <p className="text-sm font-medium text-[#2D2940]">导入账单（鲨鱼记账）</p>
                <p className="mt-1 text-xs text-[#8A8799]">支持导入鲨鱼记账导出的 CSV 文件</p>
              </div>
            </div>
            <svg viewBox="0 0 24 24" className="h-4 w-4 text-[#9A97A8]" fill="none">
              <path
                d="m9 6 6 6-6 6"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </button>

          <button
            type="button"
            onClick={() => setShowAbout(true)}
            className="flex w-full items-center justify-between rounded-[16px] border border-[#E7E5F2] bg-white px-4 py-4 text-left"
          >
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-[12px] bg-[#EEEDFE] text-[#534AB7]">
                <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none">
                  <circle cx="12" cy="12" r="8" stroke="currentColor" strokeWidth="1.8" />
                  <path
                    d="M12 10v5m0-8h.01"
                    stroke="currentColor"
                    strokeWidth="1.8"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </div>
              <div>
                <p className="text-sm font-medium text-[#2D2940]">关于记账本</p>
                <p className="mt-1 text-xs text-[#8A8799]">查看版本号、开发者和技术信息</p>
              </div>
            </div>
            <svg viewBox="0 0 24 24" className="h-4 w-4 text-[#9A97A8]" fill="none">
              <path
                d="m9 6 6 6-6 6"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </button>
        </div>
      </article>

      {message && (
        <div className="rounded-[10px] border border-[#E6E3F6] bg-[#F8F7FE] px-3 py-2 text-xs text-[#6F6A7E]">
          {message}
        </div>
      )}

      <button
        type="button"
        className="w-full rounded-[10px] border border-[#F6D7D6] bg-white px-4 py-3 text-sm font-semibold text-[#E24B4A]"
        onClick={handleLogout}
      >
        退出登录
      </button>

      <input
        ref={avatarInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(event) => {
          void handleAvatarChange(event);
        }}
      />

      <input
        ref={fileInputRef}
        type="file"
        accept=".csv"
        className="hidden"
        onChange={handleFileChange}
      />

      <ImportModal
        open={importOpen}
        file={selectedFile}
        status={importStatus}
        result={importResult}
        errorMessage={importError}
        onClose={resetImportState}
        onConfirm={submitImport}
        onRetry={submitImport}
      />

      {showAbout && (
        <div className="fixed inset-0 z-30 flex items-end justify-center bg-black/30">
          <button
            type="button"
            aria-label="关闭关于弹窗"
            className="absolute inset-0 cursor-default"
            onClick={() => setShowAbout(false)}
          />

          <section className="relative w-full max-w-[430px] rounded-t-3xl bg-white px-4 pb-6 pt-4 shadow-[0_-4px_20px_rgba(0,0,0,0.08)]">
            <div className="mx-auto h-1 w-9 rounded-full bg-[#D8D5E7]" />

            <div className="mt-6 flex flex-col items-center text-center">
              <div className="flex h-16 w-16 items-center justify-center rounded-[18px] bg-[#534AB7] text-white">
                <svg viewBox="0 0 24 24" className="h-8 w-8" fill="none">
                  <path
                    d="M6 17V9m6 8V5m6 12v-6"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </div>
              <h2 className="mt-4 text-[18px] font-semibold text-[#2D2940]">记账本</h2>
              <p className="mt-2 text-[13px] text-[#8A8799]">两个人的记账小工具</p>
            </div>

            <div className="mt-6 rounded-[12px] bg-[#F8F7FE] p-3">
              <div className="flex items-center justify-between rounded-[10px] px-2 py-2 text-sm">
                <span className="text-[#8A8799]">当前版本</span>
                <span className="font-semibold text-[#2D2940]">v{__APP_VERSION__}</span>
              </div>
              <div className="flex items-center justify-between rounded-[10px] px-2 py-2 text-sm">
                <span className="text-[#8A8799]">开发者</span>
                <span className="text-[#2D2940]">Langda</span>
              </div>
              <div className="flex items-center justify-between rounded-[10px] px-2 py-2 text-sm">
                <span className="text-[#8A8799]">技术栈</span>
                <span className="text-[#2D2940]">React + FastAPI</span>
              </div>
            </div>

            <button
              type="button"
              onClick={() => setShowAbout(false)}
              className="mt-6 h-12 w-full rounded-[12px] bg-[#534AB7] px-4 text-sm font-semibold text-white"
            >
              关闭
            </button>
          </section>
        </div>
      )}
    </section>
  );
}

export default ProfilePage;
