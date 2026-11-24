package com.bookkeepingapp

import android.app.Activity
import android.content.Intent
import android.net.Uri
import android.provider.OpenableColumns
import com.facebook.react.bridge.ActivityEventListener
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.bridge.WritableMap
import java.io.File
import java.io.FileOutputStream
import java.util.Locale

/**
 * 系统文件选择器（Android Storage Access Framework）。
 *
 * JS 侧：`pickBillFile()` 返回 Promise<{path, name, size}>。
 * 用户取消时以 E_CANCELLED reject（调用方静默处理）；选中的 content:// 会被
 * 复制到 cacheDir/bill_import/，路径转成 file:// 供 FormData 上传——RN 的
 * multipart 上传需要真实文件路径，content:// 无法直接读取。
 *
 * 只接受 zip / xlsx / csv（微信、支付宝账单格式），避免选错文件后再白跑一趟
 * 服务端识别。
 */
class BillPickerModule(reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext), ActivityEventListener {

  companion object {
    const val NAME = "BillPickerModule"

    private const val REQUEST_PICK_BILL = 4721
    private const val CACHE_DIR_NAME = "bill_import"
    private const val MAX_SIZE_BYTES = 80L * 1024 * 1024
    private const val CACHE_TTL_MS = 24 * 60 * 60 * 1000L

    /** 账单文件常见 MIME；部分国产文件管理器给 zip 报 octet-stream。 */
    private val MIME_TYPES =
        arrayOf(
            "application/zip",
            "application/x-zip-compressed",
            "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            "application/vnd.ms-excel",
            "text/csv",
            "text/comma-separated-values",
            "application/octet-stream",
        )

    private val ALLOWED_EXTENSIONS = setOf("zip", "xlsx", "csv")
  }

  private var pendingPromise: Promise? = null

  init {
    reactApplicationContext.addActivityEventListener(this)
  }

  override fun getName(): String = NAME

  @ReactMethod
  fun pickBillFile(promise: Promise) {
    if (pendingPromise != null) {
      promise.reject("E_BUSY", "正在选择文件，请稍候")
      return
    }
    val activity = reactApplicationContext.currentActivity
    if (activity == null) {
      promise.reject("E_NO_ACTIVITY", "页面未就绪，请稍后再试")
      return
    }

    val intent =
        Intent(Intent.ACTION_OPEN_DOCUMENT).apply {
          addCategory(Intent.CATEGORY_OPENABLE)
          type = "*/*"
          putExtra(Intent.EXTRA_MIME_TYPES, MIME_TYPES)
        }

    pendingPromise = promise
    try {
      activity.startActivityForResult(intent, REQUEST_PICK_BILL)
    } catch (e: Exception) {
      pendingPromise = null
      promise.reject("E_START", e.message ?: "无法打开文件选择器", e)
    }
  }

  override fun onActivityResult(
      activity: Activity,
      requestCode: Int,
      resultCode: Int,
      data: Intent?,
  ) {
    if (requestCode != REQUEST_PICK_BILL) {
      return
    }
    val promise = pendingPromise ?: return
    pendingPromise = null

    val uri = if (resultCode == Activity.RESULT_OK) data?.data else null
    if (uri == null) {
      promise.reject("E_CANCELLED", "已取消选择")
      return
    }

    // 复制可能有大几十 MB，放后台线程，避免卡住 JS 线程。
    Thread({
          try {
            promise.resolve(copyToCache(uri))
          } catch (e: IllegalArgumentException) {
            promise.reject("E_UNSUPPORTED", e.message ?: "不支持的账单文件", e)
          } catch (e: Exception) {
            promise.reject("E_COPY", e.message ?: "读取文件失败，请重试", e)
          }
        }, "BillPickerCopy")
        .start()
  }

  override fun onNewIntent(intent: Intent) {
    // 单次选择不需要处理新的 Intent。
  }

