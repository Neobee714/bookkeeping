import NetInfo, { type NetInfoState } from '@react-native-community/netinfo';

type Listener = (online: boolean) => void;

let online = true;
const listeners = new Set<Listener>();

function deriveOnline(state: NetInfoState): boolean {
  if (state.isConnected === false) {
    return false;
  }
  if (state.isInternetReachable === false) {
    return false;
  }
  return true;
}

function update(next: boolean): void {
  if (next === online) {
    return;
  }
  online = next;
  listeners.forEach((listener) => listener(next));
}

/** 当前是否在线（乐观默认 true，启动后由 NetInfo 校正）。 */
export function isOnlineNow(): boolean {
  return online;
}

export function subscribeNetwork(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** 启动网络监听；返回取消函数（在 App 根级 useEffect 里调用一次）。 */
export function startNetworkWatcher(): () => void {
  const unsubscribe = NetInfo.addEventListener((state) => {
    update(deriveOnline(state));
  });
  NetInfo.fetch()
    .then((state) => update(deriveOnline(state)))
    .catch(() => undefined);
  return unsubscribe;
}
