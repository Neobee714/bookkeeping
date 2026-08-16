/**
 * OTA 更新:检查逻辑与弹窗状态(启动静默检查与「我的」页手动检查共用)。
 *
 * 结构:
 * - zustand store(与 authStore 同风格):弹窗可见状态 / updateInfo / 「稍后」
 *   内存标记 / 下载进行中标记;弹窗由根布局的 UpdateGate 渲染,任何页面
 *   触发检查都通过模块级状态打开同一个弹窗;
 * - `checkForUpdate(source)`:拉取远端清单 → 版本比较 → 有更新则弹窗;
 *   失败/无更新按场景提示(auto 静默、manual 提示);
 * - `useUpdateCheck()` hook:供 UpdateGate 取弹窗渲染所需状态与回调。
 */
import { useCallback } from 'react';
import { Alert } from 'react-native';
import DeviceInfo from 'react-native-device-info';
import { create } from 'zustand';

import { fetchUpdateInfo, hasUpdate, type UpdateInfo } from '../api/updates';
import { performUpdate } from './flow';

/** 检查场景:auto=启动静默(失败无提示、受「稍后」标记抑制);manual=手动入口(需反馈)。 */
export type UpdateCheckSource = 'auto' | 'manual';

interface UpdateCheckState {
  /** 待弹窗展示的更新信息(无更新/未检查时为 null)。 */
  updateInfo: UpdateInfo | null;
  /** 更新弹窗是否可见。 */
  visible: boolean;
  /** 本次进程内「稍后」标记:为 true 时启动静默检查不再自动弹(手动检查不受限)。 */
  reminded: boolean;
  /** 下载安装进行中(防止「立即更新」重复触发)。 */
  updating: boolean;
  show: (info: UpdateInfo) => void;
  hide: () => void;
  markReminded: () => void;
}

export const useUpdateCheckStore = create<UpdateCheckState>((set) => ({
  updateInfo: null,
  visible: false,
  reminded: false,
  updating: false,
  show: (info) => set({ updateInfo: info, visible: true }),
  hide: () => set({ visible: false }),
  markReminded: () => set({ reminded: true }),
}));

/**
 * 检查远端是否有新版本,有则打开更新弹窗。
 * - auto:失败/无更新静默返回;点过「稍后」则本次进程不再自动弹;
 * - manual:失败提示「检查更新失败」、无更新提示「已是最新版本」。
 */
export async function checkForUpdate(source: UpdateCheckSource): Promise<void> {
  const { reminded } = useUpdateCheckStore.getState();
  if (source === 'auto' && reminded) {
    return;
  }

  const info = await fetchUpdateInfo();
  if (!info) {
    if (source === 'manual') {
      Alert.alert('检查更新失败', '请稍后重试');
    }
    return;
  }

  if (!hasUpdate(DeviceInfo.getVersion(), info)) {
    if (source === 'manual') {
      Alert.alert('已是最新版本');
    }
    return;
  }

  useUpdateCheckStore.getState().show(info);
}

/** 更新弹窗渲染 hook:取弹窗状态与按钮回调(供根布局 UpdateGate 使用)。 */
export function useUpdateCheck() {
  const updateInfo = useUpdateCheckStore((s) => s.updateInfo);
  const visible = useUpdateCheckStore((s) => s.visible);

  /** 点「立即更新」:权限检查 → 引导或下载;已开始下载才关闭弹窗。 */
  const onUpdate = useCallback(() => {
    const { updateInfo: info, updating } = useUpdateCheckStore.getState();
    if (!info || updating) {
      return;
    }
    useUpdateCheckStore.setState({ updating: true });
    void performUpdate(info).then((started) => {
      useUpdateCheckStore.setState({ updating: false });
      if (started) {
        // 已交由系统下载/安装(通知栏进度),关闭弹窗;权限引导/失败则保持以便重试
        useUpdateCheckStore.getState().hide();
      }
    });
  }, []);

  /** 点「稍后」:关闭弹窗 + 本次进程不再自动弹(force 模式下无此按钮)。 */
  const onLater = useCallback(() => {
    useUpdateCheckStore.getState().markReminded();
    useUpdateCheckStore.getState().hide();
  }, []);

  /** Android 返回键关闭(force 模式下由 UpdateModal 内部忽略)。 */
  const onRequestClose = useCallback(() => {
    useUpdateCheckStore.getState().hide();
  }, []);

  return { updateInfo, visible, onUpdate, onLater, onRequestClose };
}
