/**
 * 财报列表 / 详情冒烟测试：验证未读、空态与详情各区块的文案渲染。
 * 网络与导航全部 mock，不发真实请求。
 */
import React from 'react';
import ReactTestRenderer from 'react-test-renderer';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { fetchReportDetail, fetchReportSettings, fetchReports } from '../src/api/reports';
import { useThemeStore } from '../src/store/themeStore';
import ReportSettingsSheet from '../src/components/ReportSettingsSheet';
import ReportDetailScreen from '../src/screens/ReportDetailScreen';
import ReportsScreen from '../src/screens/ReportsScreen';

jest.mock('@react-navigation/native', () => ({
  useIsFocused: () => true,
  useNavigation: () => ({
    navigate: jest.fn(),
    goBack: jest.fn(),
    getParent: () => ({ navigate: jest.fn() }),
  }),
  useRoute: () => ({ params: { id: 12, label: '2026 年 10 月' } }),
}));

jest.mock('../src/api/reports', () => ({
  fetchReports: jest.fn(),
  fetchReportSettings: jest.fn(),
  fetchReportDetail: jest.fn(),
  updateReportSettings: jest.fn(),
  generateReportNow: jest.fn(),
  markReportRead: jest.fn(async () => ({
    id: 12,
    read_at: '2026-11-12T13:00:00+08:00',
  })),
  DEFAULT_REPORT_SETTINGS: {
    exists: false,
    enabled: false,
    kind: 'monthly',
    anchor_weekday: null,
    anchor_day: 1,
    anchor_hour: 9,
    next_run_at: null,
    last_period_end: null,
  },
}));

const mockedFetchReports = fetchReports as unknown as jest.Mock;
const mockedFetchSettings = fetchReportSettings as unknown as jest.Mock;
const mockedFetchDetail = fetchReportDetail as unknown as jest.Mock;

const settingsFixture = {
  exists: true,
  enabled: true,
  kind: 'monthly' as const,
  anchor_weekday: null,
  anchor_day: 1,
  anchor_hour: 9,
  next_run_at: '2026-12-01T09:00:00+08:00',
  last_period_end: '2026-10-31',
};

const itemFixture = {
  id: 12,
  kind: 'monthly' as const,
  label: '2026 年 10 月',
  period_start: '2026-10-01',
  period_end: '2026-10-31',
  generated_at: '2026-11-01T09:00:00+08:00',
  total_income: 8420,
  total_expense: 5559.5,
  balance: 2860.5,
  transaction_count: 68,
  read_at: null,
};

const detailFixture = {
  ...itemFixture,
  content: {
    headline: '10 月，你存下了 34%',
    total_income: 8420,
    total_expense: 5559.5,
    balance: 2860.5,
    savings_rate: 34,
    transaction_count: 68,
    active_days: 27,
    period_days: 31,
    daily_expense: 179.34,
    prev_label: '2026 年 9 月',
    prev: {
      total_income: 8600,
      total_expense: 5235,
      expense_delta_pct: 6.2,
      income_delta_pct: -2.1,
    },
    categories: [{ name: '餐饮', amount: 1683, share: 30.3 }],
    top_expenses: [
      { amount: 899, category: '购物', note: '羽绒服', date: '2026-10-21' },
    ],
    insights: ['餐饮花了 ¥1,683', '最大单笔是羽绒服'],
    merchants: [
      { name: '和府捞面', amount: 96, count: 3, avg: 32 },
      { name: '麦当劳', amount: 36, count: 2, avg: 18 },
      { name: '楼下粉店', amount: 30, count: 2, avg: 15 },
    ],
    items: [{ name: '面', amount: 130, count: 5, avg: 26 }],
    dining: { count: 12, amount: 312, avg: 26 },
    dining_insights: [
      '最常去 和府捞面，3 次共 ¥96',
      '最常吃 面，5 次共 ¥130',
      '餐饮 12 次，平均每次 ¥26',
    ],
    trend: {
      unit: 'week',
      points: [
        { label: 'W1', expense: 1120 },
        { label: 'W2', expense: 980 },
      ],
    },
  },
};

const metrics = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 44, left: 0, right: 0, bottom: 34 },
};

