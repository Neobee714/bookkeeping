/**
 * 四套皮肤渲染：记一笔（商家 / 菜品 / 评价）、整理旧备注、财报吃喝卡。
 * 只验证渲染路径和关键文案，不断言具体色值（颜色全部来自 skin token）。
 */
import React from 'react';
import ReactTestRenderer from 'react-test-renderer';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import AddTransactionSheet from '../src/components/AddTransactionSheet';
import NoteCleanupScreen from '../src/screens/NoteCleanupScreen';
import ReportDetailScreen from '../src/screens/ReportDetailScreen';
import { useAuthStore } from '../src/store/authStore';
import { useThemeStore } from '../src/store/themeStore';
import type { Transaction } from '../src/types';

jest.mock('@react-navigation/native', () => ({
  useIsFocused: () => true,
  useNavigation: () => ({
    navigate: jest.fn(),
    goBack: jest.fn(),
    getParent: () => ({ navigate: jest.fn() }),
  }),
  useRoute: () => ({ params: { id: 12, label: '2026 年 10 月' } }),
}));

jest.mock('../src/api/categories', () => ({
  fetchCategories: jest.fn(async () => [
    { id: 1, name: '餐饮', icon: '🍜', color: '#FF9500', type: 'expense' },
  ]),
}));

jest.mock('../src/api/quickInputs', () => ({
  fetchQuickInputs: jest.fn(async () => ({
    last_date: '2026-11-11',
    pinned: [],
    by_category: {},
    merchants_by_category: {
      餐饮: [{ name: '和府捞面', count: 3, last_used: '2026-11-10' }],
    },
    items_by_category: {
      餐饮: [{ name: '面', count: 5, last_used: '2026-11-09' }],
    },
  })),
  setNotePreset: jest.fn(),
  removeNotePreset: jest.fn(),
}));

jest.mock('../src/api/transactions', () => ({
  fetchNoteCandidates: jest.fn(async () => ({
    total: 3,
    items: [
      {
        note: '和府捞面',
        count: 3,
        total_amount: 96,
        last_used: '2026-10-31',
        suggestion: 'merchant',
      },
    ],
  })),
  reclassifyNote: jest.fn(async () => ({ affected: 3 })),
}));

jest.mock('../src/api/reports', () => ({
  fetchReportDetail: jest.fn(async () => ({
    id: 12,
    kind: 'monthly',
    label: '2026 年 10 月',
    period_start: '2026-10-01',
    period_end: '2026-10-31',
    generated_at: '2026-11-01T09:00:00+08:00',
    read_at: null,
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
      prev: null,
      categories: [{ name: '餐饮', amount: 312, share: 5.6 }],
      top_expenses: [],
      insights: ['餐饮花了 ¥312'],
      merchants: [{ name: '和府捞面', amount: 96, count: 3, avg: 32 }],
      items: [{ name: '面', amount: 130, count: 5, avg: 26 }],
      dining: { count: 12, amount: 312, avg: 26 },
      dining_insights: ['最常去 和府捞面，3 次共 ¥96'],
      trend: { unit: 'week', points: [{ label: 'W1', expense: 1120 }] },
    },
  })),
  markReportRead: jest.fn(async () => ({
    id: 12,
    read_at: '2026-11-12T13:00:00+08:00',
  })),
}));

const metrics = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 44, left: 0, right: 0, bottom: 34 },
};

const render = async (element: React.ReactElement) => {
  let tree: ReactTestRenderer.ReactTestRenderer | undefined;
  await ReactTestRenderer.act(async () => {
    tree = ReactTestRenderer.create(
      <SafeAreaProvider initialMetrics={metrics}>{element}</SafeAreaProvider>,
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

const editingItem: Transaction = {
  id: 9,
  user_id: 7,
  amount: 32,
  type: 'expense',
  category: '餐饮',
  note: '有点咸',
  merchant: '和府捞面',
  item: '面',
  note_kind: 'evaluation',
  date: '2026-11-12',
  created_at: '2026-11-12T12:00:00+08:00',
};

beforeEach(() => {
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

afterEach(async () => {
  await ReactTestRenderer.act(async () => {
    useThemeStore.setState({ skinId: 'aurora' });
  });
});

describe('v0.18 界面 · 四套皮肤', () => {
  (['aurora', 'candy', 'neon', 'neu'] as const).forEach((skinId) => {
    it(`${skinId} 皮肤下记一笔 / 整理页 / 财报吃喝卡都可渲染`, async () => {
      await ReactTestRenderer.act(async () => {
        useThemeStore.setState({ skinId });
      });

      const sheetTexts = textsOf(
        await render(
          <AddTransactionSheet
            visible
            editingItem={editingItem}
            onClose={() => undefined}
            onSubmit={async () => undefined}
          />,
        ),
      );
      expect(sheetTexts).toContain('商家(可选)');
      expect(sheetTexts).toContain('吃了什么(可选)');
      expect(sheetTexts).toContain('评价(可选)');
      expect(sheetTexts.some((text) => text.includes('和府捞面'))).toBe(true);

      const cleanupTexts = textsOf(await render(<NoteCleanupScreen />));
      expect(cleanupTexts).toContain('整理旧备注');
      expect(cleanupTexts).toContain('和府捞面');
      expect(cleanupTexts).toContain('保存整理结果（0）');

      const reportTexts = textsOf(await render(<ReportDetailScreen />));
      expect(reportTexts).toContain('吃喝');
      expect(reportTexts).toContain('常去的店');
      expect(reportTexts).toContain('最常去 和府捞面，3 次共 ¥96');
    });
  });
});
