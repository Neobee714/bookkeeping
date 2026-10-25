package com.bookkeepingapp

import com.facebook.react.ReactPackage
import com.facebook.react.bridge.NativeModule
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.uimanager.ViewManager

/** 注册 [VoiceModule]（系统语音识别），供 MainApplication 手动添加。 */
class VoicePackage : ReactPackage {

  @Suppress("DEPRECATION") // 传统 NativeModule 注册路径（新架构经 interop 自动兼容）
  override fun createNativeModules(
      reactContext: ReactApplicationContext,
  ): List<NativeModule> = listOf(VoiceModule(reactContext))

  override fun createViewManagers(
      reactContext: ReactApplicationContext,
  ): List<ViewManager<in Nothing, in Nothing>> = emptyList()
}