const renderScreen = async (element: React.ReactElement) => {
  let tree: ReactTestRenderer.ReactTestRenderer | undefined;
  await ReactTestRenderer.act(async () => {
    tree = ReactTestRenderer.create(
      <SafeAreaProvider initialMetrics={metrics}>{element}</SafeAreaProvider>,
    );
  });
  // 再冲一次微任务队列：确保 Promise.all 之后的 setState 落地
  await ReactTestRenderer.act(async () => undefined);
  return tree as ReactTestRenderer.ReactTestRenderer;
};

const flatten = (node: unknown): string => {
  if (node === null || node === undefined || typeof node === 'boolean') {
    return '';
  }
  if (Array.isArray(node)) {
    return node.map(flatten).join('');
  }
  if (typeof node === 'string' || typeof node === 'number') {
    return String(node);
  }
  const element = node as { props?: { children?: unknown } };
  return flatten(element.props?.children);
};

const textsOf = (tree: ReactTestRenderer.ReactTestRenderer): string[] =>
  tree.root
    .findAllByType('Text' as never)
    .map((node) => flatten(node.props.children))
    .filter((text) => text.length > 0);

beforeEach(() => {
  jest.clearAllMocks();
  mockedFetchSettings.mockResolvedValue(settingsFixture);
  mockedFetchReports.mockResolvedValue({
    unread_count: 1,
    total: 1,
    items: [itemFixture],
  });
  mockedFetchDetail.mockResolvedValue(detailFixture);
});

describe('ReportsScreen', () => {
  it('渲染规则卡、未读报告与结余', async () => {
    const tree = await renderScreen(<ReportsScreen />);
    const texts = textsOf(tree);

    expect(texts).toContain('财报');
    expect(texts).toContain('月报 · 每月 1 日 09:00');
    expect(texts).toContain('下次生成：12 月 1 日 09:00');
    expect(texts).toContain('2026 年 10 月');
    expect(texts.some((text) => text.includes('10.01 – 10.31 · 68 笔'))).toBe(
      true,
    );
    expect(texts.some((text) => text.includes('储蓄率 34%'))).toBe(true);
    expect(texts).toContain('+2,860.50');
    expect(texts.some((text) => text.includes('1 份未读'))).toBe(true);
  });

  it('空态给出「立即生成上一期」入口', async () => {
    mockedFetchReports.mockResolvedValue({
      unread_count: 0,
      total: 0,
      items: [],
    });
    const tree = await renderScreen(<ReportsScreen />);
    const texts = textsOf(tree);

    expect(texts).toContain('还没有财报');
    expect(texts).toContain('立即生成上一期');
  });

  it('接口失败且无缓存时展示错误态与重试，不崩溃', async () => {
    mockedFetchReports.mockRejectedValue(new Error('boom'));
    mockedFetchSettings.mockRejectedValue(new Error('boom'));
    const tree = await renderScreen(<ReportsScreen />);
    const texts = textsOf(tree);

    expect(texts).toContain('财报');
    expect(texts).toContain('财报加载失败');
    expect(texts).toContain('重试');
  });
});

describe('ReportDetailScreen', () => {
  it('渲染 headline、结余、环比、洞察、分布、趋势与最大单笔', async () => {
    const tree = await renderScreen(<ReportDetailScreen />);
    const texts = textsOf(tree);

    expect(texts).toContain('10 月，你存下了 34%');
    expect(texts).toContain('月报 · 2026 年 10 月');
    expect(texts).toContain('¥2,860.50');
    expect(texts).toContain('34%');
    expect(texts).toContain('+6.2%');
    expect(texts).toContain('-2.1%');
    expect(texts).toContain('本期洞察');
    expect(texts).toContain('餐饮花了 ¥1,683');
    expect(texts).toContain('吃喝');
    expect(texts).toContain('最常去 和府捞面，3 次共 ¥96');
    expect(texts).toContain('最常吃 面，5 次共 ¥130');
    expect(texts).toContain('常去的店');
    expect(texts).toContain('和府捞面');
    expect(texts).toContain('3 次 · 人均 ¥32.00');
    expect(texts).toContain('¥96.00');
    expect(texts.some((text) => text.includes('餐饮'))).toBe(true);
    expect(texts).toContain('每周支出');
    expect(texts).toContain('W1');
    expect(texts).toContain('羽绒服');
    expect(texts).toContain('-¥899.00');
    expect(
      texts.some((text) => text.includes('数据截至 10 月 31 日')),
    ).toBe(true);
  });

  it('旧报告缺少商家 / 吃喝字段时整卡隐藏，页面不崩', async () => {
    mockedFetchDetail.mockResolvedValue({
      ...detailFixture,
      content: {
        ...detailFixture.content,
        merchants: undefined,
        items: undefined,
        dining: undefined,
        dining_insights: undefined,
      },
    });
    const tree = await renderScreen(<ReportDetailScreen />);
    const texts = textsOf(tree);

    expect(texts).toContain('10 月，你存下了 34%');
    expect(texts).toContain('本期洞察');
    expect(texts).not.toContain('吃喝');
    expect(texts).not.toContain('常去的店');
  });
});

