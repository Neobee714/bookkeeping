/**
 * v0.24 分类规则页：列表渲染 / 改分类（PATCH）/ 删除（DELETE）。
 * 网络层全部 mock，不依赖后端。
 */
import React from 'react';
import ReactTestRenderer from 'react-test-renderer';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import {
  deleteImportRule,
  fetchImportRules,
  updateImportRule,
  type ImportRule,
} from '../src/api/imports';
import GradientButton from '../src/components/GradientButton';
import RulesScreen from '../src/screens/RulesScreen';

jest.mock('../src/api/imports', () => ({
  fetchImportRules: jest.fn(),
  updateImportRule: jest.fn(),
  deleteImportRule: jest.fn(),
}));

jest.mock('../src/api/categories', () => ({
  fetchCategories: jest.fn(async () => [
    { name: '餐饮' },
    { name: '购物' },
    { name: '交通' },
  ]),
}));

const fetchRulesMock = fetchImportRules as jest.MockedFunction<
  typeof fetchImportRules
>;
const updateRuleMock = updateImportRule as jest.MockedFunction<
  typeof updateImportRule
>;
const deleteRuleMock = deleteImportRule as jest.MockedFunction<
  typeof deleteImportRule
>;

const metrics = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 44, left: 0, right: 0, bottom: 34 },
};

const fixtures: ImportRule[] = [
  {
    id: 1,
    source: 'wechat',
    merchant: '和府捞面',
    category: '餐饮',
    hits: 7,
  },
  {
    id: 2,
    source: 'alipay',
    merchant: '美团',
    category: '餐饮',
    hits: 3,
  },
];

const renderScreen = async () => {
  let tree: ReactTestRenderer.ReactTestRenderer | undefined;
  await ReactTestRenderer.act(async () => {
    tree = ReactTestRenderer.create(
      <SafeAreaProvider initialMetrics={metrics}>
        <RulesScreen
          navigation={{ goBack: jest.fn() } as never}
          route={{ key: 'Rules', name: 'Rules' } as never}
        />
      </SafeAreaProvider>,
    );
  });
  await flush();
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

const flush = async () => {
  await ReactTestRenderer.act(async () => {
    await new Promise<void>((resolve) => setTimeout(() => resolve(), 0));
  });
};

const press = async (
  tree: ReactTestRenderer.ReactTestRenderer,
  testID: string,
) => {
  const node = tree.root
    .findAllByProps({ testID })
    .find((candidate) => typeof candidate.props.onPress === 'function');
  if (!node) {
    throw new Error(`没有找到可点击的 ${testID}`);
  }
  await ReactTestRenderer.act(async () => {
    node.props.onPress();
  });
  await flush();
};

describe('RulesScreen · 分类规则', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    fetchRulesMock.mockResolvedValue(fixtures);
    updateRuleMock.mockImplementation(async (id, category) => ({
      ...(fixtures.find((rule) => rule.id === id) as ImportRule),
      category,
    }));
    deleteRuleMock.mockResolvedValue(undefined);
  });

  it('列表展示商家 / 平台名、分类 chip 与命中次数', async () => {
    const tree = await renderScreen();
    const texts = textsOf(tree);

    expect(texts).toContain('分类规则');
    expect(texts).toContain('和府捞面');
    expect(texts).toContain('美团');
    expect(texts).toContain('命中 7 次');
    expect(texts).toContain('命中 3 次');
    expect(texts).toContain('餐饮 ›');
  });

  it('点分类 chip 选择新分类后调用 PATCH 并更新行', async () => {
    const tree = await renderScreen();
    await press(tree, 'rule-category-1');
    await press(tree, 'rule-category-option-购物');
    await press(tree, 'rule-category-confirm');

    expect(updateRuleMock).toHaveBeenCalledWith(1, '购物');
    expect(textsOf(tree)).toContain('购物 ›');
  });

  it('删除先弹确认，确认后调用 DELETE 并移除行', async () => {
    const tree = await renderScreen();
    await press(tree, 'rule-delete-1');

    expect(textsOf(tree)).toContain('删除分类规则');
    expect(deleteRuleMock).not.toHaveBeenCalled();

    const confirm = tree.root
      .findAllByType(GradientButton)
      .find((node) => node.props.title === '删除');
    expect(confirm).toBeDefined();
    await ReactTestRenderer.act(async () => {
      confirm?.props.onPress();
    });
    await flush();

    expect(deleteRuleMock).toHaveBeenCalledWith(1);
    const texts = textsOf(tree);
    expect(texts).not.toContain('和府捞面');
    expect(texts).toContain('美团');
  });

  it('没有规则时展示空态文案', async () => {
    fetchRulesMock.mockResolvedValue([]);
    const tree = await renderScreen();
    const texts = textsOf(tree);

    expect(texts).toContain('还没有记住的规则');
    expect(texts).toContain('导入账单时勾选「以后这个商家都用这个分类」就会生成');
  });

  it('加载失败展示可重试错误态，不崩页面', async () => {
    fetchRulesMock.mockRejectedValue(new Error('boom'));
    const tree = await renderScreen();
    const texts = textsOf(tree);

    expect(texts).toContain('规则加载失败');
    expect(texts).toContain('boom');
    expect(texts).toContain('分类规则');
  });
});
