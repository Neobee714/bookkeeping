import { App } from '@capacitor/app';
import { Capacitor } from '@capacitor/core';
import { Directory, Filesystem } from '@capacitor/filesystem';
import { FileOpener } from '@capawesome-team/capacitor-file-opener';

import client from '@/api/client';
import type { ApiResponse } from '@/types';

interface LatestApkData {
  has_update: boolean;
  version?: string;
  url?: string;
  checksum?: string;
  size?: number;
  changelog?: string;
  released_at?: string;
}

interface PendingApkUpdate {
  version: string;
  changelog?: string;
  size?: number;
  url: string;
  checksum?: string;
}

export interface ApkUpdateInfo {
  version: string;
  changelog?: string;
  size?: number;
}

export interface ApkInstallResult {
  ok: boolean;
  error?: string;
}

const APK_MIME_TYPE = 'application/vnd.android.package-archive';
const APK_FILENAME_PREFIX = 'app-release-';

let started = false;
let working = false;
let pendingUpdate: PendingApkUpdate | null = null;
const listeners = new Set<(info: ApkUpdateInfo | null) => void>();

function emit(): void {
  const info: ApkUpdateInfo | null = pendingUpdate
    ? {
        version: pendingUpdate.version,
        changelog: pendingUpdate.changelog,
        size: pendingUpdate.size,
      }
    : null;
  listeners.forEach((listener) => listener(info));
}

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  const chunkSize = 0x8000;
  for (let index = 0; index < bytes.length; index += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(index, index + chunkSize));
  }
  return btoa(binary);
}

async function sha256Hex(buffer: ArrayBuffer): Promise<string | null> {
  try {
    const digest = await crypto.subtle.digest('SHA-256', buffer);
    return [...new Uint8Array(digest)]
      .map((byte) => byte.toString(16).padStart(2, '0'))
      .join('');
  } catch {
    return null;
  }
}

export function subscribeApkUpdate(
  listener: (info: ApkUpdateInfo | null) => void,
): () => void {
  listeners.add(listener);
  listener(pendingUpdate ? { ...pendingUpdate } : null);
  return () => {
    listeners.delete(listener);
  };
}

export function dismissApkUpdate(): void {
  pendingUpdate = null;
  emit();
}

async function downloadApk(
  update: PendingApkUpdate,
): Promise<{ ok: true; path: string } | { ok: false; error: string }> {
  let response: Response;
  try {
    response = await fetch(update.url);
  } catch (err) {
    console.warn('[apkUpdate] fetch failed', update.url, err);
    return { ok: false, error: '无法连接更新服务器，请检查网络' };
  }
  if (!response.ok) {
    return { ok: false, error: `下载失败（HTTP ${response.status}）` };
  }
  let buffer: ArrayBuffer;
  try {
    buffer = await response.arrayBuffer();
  } catch {
    return { ok: false, error: '下载数据读取失败，请重试' };
  }

  if (update.checksum) {
    const digest = await sha256Hex(buffer);
    if (digest && digest.toLowerCase() !== update.checksum.toLowerCase()) {
      console.warn('[apkUpdate] checksum mismatch, abort install');
      return { ok: false, error: '更新包校验失败，请重试' };
    }
  }

  const filename = `${APK_FILENAME_PREFIX}${update.version}.apk`;
  try {
    await Filesystem.writeFile({
      path: filename,
      data: arrayBufferToBase64(buffer),
      directory: Directory.Cache,
    });
    const uri = await Filesystem.getUri({ path: filename, directory: Directory.Cache });
    return { ok: true, path: uri.uri };
  } catch (err) {
    console.warn('[apkUpdate] write failed', err);
    return { ok: false, error: '更新包保存失败，请重试' };
  }
}

export async function installApkUpdate(): Promise<ApkInstallResult> {
  const update = pendingUpdate;
  if (!update || working) {
    return { ok: false, error: '没有待更新的版本' };
  }
  working = true;
  try {
    const result = await downloadApk(update);
    if (!result.ok) {
      return result;
    }
    try {
      await FileOpener.openFile({ path: result.path, mimeType: APK_MIME_TYPE });
    } catch (err) {
      console.warn('[apkUpdate] open failed', err);
      return { ok: false, error: '打开安装器失败，请检查"允许安装未知应用"设置' };
    }
    return { ok: true };
  } catch (err) {
    console.warn('[apkUpdate] install failed', err);
    return { ok: false, error: '更新失败，请重试' };
  } finally {
    working = false;
  }
}

/**
 * Check for a newer native APK release once per app launch (native only).
 * When available, exposes the update through listeners so the UI can prompt.
 * Downloading/installing only happens after the user confirms.
 */
export async function initApkUpdates(): Promise<void> {
  if (started || !Capacitor.isNativePlatform()) {
    return;
  }
  started = true;

  let currentVersion: string | null = null;
  try {
    const info = await App.getInfo();
    currentVersion = info.version ?? null;
  } catch {
    // Ignore; the server treats a missing current version as "update available".
  }

  try {
    const response = await client.get<ApiResponse<LatestApkData>>('/app-updates/apk/latest', {
      params: currentVersion ? { current: currentVersion } : undefined,
    });
    const data = response.data?.data;
    if (!response.data.success || !data?.has_update || !data.version || !data.url) {
      return;
    }
    pendingUpdate = {
      version: data.version,
      changelog: data.changelog,
      size: data.size,
      url: data.url,
      checksum: data.checksum,
    };
    emit();
  } catch (err) {
    console.warn('[apkUpdate] check failed', err);
  }
}
