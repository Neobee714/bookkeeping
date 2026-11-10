/**
 * 循环记账弹层冒烟测试：只验证渲染路径不抛错、关键文案与模式切换正确。
 * 网络层被 mock，不依赖后端。
 */
import React from 'react';
import ReactTestRenderer from 'react-test-renderer';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import RecurringSheet from '../src/components/RecurringSheet';
import type { RecurringRule } from '../src/types';

jest.mock('../src/api/categories', () => ({
  fetchCategories: jest.fn(async () => [
    { id: 1, name: '餐饮', icon: '🍜', color: '#FF9500', type: 'expense' },
    { id: 2, name: '居住', icon: '🏠', color: '#6D5BFF', type: 'expense' },
    { id: 3, name: '工资', icon: '💰', color: '#0F9E76', type: 'income' },
  ]),
}));

const metrics = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 44, left: 0, right: 0, bottom: 34 },
};

const renderSheet = async (editingRule: RecurringRule | null) => {
  let tree: ReactTestRenderer.ReactTestRenderer | undefined;
  await ReactTestRenderer.act(async () => {
    tree = ReactTestRenderer.create(
      <SafeAreaProvider initialMetrics={metrics}>
        <RecurringSheet
          visible
          editingRule={editingRule}
          online
          onClose={() => undefined}
          onSubmit={async () => undefined}
          onDelete={async () => undefined}
        />
      </SafeAreaProvider>,
    );
  });
  return tree;
};

const textsOf = (tree: ReactTestRenderer.ReactTestRenderer): string[] =>
  tree.root
    .findAllByType('Text' as never)
    .map((node) => {
      const children = node.props.children;
      return Array.isArray(children) ? children.join('') : String(children ?? '');
    });

const rule: RecurringRule = {
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
};

describe('RecurringSheet', () => {
  it('新建模式渲染标题、频率四选一与保存按钮', async () => {
    const tree = await renderSheet(null);
    const texts = textsOf(tree as ReactTestRenderer.ReactTestRenderer);
    expect(texts).toContain('新建循环记账');
    expect(texts).toEqual(expect.arrayContaining(['每天', '每周', '每月', '每年']));
    expect(texts).toContain('保存');
    expect(texts).not.toContain('删除规则');
  });

  it('编辑模式带出规则金额与频率，并提供删除入口', async () => {
    const tree = await renderSheet(rule);
    const texts = textsOf(tree as ReactTestRenderer.ReactTestRenderer);
    expect(texts).toContain('编辑循环记账');
    expect(texts).toContain('删除规则');
    expect(texts.join(' ')).toContain('每月 1 号');
    expect(JSON.stringify(tree?.toJSON())).toContain('3200');
  });

  it('离线时提示需要联网', async () => {
    let tree: ReactTestRenderer.ReactTestRenderer | undefined;
    await ReactTestRenderer.act(async () => {
      tree = ReactTestRenderer.create(
        <SafeAreaProvider initialMetrics={metrics}>
          <RecurringSheet
            visible
            editingRule={null}
            online={false}
            onClose={() => undefined}
            onSubmit={async () => undefined}
            onDelete={async () => undefined}
          />
        </SafeAreaProvider>,
      );
    });
    expect(textsOf(tree as ReactTestRenderer.ReactTestRenderer).join(' ')).toContain(
      '离线模式',
    );
  });
});
