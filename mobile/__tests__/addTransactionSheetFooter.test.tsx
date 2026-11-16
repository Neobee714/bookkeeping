/**
 * v0.20 FR-1 记账弹层「吸底 footer」结构断言：
 * 「确认新增 / 保存修改」按钮与提交错误提示必须在 ScrollView 之外的固定 footer 里，
 * footer 始终渲染（无错误时也在），编辑模式文案为「保存修改」。
 * 网络层全部 mock，不依赖后端（先例：__tests__/transactionMerchantItem.test.tsx）。
 */
import React from 'react';
import ReactTestRenderer from 'react-test-renderer';
import { ScrollView, StyleSheet } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import AddTransactionSheet from '../src/components/AddTransactionSheet';
import GradientButton from '../src/components/GradientButton';
import type { Transaction, TransactionCreatePayload } from '../src/types';

jest.mock('../src/api/categories', () => ({
  fetchCategories: jest.fn(async () => [
    { id: 1, name: '餐饮', icon: '🍜', color: '#FF9500', type: 'expense' },
    { id: 2, name: '居住', icon: '🏠', color: '#6D5BFF', type: 'expense' },
    { id: 3, name: '工资', icon: '💰', color: '#0F9E76', type: 'income' },
  ]),
}));

jest.mock('../src/api/quickInputs', () => ({
  fetchQuickInputs: jest.fn(async () => ({
    last_date: null,
    pinned: [],
    by_category: {},
    merchants_by_category: {},
  })),
  setNotePreset: jest.fn(),
  removeNotePreset: jest.fn(),
}));

const metrics = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 44, left: 0, right: 0, bottom: 34 },
};

const renderSheet = async (
  editingItem: Transaction | null,
  onSubmit: (payload: TransactionCreatePayload) => Promise<void>,
) => {
  let tree: ReactTestRenderer.ReactTestRenderer | undefined;
  await ReactTestRenderer.act(async () => {
    tree = ReactTestRenderer.create(
      <SafeAreaProvider initialMetrics={metrics}>
        <AddTransactionSheet
          visible
          editingItem={editingItem}
          onClose={() => undefined}
          onSubmit={onSubmit}
        />
      </SafeAreaProvider>,
    );
  });
  await ReactTestRenderer.act(async () => undefined);
  return tree as ReactTestRenderer.ReactTestRenderer;
};

const flattenText = (node: unknown): string => {
  if (node === null || node === undefined || typeof node === 'boolean') {
    return '';
  }
  if (Array.isArray(node)) {
    return node.map(flattenText).join('');
  }
  if (typeof node === 'string' || typeof node === 'number') {
    return String(node);
  }
  const element = node as { props?: { children?: unknown } };
  return flattenText(element.props?.children);
};

const textsOf = (tree: ReactTestRenderer.ReactTestRenderer): string[] =>
  tree.root
    .findAllByType('Text' as never)
    .map((node) => flattenText(node.props.children))
    .filter((text) => text.length > 0);

/** 找到指定标题的 GradientButton 实例。 */
const buttonOf = (
  tree: ReactTestRenderer.ReactTestRenderer,
  title: string,
): ReactTestRenderer.ReactTestInstance => {
  const button = tree.root
    .findAllByType(GradientButton)
    .find((node) => node.props.title === title);
  if (!button) {
    throw new Error(`找不到按钮：${title}`);
  }
  return button;
};

/** 断言节点的祖先链里没有任何 ScrollView（即不在滚动区内）。 */
const expectOutsideScrollView = (
  tree: ReactTestRenderer.ReactTestRenderer,
  node: ReactTestRenderer.ReactTestInstance,
) => {
  let current: ReactTestRenderer.ReactTestInstance | null = node.parent;
  while (current) {
    const nodeType = current.type as unknown;
    expect(nodeType === ScrollView || nodeType === 'ScrollView').toBe(false);
    current = current.parent;
  }
  for (const scroll of tree.root.findAllByType(ScrollView)) {
    expect(scroll.findAll((candidate) => candidate === node)).toHaveLength(0);
  }
};

const editingItem: Transaction = {
  id: 9,
  user_id: 1,
  amount: 32,
  type: 'expense',
  category: '餐饮',
  note: '有点咸',
  merchant: '和府捞面',
  note_kind: 'evaluation',
  date: '2026-11-12',
  created_at: '2026-11-12T12:00:00+08:00',
};

describe('AddTransactionSheet · 吸底 footer(FR-1)', () => {
  it('新增模式：「确认新增」在 ScrollView 之外的固定 footer 里，footer 常驻', async () => {
    const tree = await renderSheet(null, async () => undefined);
    const texts = textsOf(tree);
    expect(texts).toContain('确认新增');
    expect(texts).not.toContain('保存修改');

    const button = buttonOf(tree, '确认新增');
    expectOutsideScrollView(tree, button);

    // footer = 按钮的直接父容器：1px 顶部分隔线 + 吸底留白，且不随内容压缩。
    const footer = button.parent as ReactTestRenderer.ReactTestInstance;
    const style = StyleSheet.flatten(footer.props.style) as Record<
      string,
      unknown
    >;
    expect(style).toEqual(
      expect.objectContaining({
        flexGrow: 0,
        flexShrink: 0,
        borderTopWidth: 1,
        paddingTop: 10,
        paddingHorizontal: 18,
        paddingBottom: 22 + metrics.insets.bottom,
      }),
    );
    // 分隔线颜色是运行时注入的皮肤 token，不是样式表写死色值。
    expect(typeof style.borderTopColor).toBe('string');

    // 无错误时 footer 也在：按钮是它的唯一主按钮子项。
    expect(footer.findAllByType(GradientButton)).toHaveLength(1);
  });

  it('编辑模式：按钮文案「保存修改」；提交失败的错误提示也落在 footer 内', async () => {
    const onSubmit = jest.fn(async (_payload: TransactionCreatePayload) => {
      throw new Error('后端炸了');
    });
    const tree = await renderSheet(editingItem, onSubmit);
    const texts = textsOf(tree);
    expect(texts).toContain('保存修改');
    expect(texts).not.toContain('确认新增');

    const button = buttonOf(tree, '保存修改');
    expectOutsideScrollView(tree, button);
    const footer = button.parent as ReactTestRenderer.ReactTestInstance;

    await ReactTestRenderer.act(async () => {
      button.props.onPress();
    });
    await ReactTestRenderer.act(async () => {
      await new Promise<void>((resolve) => {
        setTimeout(() => resolve(), 0);
      });
    });

    expect(onSubmit).toHaveBeenCalledTimes(1);
    expect(textsOf(tree)).toContain('后端炸了');

    // 错误提示在 footer 子树内（FR-1.3 随按钮进 footer），且不在任何 ScrollView 内。
    const errorNode = tree.root
      .findAllByType('Text' as never)
      .find(
        (node) => flattenText(node.props.children) === '后端炸了',
      ) as ReactTestRenderer.ReactTestInstance;
    expect(
      footer.findAll((candidate) => candidate === errorNode),
    ).toHaveLength(1);
    expectOutsideScrollView(tree, errorNode);
  });
});
