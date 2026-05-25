import { App } from '@capacitor/app';
import { Capacitor } from '@capacitor/core';
import { CapacitorUpdater, type BundleInfo } from '@capgo/capacitor-updater';

import client from '@/api/client';
import type { ApiResponse } from '@/types';

interface LatestReleaseData {
  has_update: boolean;
  version?: string;
  url?: string;
  checksum?: string;
  size?: number;
  changelog?: string;
  released_at?: string;
}

const LAST_SEEN_VERSION_KEY = 'app_update_last_seen_version';
const PENDING_CHANGELOG_KEY = 'app_update_pending_changelog';

interface PendingChangelogRecord {
  version: string;
  changelog: string;
}

export interface UpdateReadyInfo {
  version: string;
}

let pendingSwap: BundleInfo | null = null;
let pendingReadyInfo: UpdateReadyInfo | null = null;
let started = false;
const readyListeners = new Set<(info: UpdateReadyInfo | null) => void>();

function emitReadyInfo(): void {
  readyListeners.forEach((listener) => listener(pendingReadyInfo));
}

function shouldRunNative(): boolean {
  return Capacitor.isNativePlatform();
}

async function getCurrentVersion(): Promise<string | null> {
  try {
    const bundle = await CapacitorUpdater.current();
    if (bundle?.version) {
      return bundle.version;
    }
    const info = await App.getInfo();
    return info.version ?? null;
  } catch {
    return null;
  }
}

async function fetchLatest(currentVersion: string | null): Promise<LatestReleaseData | null> {
  try {
    const response = await client.get<ApiResponse<LatestReleaseData>>('/app-updates/latest', {
      params: currentVersion ? { current: currentVersion } : undefined,
    });
    if (!response.data.success) {
      return null;
    }
    return response.data.data;
  } catch {
    return null;
  }
}

async function downloadBundle(latest: LatestReleaseData): Promise<BundleInfo | null> {
  if (!latest.version || !latest.url || !latest.checksum) {
    return null;
  }
  try {
    return await CapacitorUpdater.download({
      version: latest.version,
      url: latest.url,
      checksum: latest.checksum,
    });
  } catch (err) {
    console.warn('[appUpdate] download failed', err);
    return null;
  }
}

function stashPendingChangelog(record: PendingChangelogRecord): void {
  try {
    localStorage.setItem(PENDING_CHANGELOG_KEY, JSON.stringify(record));
  } catch {
    // ignore storage errors
  }
}

export function subscribeUpdateReady(
  listener: (info: UpdateReadyInfo | null) => void,
): () => void {
  readyListeners.add(listener);
  listener(pendingReadyInfo);
  return () => {
    readyListeners.delete(listener);
  };
}

export function dismissUpdateReady(): void {
  pendingReadyInfo = null;
  emitReadyInfo();
}

export async function applyPendingUpdate(): Promise<boolean> {
  if (!pendingSwap) {
    return false;
  }

  const bundle = pendingSwap;
  pendingSwap = null;
  pendingReadyInfo = null;
  emitReadyInfo();

  try {
    await CapacitorUpdater.set({ id: bundle.id });
    window.location.reload();
    return true;
  } catch (err) {
    console.warn('[appUpdate] set bundle failed', err);
    pendingSwap = bundle;
    pendingReadyInfo = { version: bundle.version ?? '新版本' };
    emitReadyInfo();
    return false;
  }
}

export function consumePendingChangelog(): PendingChangelogRecord | null {
  try {
    const raw = localStorage.getItem(PENDING_CHANGELOG_KEY);
    if (!raw) {
      return null;
    }
    const parsed = JSON.parse(raw) as PendingChangelogRecord;
    if (!parsed?.version) {
      return null;
    }
    const seenVersion = localStorage.getItem(LAST_SEEN_VERSION_KEY);
    if (seenVersion === parsed.version) {
      localStorage.removeItem(PENDING_CHANGELOG_KEY);
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export function markChangelogSeen(version: string): void {
  try {
    localStorage.setItem(LAST_SEEN_VERSION_KEY, version);
    localStorage.removeItem(PENDING_CHANGELOG_KEY);
  } catch {
    // ignore
  }
}

/**
 * Kick off OTA update flow. Safe to call multiple times; only first invocation runs.
 * - Notifies native plugin the current bundle works (prevents rollback on next launch).
 * - Polls latest release; if new version available, downloads in background.
 * - When app moves to background, swaps to the new bundle (takes effect on next launch).
 * - Persists changelog so we can show a notice on first launch of the new version.
 */
export async function initAppUpdates(): Promise<void> {
  if (started || !shouldRunNative()) {
    return;
  }
  started = true;

  try {
    await CapacitorUpdater.notifyAppReady();
  } catch (err) {
    console.warn('[appUpdate] notifyAppReady failed', err);
  }

  App.addListener('appStateChange', (state) => {
    if (state.isActive || !pendingSwap) {
      return;
    }
    const bundle = pendingSwap;
    pendingSwap = null;
    pendingReadyInfo = null;
    emitReadyInfo();
    CapacitorUpdater.set({ id: bundle.id }).catch((err) => {
      console.warn('[appUpdate] set bundle failed', err);
    });
  });

  const currentVersion = await getCurrentVersion();
  const latest = await fetchLatest(currentVersion);
  if (!latest || !latest.has_update) {
    return;
  }

  const bundle = await downloadBundle(latest);
  if (!bundle) {
    return;
  }

  pendingSwap = bundle;
  pendingReadyInfo = { version: latest.version ?? bundle.version ?? '新版本' };
  emitReadyInfo();
  if (latest.version && latest.changelog !== undefined) {
    stashPendingChangelog({
      version: latest.version,
      changelog: latest.changelog,
    });
  }
}
