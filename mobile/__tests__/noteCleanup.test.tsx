/**
 * 整理旧备注：候选渲染、商家/菜品可同选、串行保存与离线只读。
 * 网络与导航全部 mock。
 */
import React from 'react';
import { Alert } from 'react-native';
import ReactTestRenderer from 'react-test-renderer';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import {
  fetchNoteCandidates,
  reclassifyNote,
  undoNoteCleanup,
} from '../src/api/transactions';
import { cacheKey, writeCache } from '../src/offline/cache';
import NoteCleanupScreen from '../src/screens/NoteCleanupScreen';
import { useAuthStore } from '../src/store/authStore';
import type { NoteCandidateList } from '../src/types';

let mockOnline = true;

jest.mock('../src/offline/network', () => ({
  isOnlineNow: () => mockOnline,
  subscribeNetwork: () => () => undefined,
}));

const mockGoBack = jest.fn();

jest.mock('@react-navigation/native', () => ({
  useNavigation: () => ({ goBack: mockGoBack }),
}));

jest.mock('../src/api/transactions', () => ({
  fetchNoteCandidates: jest.fn(),
  reclassifyNote: jest.fn(),
  undoNoteCleanup: jest.fn(),
}));

const mockedFetchCandidates = fetchNoteCandidates as unknown as jest.Mock;
const mockedReclassify = reclassifyNote as unknown as jest.Mock;
const mockedUndo = undoNoteCleanup as unknown as jest.Mock;

const fixture: NoteCandidateList = {
  total: 7,
  items: [
    {
      note: '和府捞面',
      count: 12,
      total_amount: 384,
      last_used: '2026-10-31',
      suggestion: 'merchant',
    },
    {
      note: '面',
      count: 8,
      total_amount: 128,
      last_used: '2026-10-30',
      suggestion: 'item',
    },
    {
      note: '有点咸',
      count: 2,
      total_amount: 56,
      last_used: '2026-10-29',
      suggestion: 'evaluation',
    },
  ],
};

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
};

beforeEach(() => {
  jest.clearAllMocks();
  mockOnline = true;
  mockedFetchCandidates.mockResolvedValue(fixture);
  mockedReclassify.mockResolvedValue({ affected: 12 });
  mockedUndo.mockResolvedValue({ batch_id: 9, restored: 5, skipped: 0 });
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

afterEach(() => {
  mockOnline = true;
});

describe('NoteCleanupScreen', () => {
  it('渲染候选、建议标签与统计口径说明', async () => {
    const tree = await render(<NoteCleanupScreen />);
    const texts = textsOf(tree);

    expect(texts.some((text) => text.includes('共 22 条'))).toBe(true);
    expect(texts.some((text) => text.includes('去重后 7 个'))).toBe(true);
    expect(texts).toEqual(expect.arrayContaining(['和府捞面', '面', '有点咸']));
    expect(texts).toEqual(
      expect.arrayContaining(['像店名', '像菜品', '像评价']),
    );
    expect(texts.some((text) => text.includes('12 笔 · ¥384'))).toBe(true);
    expect(texts).toContain('保存整理结果（0）');
  });

  it('选「商家」后出现输入框，保存调用 reclassify 并返回', async () => {
    const tree = await render(<NoteCleanupScreen />);

    await pressByText(tree, '商家');
    const inputs = tree.root
      .findAllByType('TextInput' as never)
      .map((node) => node.props.value);
    expect(inputs).toContain('和府捞面');

    await pressByText(tree, '保存整理结果（1）');
    expect(mockedReclassify).toHaveBeenCalledWith(
      expect.objectContaining({
        note: '和府捞面',
        action: 'merchant',
        merchant: '和府捞面',
        batch_key: expect.any(String),
      }),
    );
    expect(mockGoBack).toHaveBeenCalled();
  });

  it('商家与吃了什么可同选，保存为 both', async () => {
    const tree = await render(<NoteCleanupScreen />);

    await pressByText(tree, '商家');
    await pressByText(tree, '吃了什么');
    await pressByText(tree, '保存整理结果（1）');

    expect(mockedReclassify).toHaveBeenCalledWith(
      expect.objectContaining({
        note: '和府捞面',
        action: 'both',
        merchant: '和府捞面',
        item: '和府捞面',
        batch_key: expect.any(String),
      }),
    );
  });

  it('选「评价」时只保留备注，不要求商家 / 菜品字段', async () => {
    const tree = await render(<NoteCleanupScreen />);

    // 第三个候选是「有点咸」；评价按钮在每张卡里都有，取第三张。
    await pressByText(tree, '评价', 2);
    await pressByText(tree, '保存整理结果（1）');

    expect(mockedReclassify).toHaveBeenCalledWith(
      expect.objectContaining({
        note: '有点咸',
        action: 'evaluation',
        batch_key: expect.any(String),
      }),
    );
  });

  it('显示上次整理批次与撤销入口', async () => {
    mockedFetchCandidates.mockResolvedValue({
      ...fixture,
      last_cleanup: {
        batch_id: 9,
        created_at: '2026-11-12T16:40:00',
        affected_count: 5,
      },
    });
    const tree = await render(<NoteCleanupScreen />);
    const texts = textsOf(tree);

    expect(texts.some((text) => text.includes('上次整理'))).toBe(true);
    expect(texts.some((text) => text.includes('5 条'))).toBe(true);
    expect(texts).toContain('撤销');
  });

  it('点撤销并确认后调用 undo', async () => {
    mockedFetchCandidates.mockResolvedValueOnce({
      ...fixture,
      last_cleanup: {
        batch_id: 9,
        created_at: '2026-11-12T16:40:00',
        affected_count: 5,
      },
    });
    mockedFetchCandidates.mockResolvedValue({
      ...fixture,
      last_cleanup: null,
    });
    const alertSpy = jest
      .spyOn(Alert, 'alert')
      .mockImplementation((title, _message, buttons) => {
        if (title === '撤销上次整理？') {
          buttons?.find((button) => button.text === '撤销')?.onPress?.();
        }
      });

    try {
      const tree = await render(<NoteCleanupScreen />);
      await pressByText(tree, '撤销');
      await ReactTestRenderer.act(async () => {
        await Promise.resolve();
        await Promise.resolve();
      });
      expect(mockedUndo).toHaveBeenCalledWith(9);
    } finally {
      alertSpy.mockRestore();
    }
  });

  it('离线时读缓存并禁用保存', async () => {
    mockOnline = false;
    await writeCache(cacheKey(7, 'noteCandidates'), fixture);
    const tree = await render(<NoteCleanupScreen />);
    const texts = textsOf(tree);

    expect(
      texts.some((text) => text.includes('离线模式：可以查看候选，整理需要联网')),
    ).toBe(true);
    expect(mockedFetchCandidates).not.toHaveBeenCalled();
    expect(texts).toContain('保存整理结果（0）');
  });
});
