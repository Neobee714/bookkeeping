package com.bookkeepingapp

import android.app.DownloadManager
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.net.Uri
import android.os.Build
import android.os.Environment
import android.provider.Settings
import android.util.Log
import androidx.core.content.FileProvider
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import java.io.File

/**
 * OTA 更新原生模块:
 * - 检查/引导「安装未知来源应用」权限(Android 8.0+,API 26+);
 * - 用系统 DownloadManager 下载 APK 到公共下载目录(通知栏可见);
 * - 下载完成后通过 FileProvider + ACTION_VIEW 唤起系统安装器,覆盖安装。
 *
 * 覆盖安装前提(由其他任务保证):applicationId 与正式签名与线上老版一致,
 * 因此可原地覆盖、不卸载、保留数据。
 */
class UpdaterModule(reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext) {

  /** 当前进行中的下载任务 id(-1 表示无)。 */
  private var downloadId: Long = -1L

  /** 下载完成广播接收器(单次有效,触发后即注销)。 */
  private var downloadCompleteReceiver: BroadcastReceiver? = null

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

  /** 打开系统「允许安装未知来源应用」设置页(Android 8.0+;低版本无此设置,no-op)。 */
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
   * 用系统 DownloadManager 下载 APK,完成后自动唤起系统安装器。
   *
   * @param url  APK 下载地址(HTTPS)
   * @param fileName 保存到公共下载目录的文件名(建议 bookkeeping-{version}.apk)
   * @param promise 下载完成并成功唤起安装器后 resolve(true);任一环节失败则 reject(中文错误)
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
    // 下载到公共 Download 目录(DownloadManager 由系统进程写入,无需存储权限);
    // FileProvider 的 external-path 配置即指向该目录。
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O &&
        !reactApplicationContext.packageManager.canRequestPackageInstalls()) {
      promise.reject("E_PERMISSION", "请先允许安装未知来源应用,才能安装新版本")
      return
    }

    // 仅取文件名部分,防止传入路径穿越
    val safeFileName = File(trimmedFileName).name
    val destination =
        File(
            Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_DOWNLOADS),
            safeFileName,
        )
    // 上次残留的同名文件会导致 DownloadManager 报「文件已存在」,先清理
    if (destination.exists()) {
      destination.delete()
    }

    val downloadManager =
        reactApplicationContext.getSystemService(Context.DOWNLOAD_SERVICE) as DownloadManager

    val request =
        DownloadManager.Request(Uri.parse(trimmedUrl)).apply {
          setTitle("Bookkeeping 更新")
          setDescription("正在下载新版本,完成后自动安装")
          setNotificationVisibility(DownloadManager.Request.VISIBILITY_VISIBLE_NOTIFY_COMPLETED)
        }
    val destUri =
        request.setDestinationInExternalPublicDir(
            Environment.DIRECTORY_DOWNLOADS,
            safeFileName,
        )
    if (destUri == null) {
      promise.reject("E_NO_STORAGE", "下载目录不可用,请检查存储空间")
      return
    }

    // 同一时刻只允许一个进行中的下载:注销旧接收器
    unregisterDownloadReceiver()

    downloadId = downloadManager.enqueue(request)
    Log.d("UpdaterModule", "downloadAndInstall enqueued id=$downloadId url=$trimmedUrl")

    val receiver =
        object : BroadcastReceiver() {
          override fun onReceive(context: Context, intent: Intent) {
            val id = intent.getLongExtra(DownloadManager.EXTRA_DOWNLOAD_ID, -1L)
            Log.d("UpdaterModule", "onReceive broadcast id=$id expected=$downloadId action=${intent.action}")
            if (id != downloadId) {
              return
            }
            unregisterDownloadReceiver()
            handleDownloadComplete(downloadManager, destination, promise)
          }
        }
    downloadCompleteReceiver = receiver
    // Android 13+ (API 33) 要求注册非系统独占广播时显式指定 exported 标志。
    // ACTION_DOWNLOAD_COMPLETE 由 com.android.providers.downloads(非 system uid)发送,
    // RECEIVER_NOT_EXPORTED 会收不到,必须用 RECEIVER_EXPORTED。
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
      reactApplicationContext.registerReceiver(
          receiver,
          IntentFilter(DownloadManager.ACTION_DOWNLOAD_COMPLETE),
          Context.RECEIVER_EXPORTED,
      )
    } else {
      reactApplicationContext.registerReceiver(
          receiver,
          IntentFilter(DownloadManager.ACTION_DOWNLOAD_COMPLETE),
      )
    }
  }

  /** 下载完成回调:确认下载状态 → FileProvider 暴露 → ACTION_VIEW 唤起系统安装器。 */
  private fun handleDownloadComplete(
      downloadManager: DownloadManager,
      file: File,
      promise: Promise,
  ) {
    Log.d("UpdaterModule", "handleDownloadComplete file=$file")
    val query = DownloadManager.Query().setFilterById(downloadId)
    try {
      downloadManager.query(query).use { cursor ->
        if (!cursor.moveToFirst()) {
          promise.reject("E_DOWNLOAD_NOT_FOUND", "未找到下载任务,请重试")
          return
        }
        val status =
            cursor.getInt(cursor.getColumnIndexOrThrow(DownloadManager.COLUMN_STATUS))
        when (status) {
          DownloadManager.STATUS_SUCCESSFUL -> {
            if (!file.exists()) {
              promise.reject("E_FILE_MISSING", "下载的文件不存在,请重试")
              return
            }
            launchInstaller(file, promise)
          }
          DownloadManager.STATUS_FAILED -> {
            val reason =
                cursor.getInt(cursor.getColumnIndexOrThrow(DownloadManager.COLUMN_REASON))
            promise.reject("E_DOWNLOAD_FAILED", "下载失败(错误码 $reason),请重试")
          }
          else -> {
            // 收到完成广播后不应仍处于运行中;防御性处理
            promise.reject("E_DOWNLOAD_PENDING", "下载尚未完成,请稍后重试")
          }
        }
      }
    } catch (e: Exception) {
      promise.reject("E_QUERY_FAILED", "读取下载状态失败:${e.message ?: "未知错误"}")
    }
  }

  /** 用 FileProvider content URI + ACTION_VIEW 唤起系统安装器(覆盖安装)。 */
  private fun launchInstaller(file: File, promise: Promise) {
    try {
      val uri =
          FileProvider.getUriForFile(
              reactApplicationContext,
              "${reactApplicationContext.packageName}.fileprovider",
              file,
          )
      val intent =
          Intent(Intent.ACTION_VIEW).apply {
            setDataAndType(uri, "application/vnd.android.package-archive")
            addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION or Intent.FLAG_ACTIVITY_NEW_TASK)
          }
      reactApplicationContext.startActivity(intent)
      promise.resolve(true)
    } catch (e: Exception) {
      promise.reject("E_OPEN_INSTALLER", "无法打开系统安装器:${e.message ?: "未知错误"}")
    }
  }

  private fun unregisterDownloadReceiver() {
    downloadCompleteReceiver?.let { receiver ->
      try {
        reactApplicationContext.unregisterReceiver(receiver)
      } catch (_: IllegalArgumentException) {
        // 已注销,忽略
      }
    }
    downloadCompleteReceiver = null
  }
}
