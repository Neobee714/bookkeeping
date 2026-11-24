import { NativeModules, Platform } from 'react-native';

/** 选择账单文件后拿到的本地副本（file://），位于 App 缓存目录。 */
export interface PickedBillFile {
  /** file:// 开头的绝对路径，可直接交给 FormData 上传。 */
  path: string;
  /** 原始文件名（如「微信支付账单(20261023-20261122).zip」）。 */
  name: string;
  /** 字节数。 */
  size: number;
}

interface BillPickerNativeModule {
  pickBillFile(): Promise<PickedBillFile>;
}

const nativeModule = NativeModules.BillPickerModule as
  | BillPickerNativeModule
  | undefined;

/** 原生模块给出的错误带 code（E_CANCELLED / E_UNSUPPORTED / ...）。 */
export interface BillPickerError extends Error {
  code?: string;
}

/**
 * 打开系统文件选择器，选一份 zip / xlsx / csv 账单。
 *
 * 用户取消时 Promise 以 `code = 'E_CANCELLED'` 拒绝，调用方静默忽略即可；
 * 选中的 content:// 已由原生侧复制到缓存目录，返回 file:// 路径。
 */
export async function pickBillFile(): Promise<PickedBillFile> {
  if (Platform.OS !== 'android' || !nativeModule) {
    const error = new Error(
      '当前平台不支持选择账单文件，请在 Android 手机上使用',
    ) as BillPickerError;
    error.code = 'E_UNAVAILABLE';
    throw error;
  }

  const picked = await nativeModule.pickBillFile();
  if (!picked?.path) {
    const error = new Error('没有拿到文件路径，请重新选择') as BillPickerError;
    error.code = 'E_EMPTY';
    throw error;
  }
  return picked;
}
