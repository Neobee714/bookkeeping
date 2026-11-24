/**
 * v0.24 平台（channel）展示：列表行标题 / 副行平台 chip 的优先级。
 */
import React from 'react';
import ReactTestRenderer from 'react-test-renderer';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import TransactionItem from '../src/components/TransactionItem';
import type { Transaction } from '../src/types';

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

const base: Transaction = {
  id: 1,
  user_id: 1,
  amount: 32,
  type: 'expense',
  category: '餐饮',
  note: null,
  date: '2026-11-22',
  created_at: '2026-11-22T12:00:00+08:00',
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

const hasChannelChip = (tree: ReactTestRenderer.ReactTestRenderer): boolean =>
  tree.root.findAllByProps({ testID: 'transaction-channel-chip' }).length > 0;

describe('TransactionItem · 平台 channel', () => {
  it('只有平台没有商家时，标题显示平台名（副标题回退分类）', async () => {
    const tree = await renderItem({
      ...base,
      merchant: null,
      channel: '美团',
      note: null,
    });
    const texts = textsOf(tree);

    expect(texts).toContain('美团');
    expect(texts).toContain('餐饮');
    expect(texts).not.toContain('无备注');
    // 标题已经是平台，不再重复平台 chip。
    expect(hasChannelChip(tree)).toBe(false);
  });

  it('商家做标题时，副行前置平台 chip（与商家不同）', async () => {
    const tree = await renderItem({
      ...base,
      merchant: '和府捞面',
      channel: '美团',
      note: '有点咸',
    });
    const texts = textsOf(tree);

    expect(texts).toContain('和府捞面');
    expect(texts).toContain('有点咸');
    expect(texts).toContain('美团');
    expect(hasChannelChip(tree)).toBe(true);
  });

  it('平台与商家同名时不重复显示 chip', async () => {
    const tree = await renderItem({
      ...base,
      merchant: '美团',
      channel: '美团',
      note: null,
    });
    expect(textsOf(tree)).toContain('美团');
    expect(hasChannelChip(tree)).toBe(false);
  });
});
