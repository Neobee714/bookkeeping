declare const __APP_VERSION__: string;

import axios from 'axios';
import { useEffect, useRef, useState, type ChangeEvent, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';

import { bindPartner, fetchMe, updateAvatar, updateMonthStartDay, updateProfile } from '@/api/auth';
import { importTransactions } from '@/api/transactions';
import ImportModal from '@/components/ImportModal';
import UserAvatar from '@/components/UserAvatar';
import { useAuthStore } from '@/store/authStore';
import { themeLabel, useThemeStore, type ThemeName } from '@/store/themeStore';
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

interface MenuItemProps {
  icon: ReactNode;
  iconBg: string;
  label: string;
  badge?: string;
  onClick?: () => void;
  last?: boolean;
}

function MenuItem({ icon, iconBg, label, badge, onClick, last }: MenuItemProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex w-full items-center gap-3.5 py-3.5 text-left ${
        last ? '' : 'border-b border-[rgba(60,60,67,0.08)]'
      }`}
    >
      <span
        className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg text-base"
        style={{ background: iconBg }}
      >
        {icon}
      </span>
      <span className="flex-1 text-[16px] text-[#1C1C1E]">{label}</span>
      {badge && <span className="mr-1 text-[13px] text-[#8E8E93]">{badge}</span>}
      <span className="text-[16px] font-light text-[#C6C6C8]">›</span>
    </button>
  );
}

function ProfilePage() {
  const navigate = useNavigate();
  const user = useAuthStore((state) => state.user);
  const logout = useAuthStore((state) => state.logout);
  const updateUser = useAuthStore((state) => state.updateUser);
  const theme = useThemeStore((state) => state.theme);
  const setTheme = useThemeStore((state) => state.setTheme);
  const bumpRefreshVersion = useTransactionSyncStore((state) => state.bumpRefreshVersion);

  const [loading, setLoading] = useState(true);
  const [partnerCodeInput, setPartnerCodeInput] = useState('');
  const [submittingBind, setSubmittingBind] = useState(false);
  const [message, setMessage] = useState('');
  const [currency, setCurrency] = useState<Currency>(() => readCurrency());
  const [nicknameDraft, setNicknameDraft] = useState('');
  const [editingProfile, setEditingProfile] = useState(false);
  const [savingProfile, setSavingProfile] = useState(false);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [importStatus, setImportStatus] = useState<ImportStatus>('ready');
  const [importResult, setImportResult] = useState<TransactionImportResult | null>(null);
  const [importError, setImportError] = useState('');
  const [showAbout, setShowAbout] = useState(false);
  const [showCurrencySheet, setShowCurrencySheet] = useState(false);
  const [showPartnerSheet, setShowPartnerSheet] = useState(false);
  const [showThemeSheet, setShowThemeSheet] = useState(false);
  const [showMonthStartSheet, setShowMonthStartSheet] = useState(false);
  const [savingMonthStart, setSavingMonthStart] = useState(false);

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

  const handleCopyCode = async (value: string | undefined, successText: string) => {
    if (!value) {
      return;
    }

    try {
      await copyText(value);
      setMessage(successText);
    } catch {
      setMessage('复制失败，请手动复制');
    }
  };

  const handleBindPartner = async () => {
    if (submittingBind) {
      return;
    }

    const partnerCode = partnerCodeInput.trim();
    if (!partnerCode) {
      setMessage('请输入伴侣绑定码');
      return;
    }

    setSubmittingBind(true);
    setMessage('');

    try {
      const updatedUser = await bindPartner(partnerCode);
      updateUser(updatedUser);
      setPartnerCodeInput('');
      setMessage('绑定成功');
      setShowPartnerSheet(false);
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
    setShowCurrencySheet(false);
  };

  const handleChangeTheme = (next: ThemeName) => {
    setTheme(next);
    setMessage(`已切换为${themeLabel[next]}主题`);
    setShowThemeSheet(false);
  };

  const handleChangeMonthStart = async (day: number) => {
    if (savingMonthStart) {
      return;
    }

    setSavingMonthStart(true);
    setMessage('');

    try {
      const updatedUser = await updateMonthStartDay(day);
      updateUser(updatedUser);
      setMessage(`每月起始日已设为 ${day} 号`);
      setShowMonthStartSheet(false);
    } catch (error) {
      if (axios.isAxiosError(error)) {
        setMessage(error.response?.data?.message ?? '设置失败');
      } else if (error instanceof Error) {
        setMessage(error.message);
      } else {
        setMessage('设置失败');
      }
    } finally {
      setSavingMonthStart(false);
    }
  };

  const handleOpenEditProfile = () => {
    setNicknameDraft(user?.nickname ?? '');
    setEditingProfile(true);
    setMessage('');
  };

  const handleCancelEditProfile = () => {
    setNicknameDraft(user?.nickname ?? '');
    setEditingProfile(false);
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
      setEditingProfile(false);
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

  const partnerSubtitle = user?.partner
    ? `已绑定伴侣 · ${user.partner.nickname}`
    : '尚未绑定伴侣';

  return (
    <section className="space-y-3 pb-2">
      <h1 className="ios-anim mb-1 mt-2 text-[34px] font-bold tracking-tight text-[#1C1C1E]">
        我的
      </h1>

      <div className="ios-glass ios-glass-strong ios-anim ios-anim-d1">
        <div className="flex flex-col items-center px-6 pb-5 pt-7">
          <div className="relative mb-3">
            <div
              className="flex h-[76px] w-[76px] items-center justify-center overflow-hidden rounded-full text-[32px] text-white"
              style={{
                background: 'var(--theme-avatar-gradient)',
                boxShadow: 'var(--theme-avatar-shadow)',
              }}
            >
              {user?.avatar ? (
                <img
                  src={user.avatar}
                  alt={user.nickname ?? '头像'}
                  className="h-full w-full object-cover"
                />
              ) : (
                <span>{(user?.nickname?.trim()?.[0] ?? '我').toUpperCase()}</span>
              )}
            </div>
            {uploadingAvatar && (
              <div className="absolute inset-0 flex items-center justify-center rounded-full bg-black/35">
                <span className="h-5 w-5 animate-spin rounded-full border-2 border-white/30 border-t-white" />
              </div>
            )}
            <button
              type="button"
              aria-label="更换头像"
              onClick={handleOpenAvatarPicker}
              className="absolute -bottom-1 -right-1 flex h-7 w-7 items-center justify-center rounded-full border-2 border-white bg-[#007AFF] text-white shadow-sm"
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
          <p className="text-[22px] font-semibold text-[#1C1C1E]">
            {loading ? '加载中...' : user?.nickname ?? '未命名用户'}
          </p>
          <p className="mt-1 text-[14px] text-[#8E8E93]">{partnerSubtitle}</p>
        </div>
      </div>

      <div className="ios-glass ios-anim ios-anim-d2 px-4">
        <MenuItem
          icon={<span className="text-[#007AFF]">👤</span>}
          iconBg="rgba(0,122,255,0.12)"
          label="个人信息"
          onClick={handleOpenEditProfile}
        />
        <MenuItem
          icon={<span className="text-[#FF9500]">📎</span>}
          iconBg="rgba(255,149,0,0.12)"
          label="导入账单"
          onClick={() => void handleOpenImportPicker()}
        />
        <MenuItem
          icon={<span className="text-[#34C759]">💱</span>}
          iconBg="rgba(52,199,89,0.12)"
          label="货币设置"
          badge={currency}
          onClick={() => setShowCurrencySheet(true)}
        />
        <MenuItem
          icon={<span className="text-[#5856D6]">🎨</span>}
          iconBg="rgba(88,86,214,0.12)"
          label="主题外观"
          badge={themeLabel[theme]}
          onClick={() => setShowThemeSheet(true)}
        />
        <MenuItem
          icon={<span className="text-[#FF9500]">📅</span>}
          iconBg="rgba(255,149,0,0.12)"
          label="每月起始日"
          badge={`${user?.month_start_day ?? 1}号`}
          onClick={() => setShowMonthStartSheet(true)}
          last
        />
      </div>

      <div className="ios-glass ios-anim ios-anim-d3 px-4">
        <MenuItem
          icon={<span>💕</span>}
          iconBg="rgba(88,86,214,0.12)"
          label="伴侣绑定"
          badge={user?.partner?.nickname ?? undefined}
          onClick={() => setShowPartnerSheet(true)}
        />
        <MenuItem
          icon={<span>ℹ️</span>}
          iconBg="rgba(255,45,85,0.12)"
          label="关于"
          onClick={() => setShowAbout(true)}
          last
        />
      </div>

      {message && (
        <div className="ios-glass ios-anim px-4 py-3 text-xs text-[#1C1C1E]">{message}</div>
      )}

      <button
        type="button"
        className="ios-anim ios-anim-d4 block w-full py-3.5 text-center text-[16px] font-medium text-[#FF3B30]"
        onClick={handleLogout}
      >
        退出登录
      </button>

      {showMonthStartSheet && (
        <div className="fixed inset-0 z-30 flex items-end justify-center bg-black/30">
          <button
            type="button"
            aria-label="关闭起始日设置"
            className="absolute inset-0 cursor-default"
            onClick={() => setShowMonthStartSheet(false)}
          />
          <section className="relative w-full max-w-[430px] rounded-t-3xl bg-white px-5 pb-8 pt-4">
            <div className="mx-auto h-1.5 w-10 rounded-full bg-[#D5D5DB]" />
            <h3 className="mt-4 text-lg font-semibold text-[#1C1C1E]">每月起始日</h3>
            <p className="mt-1 text-xs text-[#8E8E93]">
              每月账单周期从哪天开始（默认 1 号）
            </p>
            <div className="mt-4 grid grid-cols-7 gap-2">
              {Array.from({ length: 28 }, (_, index) => index + 1).map((day) => {
                const isActive = (user?.month_start_day ?? 1) === day;
                return (
                  <button
                    key={day}
                    type="button"
                    disabled={savingMonthStart}
                    onClick={() => void handleChangeMonthStart(day)}
                    className={`flex h-11 items-center justify-center rounded-[10px] text-sm font-medium transition-colors ${
                      isActive
                        ? 'bg-[#007AFF] text-white'
                        : 'border border-[rgba(60,60,67,0.12)] bg-white text-[#1C1C1E] active:bg-[rgba(0,122,255,0.08)]'
                    } ${savingMonthStart ? 'opacity-60' : ''}`}
                  >
                    {day}
                  </button>
                );
              })}
            </div>
          </section>
        </div>
      )}

      <p className="ios-anim ios-anim-d4 mt-2 text-center text-xs text-[#8E8E93]">
        Neobee Bookkeeping v{__APP_VERSION__}
      </p>

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

      {editingProfile && (
        <div className="fixed inset-0 z-30 flex items-end justify-center bg-black/30">
          <button
            type="button"
            aria-label="关闭个人信息"
            className="absolute inset-0 cursor-default"
            onClick={handleCancelEditProfile}
          />
          <section className="relative w-full max-w-[430px] rounded-t-3xl bg-white px-5 pb-8 pt-4">
            <div className="mx-auto h-1.5 w-10 rounded-full bg-[#D5D5DB]" />
            <h3 className="mt-4 text-lg font-semibold text-[#1C1C1E]">个人信息</h3>
            <label className="mt-4 block">
              <span className="mb-1 block text-xs text-[#8E8E93]">昵称</span>
              <input
                type="text"
                value={nicknameDraft}
                onChange={(event) => setNicknameDraft(event.target.value)}
                maxLength={16}
                placeholder="请输入昵称"
                className="h-11 w-full rounded-[10px] border border-[rgba(60,60,67,0.12)] px-3 text-sm outline-none focus:border-[#007AFF]"
              />
            </label>
            <div className="mt-3 rounded-[10px] bg-[rgba(118,118,128,0.08)] px-3 py-2 text-xs text-[#8E8E93]">
              用户名：@{user?.username ?? 'guest'}
            </div>
            <button
              type="button"
              disabled={savingProfile}
              onClick={() => void handleSaveNickname()}
              className="mt-4 h-12 w-full rounded-[12px] bg-[#007AFF] text-[15px] font-semibold text-white disabled:opacity-60"
            >
              {savingProfile ? '保存中...' : '保存'}
            </button>
            <button
              type="button"
              onClick={handleCancelEditProfile}
              className="mt-3 h-12 w-full rounded-[12px] bg-[rgba(118,118,128,0.08)] text-[15px] font-medium text-[#1C1C1E]"
            >
              取消
            </button>
          </section>
        </div>
      )}

      {showThemeSheet && (
        <div className="fixed inset-0 z-30 flex items-end justify-center bg-black/30">
          <button
            type="button"
            aria-label="关闭主题设置"
            className="absolute inset-0 cursor-default"
            onClick={() => setShowThemeSheet(false)}
          />
          <section className="relative w-full max-w-[430px] rounded-t-3xl bg-white px-5 pb-8 pt-4">
            <div className="mx-auto h-1.5 w-10 rounded-full bg-[#D5D5DB]" />
            <h3 className="mt-4 text-lg font-semibold text-[#1C1C1E]">主题外观</h3>
            <p className="mt-1 text-xs text-[#8E8E93]">切换界面整体视觉风格</p>
            <div className="mt-4 space-y-2">
              {(['ios', 'porcelain'] as const).map((item) => (
                <button
                  key={item}
                  type="button"
                  onClick={() => handleChangeTheme(item)}
                  className={`flex h-12 w-full items-center justify-between rounded-[10px] border px-4 text-sm ${
                    theme === item
                      ? 'border-[#007AFF] bg-[rgba(0,122,255,0.08)] text-[#007AFF]'
                      : 'border-[rgba(60,60,67,0.12)] bg-white text-[#1C1C1E]'
                  }`}
                >
                  <span>{themeLabel[item]}</span>
                  {theme === item && <span>✓</span>}
                </button>
              ))}
            </div>
          </section>
        </div>
      )}

      {showCurrencySheet && (
        <div className="fixed inset-0 z-30 flex items-end justify-center bg-black/30">
          <button
            type="button"
            aria-label="关闭货币设置"
            className="absolute inset-0 cursor-default"
            onClick={() => setShowCurrencySheet(false)}
          />
          <section className="relative w-full max-w-[430px] rounded-t-3xl bg-white px-5 pb-8 pt-4">
            <div className="mx-auto h-1.5 w-10 rounded-full bg-[#D5D5DB]" />
            <h3 className="mt-4 text-lg font-semibold text-[#1C1C1E]">货币设置</h3>
            <p className="mt-1 text-xs text-[#8E8E93]">仅本地保存，后续可接入账户设置</p>
            <div className="mt-4 space-y-2">
              {(['CNY', 'USD'] as const).map((item) => (
                <button
                  key={item}
                  type="button"
                  onClick={() => handleChangeCurrency(item)}
                  className={`flex h-12 w-full items-center justify-between rounded-[10px] border px-4 text-sm ${
                    currency === item
                      ? 'border-[#007AFF] bg-[rgba(0,122,255,0.08)] text-[#007AFF]'
                      : 'border-[rgba(60,60,67,0.12)] bg-white text-[#1C1C1E]'
                  }`}
                >
                  <span>{currencyLabel[item]}</span>
                  {currency === item && <span>✓</span>}
                </button>
              ))}
            </div>
          </section>
        </div>
      )}

      {showPartnerSheet && (
        <div className="fixed inset-0 z-30 flex items-end justify-center bg-black/30">
          <button
            type="button"
            aria-label="关闭伴侣绑定"
            className="absolute inset-0 cursor-default"
            onClick={() => setShowPartnerSheet(false)}
          />
          <section className="relative w-full max-w-[430px] rounded-t-3xl bg-white px-5 pb-8 pt-4">
            <div className="mx-auto h-1.5 w-10 rounded-full bg-[#D5D5DB]" />
            <h3 className="mt-4 text-lg font-semibold text-[#1C1C1E]">伴侣绑定</h3>

            <div className="mt-4 rounded-[14px] bg-[rgba(118,118,128,0.08)] p-3">
              <p className="text-xs text-[#8E8E93]">注册邀请码</p>
              <div className="mt-1 flex items-center justify-between gap-3">
                <p className="text-sm font-semibold text-[#007AFF]">
                  {user?.reg_invite_code ?? '加载中...'}
                </p>
                <button
                  type="button"
                  onClick={() => void handleCopyCode(user?.reg_invite_code, '注册邀请码已复制')}
                  className="h-8 rounded-[10px] bg-white px-3 text-xs font-medium text-[#007AFF]"
                >
                  复制
                </button>
              </div>
              <p className="mt-1 text-xs text-[#A0A0A5]">分享给想加入记账本的朋友</p>
            </div>

            {user?.partner ? (
              <div className="mt-3 flex items-center gap-3 rounded-[14px] bg-[rgba(118,118,128,0.08)] p-3">
                <UserAvatar avatar={user.partner.avatar} name={user.partner.nickname} />
                <div>
                  <p className="text-sm font-semibold text-[#1C1C1E]">{user.partner.nickname}</p>
                  <p className="text-xs text-[#8E8E93]">@{user.partner.username}</p>
                </div>
              </div>
            ) : (
              <>
                <div className="mt-3 rounded-[14px] bg-[rgba(118,118,128,0.08)] p-3">
                  <p className="text-xs text-[#8E8E93]">伴侣绑定码</p>
                  <div className="mt-1 flex items-center justify-between gap-3">
                    <p className="text-sm font-semibold text-[#007AFF]">
                      {user?.partner_code ?? '加载中...'}
                    </p>
                    <button
                      type="button"
                      onClick={() => void handleCopyCode(user?.partner_code, '伴侣绑定码已复制')}
                      className="h-8 rounded-[10px] bg-white px-3 text-xs font-medium text-[#007AFF]"
                    >
                      复制
                    </button>
                  </div>
                  <p className="mt-1 text-xs text-[#A0A0A5]">用于和伴侣互绑关系</p>
                </div>

                <label className="mt-3 block">
                  <span className="mb-1 block text-xs text-[#8E8E93]">输入对方伴侣绑定码</span>
                  <input
                    type="text"
                    value={partnerCodeInput}
                    onChange={(event) => setPartnerCodeInput(event.target.value)}
                    placeholder="例如：ABC123-XXXXXX"
                    className="h-11 w-full rounded-[10px] border border-[rgba(60,60,67,0.12)] px-3 text-sm uppercase outline-none focus:border-[#007AFF]"
                  />
                </label>
                <button
                  type="button"
                  disabled={submittingBind}
                  onClick={handleBindPartner}
                  className="mt-4 h-12 w-full rounded-[12px] bg-[#007AFF] text-[15px] font-semibold text-white disabled:opacity-60"
                >
                  {submittingBind ? '绑定中...' : '绑定伴侣'}
                </button>
              </>
            )}
          </section>
        </div>
      )}

      {showAbout && (
        <div className="fixed inset-0 z-30 flex items-end justify-center bg-black/30">
          <button
            type="button"
            aria-label="关闭关于弹窗"
            className="absolute inset-0 cursor-default"
            onClick={() => setShowAbout(false)}
          />

          <section className="relative w-full max-w-[430px] rounded-t-3xl bg-white px-5 pb-8 pt-4">
            <div className="mx-auto h-1.5 w-10 rounded-full bg-[#D5D5DB]" />

            <div className="mt-6 flex flex-col items-center text-center">
              <div
                className="flex h-16 w-16 items-center justify-center rounded-[18px] text-white"
                style={{ background: 'var(--theme-avatar-gradient)' }}
              >
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
              <h2 className="mt-4 text-[18px] font-semibold text-[#1C1C1E]">记账本</h2>
              <p className="mt-2 text-[13px] text-[#8E8E93]">两个人的记账小工具</p>
            </div>

            <div className="mt-6 rounded-[14px] bg-[rgba(118,118,128,0.08)] p-3">
              <div className="flex items-center justify-between rounded-[10px] px-2 py-2 text-sm">
                <span className="text-[#8E8E93]">当前版本</span>
                <span className="font-semibold text-[#1C1C1E]">v{__APP_VERSION__}</span>
              </div>
              <div className="flex items-center justify-between rounded-[10px] px-2 py-2 text-sm">
                <span className="text-[#8E8E93]">开发者</span>
                <span className="text-[#1C1C1E]">Langda</span>
              </div>
              <div className="flex items-center justify-between rounded-[10px] px-2 py-2 text-sm">
                <span className="text-[#8E8E93]">技术栈</span>
                <span className="text-[#1C1C1E]">React + FastAPI</span>
              </div>
            </div>

            <button
              type="button"
              onClick={() => setShowAbout(false)}
              className="mt-6 h-12 w-full rounded-[12px] bg-[#007AFF] px-4 text-[15px] font-semibold text-white"
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
