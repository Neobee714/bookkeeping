# Add project specific ProGuard rules here.
# By default, the flags in this file are appended to flags specified
# in /usr/local/Cellar/android-sdk/24.3.3/tools/proguard/proguard-android.txt
# You can edit the include path and order by changing the proguardFiles
# directive in build.gradle.
#
# For more details, see
#   http://developer.android.com/guide/developing/tools/proguard.html

# Add any project specific keep options here:

# ---- 拾光 v0.20：R8 启用后保留 RN 反射/JNI 调用面 ----
# @ReactMethod 由 RN 通过反射按名调用，不能被重命名或裁剪
-keepclasseswithmembers class * { @com.facebook.react.bridge.ReactMethod <methods>; }
-keepclasseswithmembers class * { @com.facebook.react.bridge.ReactConstant <methods>; }
-keep class com.bookkeepingapp.VoiceModule { *; }
-keep class com.bookkeepingapp.VoicePackage { *; }
-keep class com.bookkeepingapp.UpdaterModule { *; }
-keep class com.bookkeepingapp.UpdaterPackage { *; }
# 前台服务/安装器由 Manifest 与 PendingIntent 显式引用，双保险
-keep class com.bookkeepingapp.ApkDownloadService { *; }
