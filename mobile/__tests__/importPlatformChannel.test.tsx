/**
 * v0.24 导入页平台单：预览行平台 chip；记住规则时只传 channel，不传 merchant。
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

const platformPreview: ImportPreview = {
  source: 'wechat',
  summary: {
    total: 1,
    importable: 1,
    skipped: 0,
    expense_count: 1,
    expense_amount: '28.00',
    income_count: 0,
    income_amount: '0.00',
    range: ['2026-11-01', '2026-11-22'],
    account: 'Dddd.',
    skipped_reasons: [],
  },
  categories: {
    expense: [
      { name: '餐饮', icon: '🍜' },
      { name: '购物', icon: '🛍️' },
    ],
    income: [{ name: '收入', icon: '💰' }],
  },
  rows: [
    {
      client_id: 'wx:p1',
      date: '2026-11-22',
      amount: '28.00',
      type: 'expense',
      merchant: '',
      channel: '美团',
      note: '',
      category: '餐饮',
      match: 'builtin',
      existing: false,
    },
  ],
  skipped: [],
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
    node.props.onPress({ stopPropagation: () => undefined });
  });
  await flush();
};

describe('ImportScreen · 平台单', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    pickBillFileMock.mockResolvedValue({
      path: 'file:///cache/bill_import/wechat.zip',
      name: '微信支付账单.zip',
      size: 20480,
    });
    previewImportMock.mockResolvedValue(platformPreview);
    commitImportMock.mockResolvedValue({
      imported: 1,
      duplicated: 0,
      learned: 1,
      invalid: 0,
    });
  });

  it('预览行显示平台 chip，标题回退到平台名', async () => {
    const tree = await renderScreen();
    await press(tree, 'import-pick');

    const texts = textsOf(tree);
    expect(texts).toContain('美团');
    expect(texts).toContain('📱 美团');
    expect(tree.root.findAllByProps({ testID: 'channel-chip-wx:p1' }).length).toBeGreaterThan(0);
  });

  it('记住平台单时 learn 只带 channel，提交行带回 channel', async () => {
    const tree = await renderScreen();
    await press(tree, 'import-pick');

    await press(tree, 'category-chip-wx:p1');
    await press(tree, 'import-learn-toggle');
    await press(tree, 'import-learn-confirm');
    await press(tree, 'import-commit');

    expect(commitImportMock).toHaveBeenCalledTimes(1);
    const payload = commitImportMock.mock.calls[0][0];
    expect(payload).toEqual({
      source: 'wechat',
      rows: [
        {
          client_id: 'wx:p1',
          date: '2026-11-22',
          amount: '28.00',
          type: 'expense',
          category: '餐饮',
          merchant: '',
          channel: '美团',
          note: '',
        },
      ],
      learn: [{ channel: '美团', category: '餐饮' }],
    });
    expect(payload.learn[0]).not.toHaveProperty('merchant');
  });
});
