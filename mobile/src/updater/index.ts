/**
 * OTA 更新:RN 侧对原生 UpdaterModule(android/.../UpdaterModule.kt)的桥接封装。
 *
 * 职责:
 * - 检查「安装未知来源应用」权限(canRequestPackageInstalls);
 * - 引导打开系统权限设置页(openInstallPermissionSettings);
 * - 发起下载并自动唤起系统安装器(downloadAndInstall,下载文件名由调用方传入,
 *   建议 bookkeeping-{version}.apk)。Android 端由 ApkDownloadService 前台下载,
 *   不再依赖系统 DownloadManager 的网络校验。
 *
 * 容错:原生模块在非 Android 环境(如 jest、测试渲染)下不存在,
 * 此处对 undefined 做安全包装——Promise 方法 reject、void 方法 console.warn,
 * 保证引入本模块不会导致崩溃。
 */
import { NativeModules } from 'react-native';

/** 原生 UpdaterModule 的 TS 声明(实现见 UpdaterModule.kt)。 */
interface UpdaterNativeModule {
  canRequestPackageInstalls(): Promise<boolean>;
  openInstallPermissionSettings(): void;
  downloadAndInstall(url: string, fileName: string): Promise<void>;
}

const nativeUpdater = NativeModules.UpdaterModule as
  | UpdaterNativeModule
  | undefined;

const UNSUPPORTED_MESSAGE = '当前环境不支持原生更新模块';

/**
 * 是否允许安装未知来源应用(Android 8.0+ 有该开关;更低版本恒为 true)。
 * 原生模块不可用时 reject,由调用方兜底提示。
 */
export function canRequestPackageInstalls(): Promise<boolean> {
  if (!nativeUpdater) {
    return Promise.reject(new Error(UNSUPPORTED_MESSAGE));
  }
  return nativeUpdater.canRequestPackageInstalls();
}

/** 打开系统「允许安装未知来源应用」设置页(Android 8.0+;低版本 no-op)。 */
export function openInstallPermissionSettings(): void {
  if (!nativeUpdater) {
    console.warn(`[updater] ${UNSUPPORTED_MESSAGE}`);
    return;
  }
  nativeUpdater.openInstallPermissionSettings();
}

/**
 * 启动应用内前台下载服务,通知栏显示进度,下载完成后点击通知安装。
 * resolve 表示下载服务已成功启动(完成后的安装由服务通知负责);
 * reject 时 message 为中文错误描述(仅启动前的校验失败:空 URL/文件名、缺少安装权限、服务启动失败)。
 */
export function downloadAndInstall(
  url: string,
  fileName: string,
): Promise<void> {
  if (!nativeUpdater) {
    return Promise.reject(new Error(UNSUPPORTED_MESSAGE));
  }
  return nativeUpdater.downloadAndInstall(url, fileName);
}
