package com.bookkeepingapp

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Intent
import android.content.pm.ServiceInfo
import android.os.Build
import android.os.IBinder
import android.util.Log
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import androidx.core.content.FileProvider
import java.io.File
import java.net.HttpURLConnection
import java.net.URL
import java.util.Locale
import java.util.concurrent.atomic.AtomicBoolean

/**
 * 应用内 APK 下载服务。
 *
 * 为什么不用系统 DownloadManager:
 * DownloadManager 的下载 Job 强制要求 NET_CAPABILITY_VALIDATED。国产 ROM / 部分 Wi-Fi
 * 因为连不上 Google 的连通性探测，网络会被标记为 PARTIAL_CONNECTIVITY，下载任务会一直
 * 停在“等待网络”，既不下载也不显示进度通知——用户只看到 App 说“已在后台下载”。
 *
 * 本服务用应用自己的 HttpURLConnection 下载（不要求 VALIDATED），配合前台服务通知
 * 展示进度；下载完成后通过 FileProvider + 通知点击唤起系统安装器。
 */
class ApkDownloadService : Service() {

  companion object {
    const val EXTRA_URL = "url"
    const val EXTRA_FILE_NAME = "file_name"

    private const val TAG = "ApkDownloadService"
    private const val CHANNEL_ID = "app_update_download"
    private const val PROGRESS_NOTIFICATION_ID = 7301
    private const val COMPLETE_NOTIFICATION_ID = 7302
    private const val FAILED_NOTIFICATION_ID = 7303
    private const val CONNECT_TIMEOUT_MS = 30_000
    private const val READ_TIMEOUT_MS = 60_000
    private const val BUFFER_SIZE = 64 * 1024
  }

  private val cancelled = AtomicBoolean(false)
  private var worker: Thread? = null

  override fun onBind(intent: Intent?): IBinder? = null

  override fun onCreate() {
    super.onCreate()
    createNotificationChannel()
  }

  override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
    val url = intent?.getStringExtra(EXTRA_URL)?.trim().orEmpty()
    val fileName = intent?.getStringExtra(EXTRA_FILE_NAME)?.trim().orEmpty()
    if (url.isEmpty() || fileName.isEmpty()) {
      Log.w(TAG, "missing url or fileName, stop")
      stopSelf(startId)
      return START_NOT_STICKY
    }

