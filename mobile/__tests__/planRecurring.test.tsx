/**
 * 规划页「循环」分段冒烟测试：切段后渲染规则行、开关与新建入口。
 * 只验证渲染与交互不抛错，网络层全部 mock。
 */
import React from 'react';
import ReactTestRenderer from 'react-test-renderer';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import PlanScreen from '../src/screens/PlanScreen';

jest.mock('@react-navigation/native', () => ({
  useIsFocused: () => true,
}));

jest.mock('../src/api/budget', () => ({
  fetchBudget: jest.fn(async () => ({
    month: '2026-11',
    total_budget: 0,
    total_spent: 0,
    items: [],
  })),
  setBudget: jest.fn(),
  updateBudget: jest.fn(),
}));

jest.mock('../src/api/savings', () => ({
  fetchSavings: jest.fn(async () => []),
  createSaving: jest.fn(),
  updateSaving: jest.fn(),
  deleteSaving: jest.fn(),
}));

// mock 工厂会被提升到 import 之前执行，因此测试数据必须定义在工厂内部。
jest.mock('../src/api/recurring', () => ({
  fetchRecurringRules: jest.fn(async () => [
    {
      id: 7,
      amount: 3200,
      type: 'expense',
      category: '居住',
      note: '房租',
      freq: 'monthly',
      start_date: '2026-11-01',
      next_run_date: '2026-12-01',
      enabled: true,
      last_generated_date: null,
      created_at: '2026-11-10T10:00:00+00:00',
    },
    {
      id: 8,
      amount: 25,
      type: 'expense',
      category: '娱乐',
      note: null,
      freq: 'monthly',
      start_date: '2026-11-25',
      next_run_date: '2026-11-25',
      enabled: false,
      last_generated_date: null,
      created_at: '2026-11-10T10:00:00+00:00',
    },
  ]),
  createRecurringRule: jest.fn(),
  updateRecurringRule: jest.fn(),
  deleteRecurringRule: jest.fn(),
}));

const metrics = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 44, left: 0, right: 0, bottom: 34 },
};

const renderPlan = async () => {
  let tree: ReactTestRenderer.ReactTestRenderer | undefined;
  await ReactTestRenderer.act(async () => {
    tree = ReactTestRenderer.create(
      <SafeAreaProvider initialMetrics={metrics}>
        <PlanScreen />
      </SafeAreaProvider>,
    );
  });
  return tree as ReactTestRenderer.ReactTestRenderer;
};

const textsOf = (tree: ReactTestRenderer.ReactTestRenderer): string[] =>
  tree.root.findAllByType('Text' as never).map((node) => {
    const children = node.props.children;
    return Array.isArray(children) ? children.join('') : String(children ?? '');
  });

describe('PlanScreen · 循环分段', () => {
  it('切到「循环」后展示规则、频率、下期与暂停状态', async () => {
    const tree = await renderPlan();
    const texts = textsOf(tree);
    expect(texts).toContain('循环');

    const tab = tree.root
      .findAllByType('Text' as never)
      .find((node) => node.props.children === '循环');
    expect(tab).toBeTruthy();
    await ReactTestRenderer.act(async () => {
      let parent: ReactTestRenderer.ReactTestInstance | null = tab?.parent ?? null;
      while (parent && !parent.props.onPress) {
        parent = parent.parent;
      }
      parent?.props.onPress();
    });

    const after = textsOf(tree);
    expect(after).toContain('循环规则');
    expect(after).toContain('房租');
    expect(after).toContain('每月 1 号');
    expect(after).toContain('下期 12-01');
    expect(after).toContain('已暂停');
    expect(after).toContain('＋ 新建循环记账');
  });
});