describe('ReportDetailScreen · 四套皮肤', () => {
  afterEach(async () => {
    await ReactTestRenderer.act(async () => {
      useThemeStore.setState({ skinId: 'aurora' });
    });
  });

  (['aurora', 'candy', 'neon', 'neu'] as const).forEach((skinId) => {
    it(`${skinId} 皮肤下列表与详情都可渲染`, async () => {
      await ReactTestRenderer.act(async () => {
        useThemeStore.setState({ skinId });
      });
      const listTexts = textsOf(await renderScreen(<ReportsScreen />));
      expect(listTexts).toContain('财报');
      expect(listTexts).toContain('月报 · 每月 1 日 09:00');
      expect(listTexts).toContain('2026 年 10 月');

      const detailTexts = textsOf(await renderScreen(<ReportDetailScreen />));
      expect(detailTexts).toContain('10 月，你存下了 34%');
      expect(detailTexts).toContain('¥2,860.50');
      expect(detailTexts).toContain('本期洞察');
      expect(detailTexts).toContain('吃喝');
      expect(detailTexts).toContain('常去的店');
      expect(detailTexts).toContain('最大单笔');
    });
  });
});

describe('ReportSettingsSheet', () => {
  it('打开时展示周期四段、日号、时点与保存 / 立即生成', async () => {
    const tree = await renderScreen(
      <ReportSettingsSheet
        visible
        settings={settingsFixture}
        online
        saving={false}
        generating={false}
        onClose={jest.fn()}
        onSave={jest.fn(async () => undefined)}
        onGenerateNow={jest.fn(async () => undefined)}
      />,
    );
    const texts = textsOf(tree);

    expect(texts).toContain('生成设置');
    expect(texts).toContain('周报');
    expect(texts).toContain('月报');
    expect(texts).toContain('季报');
    expect(texts).toContain('年报');
    expect(texts).toContain('09:00');
    expect(texts).toContain('08:00');
    expect(texts).toContain('保存');
    expect(texts).toContain('立即生成上一期看看');
    expect(texts.some((text) => text.includes('每月 1 日 09:00'))).toBe(true);
    expect(texts.some((text) => text.includes('覆盖上一个完整自然月'))).toBe(
      true,
    );
  });
});

describe('ReportSettingsSheet · 周报', () => {
  it('选周报时展示星期 chip 与每周节奏预览', async () => {
    const tree = await renderScreen(
      <ReportSettingsSheet
        visible
        settings={{
          ...settingsFixture,
          kind: 'weekly',
          anchor_weekday: 3,
          anchor_day: 1,
        }}
        online
        saving={false}
        generating={false}
        onClose={jest.fn()}
        onSave={jest.fn(async () => undefined)}
        onGenerateNow={jest.fn(async () => undefined)}
      />,
    );
    const texts = textsOf(tree);

    expect(texts).toContain('每周三 09:00');
    expect(texts).toContain('覆盖上一个完整自然周');
    expect(texts).toContain('每周一次 · 选星期几');
    expect(texts).toContain('一');
    expect(texts).toContain('日');
  });
});

describe('ReportSettingsSheet · 离线', () => {
  it('离线时给出只读提示（写操作置灰）', async () => {
    const tree = await renderScreen(
      <ReportSettingsSheet
        visible
        settings={settingsFixture}
        online={false}
        saving={false}
        generating={false}
        onClose={jest.fn()}
        onSave={jest.fn(async () => undefined)}
        onGenerateNow={jest.fn(async () => undefined)}
      />,
    );
    const texts = textsOf(tree);

    expect(texts.some((text) => text.includes('离线模式'))).toBe(true);
    expect(texts).toContain('保存');
  });
});