    cancelled.set(false)
    val notification = buildProgressNotification(-1, 0, -1)
    try {
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
        startForeground(
            PROGRESS_NOTIFICATION_ID,
            notification,
            ServiceInfo.FOREGROUND_SERVICE_TYPE_DATA_SYNC,
        )
      } else {
        startForeground(PROGRESS_NOTIFICATION_ID, notification)
      }
    } catch (e: Exception) {
      Log.e(TAG, "startForeground failed", e)
      stopSelf(startId)
      return START_NOT_STICKY
    }

    worker?.interrupt()
    worker =
        Thread({ download(url, fileName, startId) }, "apk-download").apply { start() }
    return START_NOT_STICKY
  }

  override fun onDestroy() {
    cancelled.set(true)
    worker?.interrupt()
    super.onDestroy()
  }

  private fun download(url: String, fileName: String, startId: Int) {
    val safeFileName = File(fileName).name.ifEmpty { "update.apk" }
    val dir = getExternalFilesDir("updates") ?: File(filesDir, "updates")
    if (!dir.exists() && !dir.mkdirs()) {
      fail("无法创建下载目录，请检查存储空间", startId)
      return
    }
    dir.listFiles()?.forEach { file ->
      if (file.isFile && file.name != safeFileName) {
        file.delete()
      }
    }
    val target = File(dir, safeFileName)
    val part = File(dir, "$safeFileName.part")
    if (part.exists()) {
      part.delete()
    }

    var connection: HttpURLConnection? = null
    try {
      val parsed = URL(url)
      if (!parsed.protocol.equals("https", ignoreCase = true)) {
        throw IllegalArgumentException("只支持 HTTPS 下载地址")
      }
      connection =
          (parsed.openConnection() as HttpURLConnection).apply {
            connectTimeout = CONNECT_TIMEOUT_MS
            readTimeout = READ_TIMEOUT_MS
            instanceFollowRedirects = true
            setRequestProperty("Accept", "*/*")
            setRequestProperty("User-Agent", "ShiguangUpdater/2.4.1")
          }
      val code = connection.responseCode
      Log.d(TAG, "http=$code total=${connection.contentLengthLong} url=$url")
      if (code !in 200..299) {
        throw IllegalStateException("下载服务器返回 HTTP $code")
      }
      val total = connection.contentLengthLong
      connection.inputStream.use { input ->
        part.outputStream().use { output ->
          val buffer = ByteArray(BUFFER_SIZE)
          var downloaded = 0L
          var lastPercent = -2
          var lastNotifyAt = 0L
          while (true) {
            if (cancelled.get() || Thread.currentThread().isInterrupted) {
              throw InterruptedException("下载已取消")
            }
            val read = input.read(buffer)
            if (read == -1) {
              break
            }
            output.write(buffer, 0, read)
            downloaded += read
            val percent = if (total > 0) ((downloaded * 100) / total).toInt() else -1
            val now = System.currentTimeMillis()
            if (percent != lastPercent || now - lastNotifyAt >= 1000) {
              lastPercent = percent
              lastNotifyAt = now
              notifyProgress(percent, downloaded, total)
            }
          }
          output.flush()
        }
      }
      if (total > 0 && part.length() != total) {
        throw IllegalStateException("下载不完整：${part.length()} / $total 字节")
      }
      val archive = packageManager.getPackageArchiveInfo(part.absolutePath, 0)
      if (archive?.packageName != packageName) {
        throw IllegalStateException("安装包校验失败，请稍后重试")
      }
      if (target.exists() && !target.delete()) {
        throw IllegalStateException("无法覆盖旧安装包")
      }
      if (!part.renameTo(target)) {
        throw IllegalStateException("保存安装包失败")
      }
      complete(target, startId)
    } catch (e: InterruptedException) {
      Log.d(TAG, "download cancelled")
      part.delete()
      stopForegroundCompat()
      stopSelf(startId)
    } catch (e: Exception) {
      Log.w(TAG, "download failed: ${e.javaClass.name}: ${e.message}", e)
      part.delete()
      fail(e.message ?: "下载失败，请稍后重试", startId)
    } finally {
      connection?.disconnect()
    }
  }

  private fun buildProgressNotification(
      percent: Int,
      downloaded: Long,
      total: Long,
  ): Notification {
    val contentIntent =
        PendingIntent.getActivity(
            this,
            0,
            Intent(this, MainActivity::class.java).apply {
              flags = Intent.FLAG_ACTIVITY_SINGLE_TOP or Intent.FLAG_ACTIVITY_CLEAR_TOP
            },
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
        )
    val detail =
        when {
          total > 0 -> "${formatBytes(downloaded)} / ${formatBytes(total)}"
          downloaded > 0 -> formatBytes(downloaded)
          else -> "正在连接下载服务器…"
        }
    return NotificationCompat.Builder(this, CHANNEL_ID)
        .setSmallIcon(android.R.drawable.stat_sys_download)
        .setContentTitle("正在下载拾光更新")
        .setContentText(detail)
        .setContentIntent(contentIntent)
        .setOnlyAlertOnce(true)
        .setOngoing(true)
        .setPriority(NotificationCompat.PRIORITY_LOW)
        .setProgress(100, percent.coerceIn(0, 100), percent < 0)
        .build()
  }

  private fun notifyProgress(percent: Int, downloaded: Long, total: Long) {
    notifySafely(
        PROGRESS_NOTIFICATION_ID,
        buildProgressNotification(percent, downloaded, total),
    )
  }

  private fun complete(file: File, startId: Int) {
    val installIntent = buildInstallIntent(file)
    val pendingIntent =
        PendingIntent.getActivity(
            this,
            1,
            installIntent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
        )
    val notification =
        NotificationCompat.Builder(this, CHANNEL_ID)
            .setSmallIcon(android.R.drawable.stat_sys_download_done)
            .setContentTitle("拾光更新已下载")
            .setContentText("点击安装新版本")
            .setContentIntent(pendingIntent)
            .setAutoCancel(true)
            .setOngoing(false)
            .setPriority(NotificationCompat.PRIORITY_DEFAULT)
            .build()
    stopForegroundCompat()
    notifySafely(COMPLETE_NOTIFICATION_ID, notification)
    // Android 10+ 后台启动 Activity 可能被系统拦截；通知点击是兜底路径。
    try {
      startActivity(installIntent)
    } catch (e: Exception) {
      Log.w(TAG, "无法自动打开安装器，等待用户点击通知", e)
    }
    stopSelf(startId)
  }

  private fun fail(message: String, startId: Int) {
    val contentIntent =
        PendingIntent.getActivity(
            this,
            0,
            Intent(this, MainActivity::class.java).apply {
              flags = Intent.FLAG_ACTIVITY_SINGLE_TOP or Intent.FLAG_ACTIVITY_CLEAR_TOP
            },
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
        )
    val notification =
        NotificationCompat.Builder(this, CHANNEL_ID)
            .setSmallIcon(android.R.drawable.stat_notify_error)
            .setContentTitle("更新下载失败")
            .setContentText(message)
            .setContentIntent(contentIntent)
            .setAutoCancel(true)
            .setOngoing(false)
            .setPriority(NotificationCompat.PRIORITY_DEFAULT)
            .build()
    stopForegroundCompat()
    notifySafely(FAILED_NOTIFICATION_ID, notification)
    stopSelf(startId)
  }

  private fun buildInstallIntent(file: File): Intent {
    val uri =
        FileProvider.getUriForFile(
            this,
            "$packageName.fileprovider",
            file,
        )
    return Intent(Intent.ACTION_VIEW).apply {
      setDataAndType(uri, "application/vnd.android.package-archive")
      addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION or Intent.FLAG_ACTIVITY_NEW_TASK)
    }
  }

  private fun stopForegroundCompat() {
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.N) {
      stopForeground(STOP_FOREGROUND_REMOVE)
    } else {
      @Suppress("DEPRECATION") stopForeground(true)
    }
  }

  private fun notifySafely(id: Int, notification: Notification) {
    try {
      NotificationManagerCompat.from(this).notify(id, notification)
    } catch (e: SecurityException) {
      // Android 13+ 未授予 POST_NOTIFICATIONS：下载继续，只是看不到通知。
      Log.w(TAG, "通知权限不可用，跳过通知 id=$id", e)
    }
  }

  private fun createNotificationChannel() {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) {
      return
    }
    val channel =
        NotificationChannel(CHANNEL_ID, "应用更新", NotificationManager.IMPORTANCE_LOW).apply {
          description = "下载新版本安装包时显示进度"
          setShowBadge(false)
        }
    getSystemService(NotificationManager::class.java).createNotificationChannel(channel)
  }

  private fun formatBytes(bytes: Long): String {
    if (bytes < 1024) {
      return "$bytes B"
    }
    val kb = bytes / 1024.0
    if (kb < 1024) {
      return String.format(Locale.US, "%.1f KB", kb)
    }
    val mb = kb / 1024.0
    return String.format(Locale.US, "%.1f MB", mb)
  }
}
