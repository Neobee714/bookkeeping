import {
  INTENT_TTL_MS,
  isIntentFresh,
  parseIntentUrl,
  useIntentStore,
} from '../src/store/intentStore';

describe('parseIntentUrl', () => {
  it.each([
    ['bookkeeping://add', 'add'],
    ['bookkeeping://voice', 'voice'],
    ['bookkeeping://agent', 'agent'],
    ['bookkeeping://add/', 'add'],
    ['BOOKKEEPING://ADD', 'add'],
    ['  bookkeeping://voice  ', 'voice'],
  ])('识别 %s', (url, expected) => {
    expect(parseIntentUrl(url)).toBe(expected);
  });

  it.each([
    [null],
    [undefined],
    [''],
    ['bookkeeping://'],
    ['bookkeeping://delete'],
    ['https://api.neobee.top/health'],
    ['bookkeeping://add?x=1'],
    ['otherapp://add'],
  ])('拒绝 %s', (url) => {
    expect(parseIntentUrl(url)).toBeNull();
  });
});

describe('isIntentFresh', () => {
  it('1 分钟内有效，超过 TTL 或时间倒流则失效', () => {
    expect(isIntentFresh(1000, 1000)).toBe(true);
    expect(isIntentFresh(1000, 1000 + INTENT_TTL_MS)).toBe(true);
    expect(isIntentFresh(1000, 1000 + INTENT_TTL_MS + 1)).toBe(false);
    expect(isIntentFresh(5000, 1000)).toBe(false);
  });
});

describe('useIntentStore.take', () => {
  beforeEach(() => {
    useIntentStore.setState({ pending: null });
  });

  it('只取走自己关心的动作，其余留给别的页面', () => {
    useIntentStore.getState().push('agent');
    expect(useIntentStore.getState().take(['add', 'voice'])).toBeNull();
    expect(useIntentStore.getState().pending?.action).toBe('agent');
    expect(useIntentStore.getState().take(['agent'])).toBe('agent');
    expect(useIntentStore.getState().pending).toBeNull();
  });

  it('取走一次后不会重复触发', () => {
    useIntentStore.getState().push('add');
    expect(useIntentStore.getState().take(['add'])).toBe('add');
    expect(useIntentStore.getState().take(['add'])).toBeNull();
  });

  it('过期意图被丢弃而不是延后弹出', () => {
    useIntentStore.setState({ pending: { action: 'voice', at: 1000 } });
    expect(useIntentStore.getState().take(['voice'], 1000 + INTENT_TTL_MS + 1)).toBeNull();
    expect(useIntentStore.getState().pending).toBeNull();
  });
});
