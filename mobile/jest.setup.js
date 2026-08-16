/**
 * Jest 全局 mock:
 * - AsyncStorage / react-native-keychain 均用内存 stub,
 *   避免原生模块缺失导致测试失败。
 */

jest.mock('@react-native-async-storage/async-storage', () => {
  const store = new Map();
  return {
    getItem: jest.fn(async (key) => (store.has(key) ? store.get(key) : null)),
    setItem: jest.fn(async (key, value) => {
      store.set(key, value);
    }),
    removeItem: jest.fn(async (key) => {
      store.delete(key);
    }),
    clear: jest.fn(async () => {
      store.clear();
    }),
  };
});

jest.mock('react-native-keychain', () => {
  const store = new Map();
  return {
    setGenericPassword: jest.fn(async (username, password, options) => {
      const service = (options && options.service) || 'default';
      store.set(service, { username, password });
      return { service, storage: 'mock' };
    }),
    getGenericPassword: jest.fn(async (options) => {
      const service = (options && options.service) || 'default';
      const entry = store.get(service);
      return entry ? { ...entry, service, storage: 'mock' } : false;
    }),
    resetGenericPassword: jest.fn(async (options) => {
      const service = (options && options.service) || 'default';
      return store.delete(service);
    }),
  };
});