  override fun invalidate() {
    reactApplicationContext.removeActivityEventListener(this)
    pendingPromise?.reject("E_CANCELLED", "页面已关闭")
    pendingPromise = null
    super.invalidate()
  }

  /** 把 content:// 复制到 cacheDir/bill_import/，返回 file:// 路径与文件信息。 */
  private fun copyToCache(uri: Uri): WritableMap {
    val resolver = reactApplicationContext.contentResolver
    var displayName = "bill"
    var declaredSize = -1L

    resolver
        .query(uri, arrayOf(OpenableColumns.DISPLAY_NAME, OpenableColumns.SIZE), null, null, null)
        ?.use { cursor ->
          if (cursor.moveToFirst()) {
            val nameIndex = cursor.getColumnIndex(OpenableColumns.DISPLAY_NAME)
            if (nameIndex >= 0) {
              cursor.getString(nameIndex)?.takeIf { it.isNotBlank() }?.let { displayName = it }
            }
            val sizeIndex = cursor.getColumnIndex(OpenableColumns.SIZE)
            if (sizeIndex >= 0 && !cursor.isNull(sizeIndex)) {
              declaredSize = cursor.getLong(sizeIndex)
            }
          }
        }

    displayName = displayName.trim().ifBlank { "bill" }
    val extension = displayName.substringAfterLast('.', "").lowercase(Locale.ROOT)
    if (extension !in ALLOWED_EXTENSIONS) {
      throw IllegalArgumentException("只支持 zip / xlsx / csv 格式的账单文件")
    }
    if (declaredSize > MAX_SIZE_BYTES) {
      throw IllegalArgumentException("账单文件超过 80 MB，请检查是否选错了文件")
    }

    val dir = File(reactApplicationContext.cacheDir, CACHE_DIR_NAME)
    if (!dir.exists() && !dir.mkdirs()) {
      throw IllegalStateException("无法创建临时目录")
    }
    pruneExpired(dir)

    val target = File(dir, "${System.currentTimeMillis()}_${sanitizeName(displayName)}")
    var copied = 0L
    try {
      val input =
          resolver.openInputStream(uri) ?: throw IllegalStateException("无法读取所选文件")
      input.use { stream ->
        FileOutputStream(target).use { output ->
          val buffer = ByteArray(DEFAULT_BUFFER_SIZE)
          while (true) {
            val read = stream.read(buffer)
            if (read <= 0) {
              break
            }
            copied += read
            if (copied > MAX_SIZE_BYTES) {
              throw IllegalArgumentException("账单文件超过 80 MB，请检查是否选错了文件")
            }
            output.write(buffer, 0, read)
          }
          output.flush()
        }
      }
    } catch (e: Exception) {
      target.delete()
      throw e
    }

    if (copied == 0L) {
      target.delete()
      throw IllegalStateException("所选文件是空的")
    }

    return Arguments.createMap().apply {
      putString("path", "file://" + target.absolutePath)
      putString("name", displayName)
      putDouble("size", copied.toDouble())
    }
  }

  /** 去掉路径分隔符等非法字符，并保留扩展名；缓存文件只用于一次上传。 */
  private fun sanitizeName(raw: String): String {
    val safe = raw.replace(Regex("[\\\\/:*?\"<>|\\u0000-\\u001F]"), "_")
    val dot = safe.lastIndexOf('.')
    if (dot <= 0 || dot == safe.length - 1) {
      return safe.take(64)
    }
    val base = safe.substring(0, dot).take(48)
    val extension = safe.substring(dot + 1).take(8)
    return "$base.$extension"
  }

  /** 清理上次选择留下的临时文件，避免缓存目录无限增长。 */
  private fun pruneExpired(dir: File) {
    val cutoff = System.currentTimeMillis() - CACHE_TTL_MS
    dir.listFiles()?.forEach { file ->
      if (file.isFile && file.lastModified() < cutoff) {
        file.delete()
      }
    }
  }
}
