import { create } from 'zustand';

/** 桌面快捷方式 / 深链能带进来的动作。 */
export type AppIntent = 'add' | 'voice' | 'agent';

/**
 * 深链意图的存活时间：快捷方式冷启动到登录态恢复最多几秒，
 * 超过 1 分钟还没被消费说明是陈旧意图（比如停在登录页），丢掉以免稍后突然弹层。
 */
export const INTENT_TTL_MS = 60_000;

const VALID: readonly AppIntent[] = ['add', 'voice', 'agent'];

/**
 * 解析 `bookkeeping://add` / `bookkeeping://voice` / `bookkeeping://agent`。
 * 只认这三个动作，其余（含大小写变体之外的形式）一律返回 null，
 * 避免外部应用随便拼一个 URL 就把弹层拉起来。
 */
export function parseIntentUrl(url: string | null | undefined): AppIntent | null {
  if (!url) {
    return null;
  }
  const match = /^bookkeeping:\/\/([a-z]+)\/?$/i.exec(url.trim());
  if (!match) {
    return null;
  }
  const action = match[1].toLowerCase() as AppIntent;
  return VALID.includes(action) ? action : null;
}

export function isIntentFresh(at: number, now: number = Date.now()): boolean {
  return now - at >= 0 && now - at <= INTENT_TTL_MS;
}

interface IntentState {
  /** 尚未被页面消费的动作；带上产生时间用于过期判断。 */
  pending: { action: AppIntent; at: number } | null;
  push: (action: AppIntent) => void;
  /** 若 pending 属于 actions 且未过期，则取走并返回它（同时清空）。 */
  take: (actions: readonly AppIntent[], now?: number) => AppIntent | null;
}

export const useIntentStore = create<IntentState>((set, get) => ({
  pending: null,
  push: (action) => set({ pending: { action, at: Date.now() } }),
  take: (actions, now = Date.now()) => {
    const pending = get().pending;
    if (!pending) {
      return null;
    }
    if (!isIntentFresh(pending.at, now)) {
      set({ pending: null });
      return null;
    }
    if (!actions.includes(pending.action)) {
      return null;
    }
    set({ pending: null });
    return pending.action;
  },
}));
