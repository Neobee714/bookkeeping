/**
 * 账单导入页冒烟测试：选文件 → 预览 → 改分类并记住商家 → 确认导入。
 * 网络层与原生文件选择器都 mock，不依赖后端与真机。
 */
import React from 'react';
import ReactTestRenderer from 'react-test-renderer';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import type { ImportPreview } from '../src/api/imports';
import { commitImport, previewImport } from '../src/api/imports';
import { pickBillFile } from '../src/native/BillPicker';
import ImportScreen from '../src/screens/ImportScreen';

jest.mock('../src/native/BillPicker', () => ({
  pickBillFile: jest.fn(),
}));

jest.mock('../src/api/imports', () => ({
  previewImport: jest.fn(),
  commitImport: jest.fn(),
}));

const pickBillFileMock = pickBillFile as jest.MockedFunction<
  typeof pickBillFile
>;
const previewImportMock = previewImport as jest.MockedFunction<
  typeof previewImport
>;
const commitImportMock = commitImport as jest.MockedFunction<
  typeof commitImport
>;

const metrics = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 44, left: 0, right: 0, bottom: 34 },
};

const previewFixture: ImportPreview = {
  source: 'wechat',
  summary: {
    total: 4,
    importable: 2,
    skipped: 1,
    expense_count: 2,
    expense_amount: '57.98',
    income_count: 0,
    income_amount: '0.00',
    range: ['2026-10-23', '2026-11-22'],
    account: 'Dddd.',
    skipped_reasons: [
      { reason: '转账/红包', count: 1, amount: '1000.00' },
    ],
  },
  categories: {
    expense: [
      { name: '餐饮', icon: '🍜' },
      { name: '购物', icon: '🛍️' },
    ],
    income: [{ name: '收入', icon: '💰' }],
    transfer: [],
  },
  rows: [
    {
      client_id: 'wx:1',
      date: '2026-11-22',
      amount: '45.98',
      type: 'expense',
      merchant: '淘宝平台商户',
      note: '',
      category: '购物',
      match: 'builtin',
      existing: false,
    },
    {
      client_id: 'wx:2',
      date: '2026-11-21',
      amount: '100.00',
      type: 'expense',
      merchant: '美团',
      note: '午饭',
      category: '餐饮',
      match: 'default',
      existing: true,
    },
    {
      client_id: 'wx:3',
      date: '2026-11-20',
      amount: '12.00',
      type: 'expense',
      merchant: '瑞幸咖啡',
      note: '',
      category: '餐饮',
      match: 'learned',
      existing: false,
    },
  ],
  skipped: [
    {
      reason: '转账/红包',
      date: '2026-11-09',
      amount: '1000.00',
      merchant: 'j吴俊旺',
      type: 'expense',
    },
  ],
};

const renderScreen = async () => {
  let tree: ReactTestRenderer.ReactTestRenderer | undefined;
  await ReactTestRenderer.act(async () => {
    tree = ReactTestRenderer.create(
      <SafeAreaProvider initialMetrics={metrics}>
        <ImportScreen
          navigation={{ goBack: jest.fn() } as never}
          route={{ key: 'Import', name: 'Import' } as never}
        />
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

const flush = async () => {
  await ReactTestRenderer.act(async () => {
    await new Promise<void>((resolve) => setTimeout(() => resolve(), 0));
  });
};

const press = async (
  tree: ReactTestRenderer.ReactTestRenderer,
  testID: string,
) => {
  const pressable = tree.root
    .findAllByProps({ testID })
    .find((node) => typeof node.props.onPress === 'function');
  if (!pressable) {
    throw new Error(`没有找到可点击的 ${testID}`);
  }
  await ReactTestRenderer.act(async () => {
    pressable.props.onPress({ stopPropagation: () => undefined });
  });
  await flush();
};

describe('ImportScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    pickBillFileMock.mockResolvedValue({
      path: 'file:///cache/bill_import/wechat.zip',
      name: '微信支付账单.zip',
      size: 20480,
    });
    previewImportMock.mockResolvedValue(previewFixture);
    commitImportMock.mockResolvedValue({
      imported: 2,
      duplicated: 0,
      learned: 1,
      invalid: 0,
    });
  });

  it('选择文件后展示汇总与行列表，已导入的行默认不勾选', async () => {
    const tree = await renderScreen();
    const idleTexts = textsOf(tree);
    expect(idleTexts).toContain('导入账单');
    expect(idleTexts).toContain('选择账单文件');
    expect(idleTexts).toContain('微信账单可留空，服务端自动处理。');

    await press(tree, 'import-pick');
    expect(pickBillFileMock).toHaveBeenCalledTimes(1);
    expect(previewImportMock).toHaveBeenCalledWith(
      expect.objectContaining({ name: '微信支付账单.zip' }),
      undefined,
    );

    const texts = textsOf(tree);
    expect(texts).toContain('可导入 2 笔');
    expect(texts.join(' ')).toContain('转账/红包 · 1 笔 ¥1,000.00');
    expect(texts).toContain('已导入');
    expect(texts).toContain('确认导入 2 笔');
  });

  it('改分类并记住商家后，提交只带勾选的行与学习规则', async () => {
    const tree = await renderScreen();
    await press(tree, 'import-pick');

    // 打开第一行的分类选择器，选「餐饮」并勾选记住商家。
    await press(tree, 'category-chip-wx:1');
    await press(tree, 'category-option-餐饮');
    await press(tree, 'import-learn-toggle');
    await press(tree, 'import-learn-confirm');

    const afterEdit = textsOf(tree).join(' ');
    expect(afterEdit).toContain('🍜 餐饮 ›');
    expect(afterEdit).toContain('记住');

    await press(tree, 'import-commit');
    expect(commitImportMock).toHaveBeenCalledTimes(1);
    expect(commitImportMock).toHaveBeenCalledWith({
      source: 'wechat',
      rows: [
        {
          client_id: 'wx:1',
          date: '2026-11-22',
          amount: '45.98',
          type: 'expense',
          category: '餐饮',
          merchant: '淘宝平台商户',
          note: '',
        },
        {
          client_id: 'wx:3',
          date: '2026-11-20',
          amount: '12.00',
          type: 'expense',
          category: '餐饮',
          merchant: '瑞幸咖啡',
          note: '',
        },
      ],
      learn: [{ merchant: '淘宝平台商户', category: '餐饮' }],
    });

    const doneTexts = textsOf(tree);
    expect(doneTexts).toContain('导入完成');
    expect(doneTexts).toContain('成功导入');
    expect(doneTexts).toContain('2 笔');
    expect(doneTexts).toContain('记住商家分类');
  });
});
