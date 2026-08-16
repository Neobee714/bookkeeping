/**
 * OTA 更新检查:拉取远端更新清单(info.json)并做版本比较。
 *
 * 远端为 app.xyvora.me 静态托管,返回裸 JSON(非后端 success_response
 * 包裹格式),故不走统一 client,也避免依赖登录 token / 刷新拦截器。
 */
import axios from 'axios';

import { UPDATE_INFO_URL } from '../config';

/** 更新清单请求超时(毫秒):检查是轻量请求,短超时即可。 */
const UPDATE_TIMEOUT_MS = 10_000;

/** 远端更新清单(info.json)契约,与 docs/v0.2 ARCH.md「4. 数据与接口」对齐。 */
export interface UpdateInfo {
  version: string;
  size?: number;
  changelog?: string;
  apkUrl: string;
  /** 强制更新开关,缺省 false。 */
  force?: boolean;
  updatedAt?: string;
}

/** 版本段解析:X.Y.Z 三段;非法/缺失段按 0 处理(不抛异常)。 */
function parseVersion(value: string): number[] {
  const nums = value
    .split('.')
    .map((part) => (/^\d+$/.test(part) ? Number(part) : 0));
  while (nums.length < 3) {
    nums.push(0);
  }
  return nums.slice(0, 3);
}

/**
 * semver 比较(X.Y.Z 三段数字逐段比较)。
 * a > b 返回 1,a < b 返回 -1,相等返回 0;任意段非法/缺失按 0 处理,不抛异常。
 */
export function compareVersions(a: string, b: string): -1 | 0 | 1 {
  const pa = parseVersion(a);
  const pb = parseVersion(b);
  for (let i = 0; i < 3; i++) {
    if (pa[i] > pb[i]) {
      return 1;
    }
    if (pa[i] < pb[i]) {
      return -1;
    }
  }
  return 0;
}

/** 远端版本是否高于本地(有新版本)。 */
export function hasUpdate(localVersion: string, remote: UpdateInfo): boolean {
  return compareVersions(remote.version, localVersion) > 0;
}

/** 解析裸 JSON 为 UpdateInfo;契约字段不合法(version/apkUrl 非字符串)返回 null。 */
function parseUpdateInfo(data: unknown): UpdateInfo | null {
  if (typeof data !== 'object' || data === null) {
    return null;
  }
  const raw = data as Record<string, unknown>;
  if (typeof raw.version !== 'string' || typeof raw.apkUrl !== 'string') {
    return null;
  }
  const info: UpdateInfo = {
    version: raw.version,
    apkUrl: raw.apkUrl,
  };
  if (typeof raw.size === 'number' && Number.isFinite(raw.size)) {
    info.size = raw.size;
  }
  if (typeof raw.changelog === 'string') {
    info.changelog = raw.changelog;
  }
  if (typeof raw.updatedAt === 'string') {
    info.updatedAt = raw.updatedAt;
  }
  // force 缺省 false;非布尔值(老文件无此字段/异常值)一律按 false 处理。
  info.force = typeof raw.force === 'boolean' ? raw.force : false;
  return info;
}

/**
 * 拉取远端更新清单。
 * 独立 GET(不带 token、短超时 10s);网络/解析任何异常均返回 null,不抛错。
 */
export async function fetchUpdateInfo(): Promise<UpdateInfo | null> {
  try {
    const response = await axios.get<unknown>(UPDATE_INFO_URL, {
      timeout: UPDATE_TIMEOUT_MS,
    });
    return parseUpdateInfo(response.data);
  } catch {
    return null;
  }
}
