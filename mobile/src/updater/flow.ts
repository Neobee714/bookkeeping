/**
 * OTA 更新:下载安装流程(权限检查 → 引导 → 系统下载安装)。
 *
 * 流程:
 * 1. 检查「安装未知来源应用」权限(canRequestPackageInstalls 可能 reject,
 *    如 jest / 原生模块缺失,按失败处理并提示);
 * 2. 未开启 → Alert 引导去系统设置开启(弹窗保持,用户回来可再次点击);
 * 3. 已开启 → downloadAndInstall 走系统 DownloadManager(通知栏进度),
 *    下载完成自动唤起安装器,resolve 表示已开始下载。
 *
 * 返回 true 表示已开始下载(调用方可关闭更新弹窗);false 表示未开始
 * (权限引导 / 失败,弹窗保持以便重试)。
 */
import { Alert } from 'react-native';

import type { UpdateInfo } from '../api/updates';
import {
  canRequestPackageInstalls,
  downloadAndInstall,
  openInstallPermissionSettings,
} from './index';

/** 更新安装包文件名,与远端发布命名保持一致(bookkeeping-{version}.apk)。 */
const apkFileName = (version: string): string => `bookkeeping-${version}.apk`;

export async function performUpdate(info: UpdateInfo): Promise<boolean> {
  // 1. 权限检查(原生模块不可用时 reject,按失败提示)
  let canInstall = false;
  try {
    canInstall = await canRequestPackageInstalls();
  } catch {
    Alert.alert('更新失败', '当前环境不支持更新,请稍后重试');
    return false;
  }

  // 2. 未开启「安装未知来源」→ 引导去系统设置;回来后可再次点「立即更新」
  if (!canInstall) {
    Alert.alert(
      '需要开启安装权限',
      '请允许「安装未知来源应用」,以便完成更新安装。',
      [
        { text: '取消', style: 'cancel' },
        { text: '去开启', onPress: () => openInstallPermissionSettings() },
      ],
    );
    return false;
  }

  // 3. 系统 DownloadManager 下载(通知栏进度)→ 自动唤起安装器
  try {
    await downloadAndInstall(info.apkUrl, apkFileName(info.version));
    return true;
  } catch (error) {
    const message =
      error instanceof Error && error.message
        ? error.message
        : '下载失败,请稍后重试';
    Alert.alert('更新失败', message);
    return false;
  }
}
