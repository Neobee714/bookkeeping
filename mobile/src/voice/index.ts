import { DeviceEventEmitter, NativeModules, Platform } from 'react-native';

/** 原生 VoiceModule（Android SpeechRecognizer）的 TS 声明。 */
interface VoiceNativeModule {
  startListening(locale: string): Promise<string>;
  stopListening(): void;
  cancel(): void;
}

const nativeVoice = NativeModules.VoiceModule as VoiceNativeModule | undefined;

export const isVoiceSupported = Platform.OS === 'android' && !!nativeVoice;

export interface VoiceEventHandlers {
  onPartial?: (text: string) => void;
  onState?: (state: string) => void;
  onLevel?: (level: number) => void;
}

/** 开始识别；Promise 在拿到最终转写时 resolve，失败/取消时 reject。 */
export function startVoiceListening(locale = 'zh-CN'): Promise<string> {
  if (!nativeVoice) {
    return Promise.reject(new Error('当前平台暂不支持语音识别'));
  }
  return nativeVoice.startListening(locale);
}

/** 手动结束录音，等待最终结果。 */
export function stopVoiceListening(): void {
  nativeVoice?.stopListening();
}

/** 取消并丢弃本次识别。 */
export function cancelVoiceListening(): void {
  nativeVoice?.cancel();
}

/** 订阅识别过程事件（部分转写、状态、音量）。 */
export function subscribeVoiceEvents(handlers: VoiceEventHandlers): () => void {
  const subscriptions = [
    DeviceEventEmitter.addListener('VoicePartial', (event: { text?: string }) => {
      if (event?.text) {
        handlers.onPartial?.(event.text);
      }
    }),
    DeviceEventEmitter.addListener('VoiceState', (event: { state?: string }) => {
      if (event?.state) {
        handlers.onState?.(event.state);
      }
    }),
    DeviceEventEmitter.addListener('VoiceLevel', (event: { level?: number }) => {
      if (typeof event?.level === 'number') {
        handlers.onLevel?.(event.level);
      }
    }),
  ];
  return () => {
    subscriptions.forEach((subscription) => subscription.remove());
  };
}
