/**
 * OTA 更新:下载安装流程(权限检查 → 引导 → 系统下载安装)。
 *
 * 流程:
 * 1. 检查「安装未知来源应用」权限(canRequestPackageInstalls 可能 reject,
 *    如 jest / 原生模块缺失,按失败处理并提示);
 * 2. 未开启 → Alert 引导去系统设置开启(弹窗保持,用户回来可再次点击);
 * 3. 已开启 → downloadAndInstall 启动应用内前台下载服务(通知栏进度),
 *    下载完成由服务通知点击唤起安装器,resolve 表示服务已成功启动。
 *
 * 返回 true 表示下载服务已启动(调用方可关闭更新弹窗);
 * false 表示未开始(权限引导 / 失败,弹窗保持以便重试)。
 */
import { Alert, PermissionsAndroid, Platform } from 'react-native';

import type { UpdateInfo } from '../api/updates';
import {
  canRequestPackageInstalls,
  downloadAndInstall,
  openInstallPermissionSettings,
} from './index';

/** 更新安装包文件名,与远端发布命名保持一致(bookkeeping-{version}.apk)。 */
const apkFileName = (version: string): string => `bookkeeping-${version}.apk`;

/**
 * Android 13+ 下载进度由应用自己的前台服务通知展示，需要 POST_NOTIFICATIONS。
 * 用户拒绝时不阻塞下载，只提示通知栏看不到进度。
 */
async function ensureNotificationPermission(): Promise<void> {
  if (Platform.OS !== 'android' || Number(Platform.Version) < 33) {
    return;
  }
  try {
    const result = await PermissionsAndroid.request(
      PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS,
    );
    if (result !== PermissionsAndroid.RESULTS.GRANTED) {
      Alert.alert(
        '通知权限未开启',
        '下载会继续进行，但通知栏看不到进度。请保持 App 打开；下载完成后会尝试打开安装界面。',
      );
    }
  } catch {
    // 权限请求失败不阻塞下载；服务仍会在后台下载。
  }
}

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

  // 3. 应用内前台服务下载(通知栏进度),完成后点击通知安装
  await ensureNotificationPermission();
  try {
    await downloadAndInstall(info.apkUrl, apkFileName(info.version));
    // resolve 仅表示下载服务已启动,下载仍在后台进行(通知栏可见进度)
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
