package com.bookkeepingapp

import android.content.Intent
import android.os.Bundle
import android.speech.RecognitionListener
import android.speech.RecognizerIntent
import android.speech.SpeechRecognizer
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.bridge.WritableMap
import com.facebook.react.modules.core.DeviceEventManagerModule

/**
 * 系统语音识别（Android SpeechRecognizer）。
 *
 * JS 侧:
 * - `startListening(locale)` 返回 Promise<string>，最终识别文本；
 * - `stopListening()` 手动结束（等最终结果）；
 * - `cancel()` 取消并 reject。
 *
 * 过程事件:
 * - `VoiceState`   { state: "listening" | "processing" | "idle" }
 * - `VoicePartial` { text }
 * - `VoiceLevel`   { level }
 * - `VoiceResult`  { text }
 *
 * 使用系统识别服务，不上传音频到自己的服务器；是否需要联网由设备/ROM 的
 * 语音服务决定。
 */
class VoiceModule(reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext) {

  companion object {
    const val NAME = "VoiceModule"
  }

  private var recognizer: SpeechRecognizer? = null
  private var pendingPromise: Promise? = null

  override fun getName(): String = NAME

  @ReactMethod
  fun startListening(locale: String, promise: Promise) {
    if (pendingPromise != null || recognizer != null) {
      promise.reject("E_BUSY", "语音识别正在进行")
      return
    }
    if (!SpeechRecognizer.isRecognitionAvailable(reactApplicationContext)) {
      promise.reject("E_UNAVAILABLE", "当前设备没有可用的语音识别服务")
      return
    }

    pendingPromise = promise
    reactApplicationContext.runOnUiQueueThread {
      try {
        val instance = SpeechRecognizer.createSpeechRecognizer(reactApplicationContext)
        recognizer = instance
        instance.setRecognitionListener(listener)
        val intent =
            Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH).apply {
              putExtra(
                  RecognizerIntent.EXTRA_LANGUAGE_MODEL,
                  RecognizerIntent.LANGUAGE_MODEL_FREE_FORM,
              )
              putExtra(RecognizerIntent.EXTRA_LANGUAGE, locale.ifBlank { "zh-CN" })
              putExtra(RecognizerIntent.EXTRA_PARTIAL_RESULTS, true)
              putExtra(RecognizerIntent.EXTRA_MAX_RESULTS, 3)
              putExtra(
                  RecognizerIntent.EXTRA_SPEECH_INPUT_COMPLETE_SILENCE_LENGTH_MILLIS,
                  1800,
              )
              putExtra(
                  RecognizerIntent.EXTRA_SPEECH_INPUT_POSSIBLY_COMPLETE_SILENCE_LENGTH_MILLIS,
                  1800,
              )
            }
        instance.startListening(intent)
        emitState("listening")
      } catch (e: Exception) {
        cleanup()
        promise.reject("E_START", e.message ?: "无法启动语音识别", e)
      }
    }
  }

  @ReactMethod
  fun stopListening() {
    reactApplicationContext.runOnUiQueueThread {
      if (recognizer != null) {
        emitState("processing")
        try {
          recognizer?.stopListening()
        } catch (e: Exception) {
          // 忽略：等 onError/onResults 收尾
        }
      }
    }
  }

  @ReactMethod
  fun cancel() {
    reactApplicationContext.runOnUiQueueThread {
      val promise = pendingPromise
      try {
        recognizer?.cancel()
      } catch (e: Exception) {
        // 忽略
      }
      cleanup()
      promise?.reject("E_CANCELLED", "语音识别已取消")
      emitState("idle")
    }
  }

  private val listener =
      object : RecognitionListener {
        override fun onReadyForSpeech(params: Bundle?) {
          emitState("listening")
        }

        override fun onBeginningOfSpeech() {}

        override fun onRmsChanged(rmsdB: Float) {
          val payload = Arguments.createMap()
          payload.putDouble("level", rmsdB.toDouble())
          emit("VoiceLevel", payload)
        }

        override fun onBufferReceived(buffer: ByteArray?) {}

        override fun onEndOfSpeech() {
          emitState("processing")
        }

        override fun onError(error: Int) {
          val promise = pendingPromise
          cleanup()
          val message =
              when (error) {
                SpeechRecognizer.ERROR_AUDIO -> "录音出错，请重试"
                SpeechRecognizer.ERROR_CLIENT -> "语音识别被取消"
                SpeechRecognizer.ERROR_INSUFFICIENT_PERMISSIONS -> "没有麦克风权限"
                SpeechRecognizer.ERROR_NETWORK -> "语音识别网络异常"
                SpeechRecognizer.ERROR_NETWORK_TIMEOUT -> "语音识别网络超时"
                SpeechRecognizer.ERROR_NO_MATCH -> "没有听清，请再说一次"
                SpeechRecognizer.ERROR_RECOGNIZER_BUSY -> "语音识别忙，请稍后重试"
                SpeechRecognizer.ERROR_SERVER -> "语音服务异常，请稍后重试"
                SpeechRecognizer.ERROR_SPEECH_TIMEOUT -> "没有检测到语音"
                else -> "语音识别失败，请重试"
              }
          promise?.reject("E_ASR", message)
          emitState("idle")
        }

        override fun onResults(results: Bundle?) {
          val text =
              results
                  ?.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION)
                  ?.firstOrNull()
                  ?.trim()
                  .orEmpty()
          val promise = pendingPromise
          cleanup()
          if (text.isNotEmpty()) {
            val payload = Arguments.createMap()
            payload.putString("text", text)
            emit("VoiceResult", payload)
            promise?.resolve(text)
          } else {
            promise?.reject("E_EMPTY", "没有识别到内容，请再说一次")
          }
          emitState("idle")
        }

        override fun onPartialResults(partialResults: Bundle?) {
          val text =
              partialResults
                  ?.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION)
                  ?.firstOrNull()
                  ?.trim()
                  .orEmpty()
          if (text.isNotEmpty()) {
            val payload = Arguments.createMap()
            payload.putString("text", text)
            emit("VoicePartial", payload)
          }
        }

        override fun onEvent(eventType: Int, params: Bundle?) {}
      }

  private fun cleanup() {
    try {
      recognizer?.destroy()
    } catch (e: Exception) {
      // 忽略销毁异常
    }
    recognizer = null
    pendingPromise = null
  }

  private fun emitState(state: String) {
    val payload = Arguments.createMap()
    payload.putString("state", state)
    emit("VoiceState", payload)
  }

  private fun emit(event: String, payload: WritableMap) {
    if (!reactApplicationContext.hasActiveReactInstance()) {
      return
    }
    reactApplicationContext
        .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
        .emit(event, payload)
  }
}
