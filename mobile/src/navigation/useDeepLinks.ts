import { useEffect } from 'react';
import { Linking } from 'react-native';

import { parseIntentUrl, useIntentStore } from '../store/intentStore';

/**
 * 把系统深链（桌面快捷方式 / `am start -d bookkeeping://…`）收进 intentStore。
 * 冷启动用 getInitialURL，运行中用 url 事件（MainActivity 是 singleTask，
 * 新意图走 onNewIntent，RN 的 Linking 会转成 url 事件）。
 */
export function useDeepLinks(): void {
  useEffect(() => {
    let cancelled = false;

    Linking.getInitialURL()
      .then((url) => {
        if (cancelled) {
          return;
        }
        const action = parseIntentUrl(url);
        if (action) {
          useIntentStore.getState().push(action);
        }
      })
      .catch(() => {
        // 读不到 initialURL 不影响手动记账，静默忽略。
      });

    const subscription = Linking.addEventListener('url', ({ url }) => {
      const action = parseIntentUrl(url);
      if (action) {
        useIntentStore.getState().push(action);
      }
    });

    return () => {
      cancelled = true;
      subscription.remove();
    };
  }, []);
}
