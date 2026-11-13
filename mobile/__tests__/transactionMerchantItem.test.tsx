/**
 * v0.18 商家 / 吃了什么 / 评价：表单回填、提交 payload 与列表展示优先级。
 * 网络层全部 mock，不依赖后端。
 */
import React from 'react';
import ReactTestRenderer from 'react-test-renderer';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import AddTransactionSheet from '../src/components/AddTransactionSheet';
import TransactionItem from '../src/components/TransactionItem';
import type { Transaction } from '../src/types';

jest.mock('../src/api/categories', () => ({
  fetchCategories: jest.fn(async () => [
    { id: 1, name: '餐饮', icon: '🍜', color: '#FF9500', type: 'expense' },
    { id: 2, name: '交通', icon: '🚇', color: '#007AFF', type: 'expense' },
    { id: 3, name: '娱乐', icon: '🎬', color: '#AF52DE', type: 'expense' },
  ]),
}));

jest.mock('../src/api/quickInputs', () => ({
  fetchQuickInputs: jest.fn(async () => ({
    last_date: '2026-11-11',
    pinned: [],
    by_category: { 餐饮: [{ note: '有点咸', count: 2, last_used: '2026-11-10' }] },
    merchants_by_category: {
      餐饮: [
        { name: '和府捞面', count: 3, last_used: '2026-11-10' },
        { name: '麦当劳', count: 2, last_used: '2026-11-09' },
      ],
    },
    items_by_category: {
      餐饮: [{ name: '牛肉面', count: 2, last_used: '2026-11-09' }],
    },
  })),
  setNotePreset: jest.fn(),
  removeNotePreset: jest.fn(),
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

/** 从文字节点向上找可点击的 Pressable 并触发 onPress。 */
const pressByText = async (
  tree: ReactTestRenderer.ReactTestRenderer,
  text: string,
) => {
  const node = tree.root
    .findAllByType('Text' as never)
    .find((candidate) => flatten(candidate.props.children) === text);
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
};

const editingItem: Transaction = {
  id: 9,
  user_id: 1,
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

describe('AddTransactionSheet · 商家 / 吃了什么 / 评价', () => {
  it('编辑时回填三个字段，标签改为评价，提交 payload 带 merchant/item', async () => {
    const onSubmit = jest.fn(async () => undefined);
    const tree = await render(
      <AddTransactionSheet
        visible
        editingItem={editingItem}
        onClose={() => undefined}
        onSubmit={onSubmit}
      />,
    );
    const texts = textsOf(tree);

    expect(texts).toContain('编辑账单');
    expect(texts).toContain('商家(可选)');
    expect(texts).toContain('吃了什么(可选)');
    expect(texts).toContain('评价(可选)');

    const values = tree.root
      .findAllByType('TextInput' as never)
      .map((node) => node.props.value);
    expect(values).toEqual(expect.arrayContaining(['和府捞面', '有点咸']));
    expect(texts).toContain('面');

    await pressByText(tree, '保存修改');
    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({
        amount: 32,
        type: 'expense',
        category: '餐饮',
        date: '2026-11-12',
        merchant: '和府捞面',
        item: '面',
        note: '有点咸',
      }),
    );
  });

  it('编辑自定义菜品时直接以文本输入回填', async () => {
    const tree = await render(
      <AddTransactionSheet
        visible
        editingItem={{ ...editingItem, item: '牛肉面' }}
        onClose={() => undefined}
        onSubmit={jest.fn(async () => undefined)}
      />,
    );
    const values = tree.root
      .findAllByType('TextInput' as never)
      .map((node) => node.props.value);

    expect(values).toContain('牛肉面');
  });

  it('新增时展示最近商家 chips、固定菜品 chips 与自定义入口', async () => {
    const tree = await render(
      <AddTransactionSheet
        visible
        editingItem={null}
        onClose={() => undefined}
        onSubmit={jest.fn(async () => undefined)}
      />,
    );
    const texts = textsOf(tree);

    expect(texts.some((text) => text.includes('和府捞面'))).toBe(true);
    expect(texts.some((text) => text.includes('麦当劳'))).toBe(true);
    expect(texts).toEqual(expect.arrayContaining(['面', '粉', '饭', '火锅']));
    expect(texts).toContain('＋自定义');
    expect(texts).toContain('牛肉面');
    expect(texts).toContain('评价(可选)');
  });

  it('娱乐分类显示「玩了什么」，交通仍用通用项目', async () => {
    const tree = await render(
      <AddTransactionSheet
        visible
        editingItem={{
          ...editingItem,
          category: '娱乐',
          merchant: null,
          item: null,
          note: null,
        }}
        onClose={() => undefined}
        onSubmit={jest.fn(async () => undefined)}
      />,
    );
    const texts = textsOf(tree);

    expect(texts).toContain('玩了什么(可选)');
    expect(texts).not.toContain('吃了什么(可选)');
  });

  it('非餐饮分类把「吃了什么」改为「项目」自由输入', async () => {
    const tree = await render(
      <AddTransactionSheet
        visible
        editingItem={{ ...editingItem, category: '交通', merchant: null, item: null, note: null }}
        onClose={() => undefined}
        onSubmit={jest.fn(async () => undefined)}
      />,
    );
    const texts = textsOf(tree);

    expect(texts).toContain('项目(可选)');
    expect(texts).not.toContain('吃了什么(可选)');
  });
});

describe('TransactionItem · 展示优先级', () => {
  const base = {
    id: 1,
    user_id: 1,
    amount: 32,
    type: 'expense' as const,
    category: '餐饮',
    date: '2026-11-12',
    created_at: '2026-11-12T12:00:00+08:00',
  };

  const renderItem = (item: Transaction) =>
    render(
      <TransactionItem
        item={item}
        icon="🍜"
        color="#FF9500"
        onPress={() => undefined}
        onLongPress={() => undefined}
      />,
    );

  it('商家优先做标题，副标题为「菜品 · 评价」', async () => {
    const tree = await renderItem({
      ...base,
      note: '有点咸',
      merchant: '和府捞面',
      item: '面',
      note_kind: 'evaluation',
    });
    const texts = textsOf(tree);
    expect(texts).toContain('和府捞面');
    expect(texts).toContain('面 · 有点咸');
    expect(texts).not.toContain('餐饮');
  });

  it('只有菜品时标题为菜品，副标题回退到分类', async () => {
    const tree = await renderItem({
      ...base,
      note: null,
      merchant: null,
      item: '面',
      note_kind: null,
    });
    const texts = textsOf(tree);
    expect(texts).toContain('面');
    expect(texts).toContain('餐饮');
  });

  it('旧数据保持「分类 + 备注 / 无备注」', async () => {
    const withNote = textsOf(
      await renderItem({ ...base, note: '老备注', merchant: null, item: null }),
    );
    expect(withNote).toContain('餐饮');
    expect(withNote).toContain('老备注');

    const withoutNote = textsOf(
      await renderItem({ ...base, note: null, merchant: null, item: null }),
    );
    expect(withoutNote).toContain('无备注');
  });
});
