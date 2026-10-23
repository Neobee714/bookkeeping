package com.bookkeepingapp

import android.content.Intent
import android.net.Uri
import android.os.Build
import android.provider.Settings
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import java.io.File

/**
 * OTA 更新原生模块:
 * - 检查/引导「安装未知来源应用」权限(Android 8.0+,API 26+);
 * - 启动应用内前台下载服务 [ApkDownloadService]，通知栏显示进度;
 * - 下载完成后由服务通过 FileProvider + 通知点击唤起系统安装器。
 *
 * 注意:不再使用系统 DownloadManager。它的下载 Job 强制要求
 * NET_CAPABILITY_VALIDATED，国产 ROM 上 Wi-Fi 常被标记为 PARTIAL_CONNECTIVITY，
 * 任务会永远停在“等待网络”，既不下载也不显示通知。
 */
class UpdaterModule(reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext) {

  override fun getName(): String = "UpdaterModule"

  /** 当前是否允许安装未知来源应用(Android 8.0+ 才有此开关;更低版本视为允许)。 */
  @ReactMethod
  fun canRequestPackageInstalls(promise: Promise) {
    val allowed =
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
        reactApplicationContext.packageManager.canRequestPackageInstalls()
      } else {
        true
      }
    promise.resolve(allowed)
  }

  /** 打开系统「允许安装未知来源」设置页(Android 8.0+;低版本无此设置,no-op)。 */
  @ReactMethod
  fun openInstallPermissionSettings() {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) {
      return
    }
    val intent =
        Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES).apply {
          data = Uri.parse("package:${reactApplicationContext.packageName}")
          addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        }
    try {
      reactApplicationContext.startActivity(intent)
    } catch (e: Exception) {
      // 部分 ROM 无此设置页;静默忽略,由调用方兜底提示
    }
  }

  /**
   * 启动前台下载服务。
   *
   * @param url APK 下载地址(HTTPS)
   * @param fileName 保存到应用私有下载目录的文件名(建议 bookkeeping-{version}.apk)
   * @param promise 服务成功启动后 resolve(true);入队前的校验失败/服务启动失败才 reject。
   *   下载进度与安装由 [ApkDownloadService] 的通知负责，不再回调本 promise。
   */
  @ReactMethod
  fun downloadAndInstall(url: String, fileName: String, promise: Promise) {
    val trimmedUrl = url.trim()
    val trimmedFileName = fileName.trim()
    if (trimmedUrl.isEmpty()) {
      promise.reject("E_INVALID_URL", "下载地址不能为空")
      return
    }
    if (trimmedFileName.isEmpty()) {
      promise.reject("E_INVALID_FILE_NAME", "文件名不能为空")
      return
    }
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O &&
        !reactApplicationContext.packageManager.canRequestPackageInstalls()) {
      promise.reject("E_PERMISSION", "请先允许安装未知来源应用,才能安装新版本")
      return
    }

    // 仅取文件名部分，防止传入路径穿越
    val safeFileName = File(trimmedFileName).name
    if (safeFileName.isEmpty()) {
      promise.reject("E_INVALID_FILE_NAME", "文件名不能为空")
      return
    }

    val intent =
        Intent(reactApplicationContext, ApkDownloadService::class.java).apply {
          putExtra(ApkDownloadService.EXTRA_URL, trimmedUrl)
          putExtra(ApkDownloadService.EXTRA_FILE_NAME, safeFileName)
        }
    try {
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
        reactApplicationContext.startForegroundService(intent)
      } else {
        reactApplicationContext.startService(intent)
      }
      promise.resolve(true)
    } catch (e: Exception) {
      promise.reject("E_START_FAILED", e.message ?: "无法启动下载服务", e)
    }
  }
}
