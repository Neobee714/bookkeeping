/**
 * 图表支出分布三档：分类 / 商家 / 菜品。
 * 商家与菜品走 /stats/breakdown；菜品档给旧备注整理入口。
 */
import React from 'react';
import ReactTestRenderer from 'react-test-renderer';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';

import { fetchBreakdown } from '../src/api/stats';
import StatsScreen from '../src/screens/StatsScreen';
import { useAuthStore } from '../src/store/authStore';

const mockRootNavigate = jest.fn();

jest.mock('@react-navigation/native', () => ({
  useIsFocused: () => true,
  useNavigation: () => ({
    navigate: jest.fn(),
    getParent: () => ({ navigate: mockRootNavigate }),
  }),
}));

jest.mock('../src/api/reports', () => ({
  fetchReports: jest.fn(async () => ({
    unread_count: 0,
    total: 0,
    items: [],
  })),
}));

jest.mock('../src/api/stats', () => ({
  CATEGORY_COLORS: { 餐饮: '#FF9500' },
  fetchMonthlySummary: jest.fn(async () => ({
    month: '2026-11',
    total_income: 8000,
    total_expense: 1200,
    balance: 6800,
    transaction_count: 20,
    category_expenses: { 餐饮: 300 },
    note_breakdown: {},
  })),
  fetchPartnerMonthlySummary: jest.fn(),
  fetchMonthlyTrendSeries: jest.fn(async () => [
    { month: '2026-06', income: 0, expense: 100, balance: -100 },
  ]),
  fetchBreakdown: jest.fn(),
}));

const mockedFetchBreakdown = fetchBreakdown as unknown as jest.Mock;

const metrics = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 44, left: 0, right: 0, bottom: 34 },
};

const renderStats = async () => {
  let tree: ReactTestRenderer.ReactTestRenderer | undefined;
  await ReactTestRenderer.act(async () => {
    tree = ReactTestRenderer.create(
      <SafeAreaProvider initialMetrics={metrics}>
        <StatsScreen />
      </SafeAreaProvider>,
    );
  });
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

const pressByText = async (
  tree: ReactTestRenderer.ReactTestRenderer,
  text: string,
  occurrence = 0,
) => {
  const matches = tree.root
    .findAllByType('Text' as never)
    .filter((candidate) => flatten(candidate.props.children) === text);
  const node = matches[occurrence];
  if (!node) {
    throw new Error(`找不到文字：${text}`);
  }
  let current: ReactTestRenderer.ReactTestInstance | null = node;
  while (current && typeof current.props.onPress !== 'function') {
    current = current.parent;
  }
  if (!current) {
    throw new Error(`文字 ${text} 没有可点击的父节点`);
  }
  await ReactTestRenderer.act(async () => {
    current?.props.onPress();
  });
  await ReactTestRenderer.act(async () => undefined);
};

beforeEach(async () => {
  jest.clearAllMocks();
  await AsyncStorage.clear();
  useAuthStore.setState({
    user: {
      id: 7,
      username: 'tester',
      nickname: '测试',
      is_admin: false,
      partner_id: null,
      partner: null,
      partner_code: '',
      reg_invite_code: '',
      created_at: '2026-01-01T00:00:00+08:00',
    },
  });
});

describe('StatsScreen · 支出分布三档', () => {
  it('切到商家档调用 fetchBreakdown 并显示金额 / 次数 / 人均', async () => {
    mockedFetchBreakdown.mockResolvedValue({
      dimension: 'merchant',
      items: [
        { name: '和府捞面', amount: 96, count: 3, avg: 32 },
        { name: '麦当劳', amount: 36, count: 2, avg: 18 },
      ],
      legacy_note_count: 0,
    });
    const tree = await renderStats();
    await pressByText(tree, '商家');

    expect(mockedFetchBreakdown).toHaveBeenCalledWith(
      expect.objectContaining({ dimension: 'merchant', target: 'self' }),
    );
    const texts = textsOf(tree);
    expect(texts).toContain('和府捞面');
    expect(texts).toContain('¥96');
    expect(texts).toContain('3 次 · 人均 ¥32');
    expect(texts).toContain('仅统计「餐饮」；未填写「商家」的账单不计入');
  });

  it('切到菜品档显示旧备注整理入口并跳转 NoteCleanup', async () => {
    mockedFetchBreakdown.mockResolvedValue({
      dimension: 'item',
      items: [{ name: '面', amount: 130, count: 5, avg: 26 }],
      legacy_note_count: 3,
    });
    const tree = await renderStats();
    await pressByText(tree, '菜品');

    const texts = textsOf(tree);
    expect(texts).toContain('面');
    expect(texts).toContain('5 次 · 人均 ¥26');
    expect(
      texts.some((text) => text.includes('旧备注 3 条未整理 · 去整理')),
    ).toBe(true);

    await pressByText(
      tree,
      texts.find((text) => text.includes('去整理')) as string,
    );
    expect(mockRootNavigate).toHaveBeenCalledWith('NoteCleanup');
  });

  it('breakdown 失败时保留整页并显示空态，不报页面错误', async () => {
    mockedFetchBreakdown.mockRejectedValue(new Error('boom'));
    const tree = await renderStats();
    await pressByText(tree, '商家');

    const texts = textsOf(tree);
    expect(texts).toContain('支出分布');
    expect(texts).toContain('本月还没有商家数据');
    expect(
      texts.some((text) => text.includes('暂时无法加载排行')),
    ).toBe(true);
    expect(texts).not.toContain('统计数据加载失败');
  });
});
