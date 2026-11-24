/**
 * v0.25 账单邮箱设置页：未配置表单 / 已配置状态卡 / 测试连接失败 / 立即同步。
 * 网络层全部 mock，不依赖后端。
 */
import React from 'react';
import ReactTestRenderer from 'react-test-renderer';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import {
  deleteBillMailbox,
  fetchBillMailbox,
  saveBillMailbox,
  syncBillMailbox,
  testBillMailbox,
  type BillMailboxConfig,
} from '../src/api/billMailbox';
import BillMailboxScreen from '../src/screens/BillMailboxScreen';
import GradientButton from '../src/components/GradientButton';

jest.mock('../src/api/billMailbox', () => ({
  fetchBillMailbox: jest.fn(),
  saveBillMailbox: jest.fn(),
  testBillMailbox: jest.fn(),
  syncBillMailbox: jest.fn(),
  deleteBillMailbox: jest.fn(),
}));

const fetchMock = fetchBillMailbox as jest.MockedFunction<
  typeof fetchBillMailbox
>;
const saveMock = saveBillMailbox as jest.MockedFunction<typeof saveBillMailbox>;
const testMock = testBillMailbox as jest.MockedFunction<typeof testBillMailbox>;
const syncMock = syncBillMailbox as jest.MockedFunction<typeof syncBillMailbox>;
const deleteMock = deleteBillMailbox as jest.MockedFunction<
  typeof deleteBillMailbox
>;

const metrics = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 44, left: 0, right: 0, bottom: 34 },
};

const unconfigured: BillMailboxConfig = {
  configured: false,
  secret_stable: true,
};

const configured: BillMailboxConfig = {
  configured: true,
  provider: 'qq',
  host: 'imap.qq.com',
  port: 993,
  username: 'reader@qq.com',
  folder: 'INBOX',
  enabled: true,
  has_password: true,
  last_sync_at: '2026-11-23T10:30:00+08:00',
  last_status: 'ok',
  last_error: null,
  last_summary: '导入 2 笔，重复 1 封',
  secret_stable: true,
};

const flush = async () => {
  await ReactTestRenderer.act(async () => {
    await new Promise<void>((resolve) => setTimeout(() => resolve(), 0));
  });
};

const renderScreen = async () => {
  let tree: ReactTestRenderer.ReactTestRenderer | undefined;
  await ReactTestRenderer.act(async () => {
    tree = ReactTestRenderer.create(
      <SafeAreaProvider initialMetrics={metrics}>
        <BillMailboxScreen
          navigation={{ goBack: jest.fn() } as never}
          route={{ key: 'BillMailbox', name: 'BillMailbox' } as never}
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

/** 找到带指定回调的节点（Pressable / TextInput / Switch 的宿主与组合层都在）。 */
const findWith = (
  tree: ReactTestRenderer.ReactTestRenderer,
  testID: string,
  prop: string,
) => {
  const node = tree.root
    .findAllByProps({ testID })
    .find((candidate) => typeof candidate.props[prop] === 'function');
  if (!node) {
    throw new Error(`没有找到带 ${prop} 的 ${testID}`);
  }
  return node;
};

const press = async (
  tree: ReactTestRenderer.ReactTestRenderer,
  testID: string,
) => {
  const node = findWith(tree, testID, 'onPress');
  await ReactTestRenderer.act(async () => {
    node.props.onPress();
  });
  await flush();
};

const typeInto = async (
  tree: ReactTestRenderer.ReactTestRenderer,
  testID: string,
  text: string,
) => {
  const node = findWith(tree, testID, 'onChangeText');
  await ReactTestRenderer.act(async () => {
    node.props.onChangeText(text);
  });
};

const toggleSwitch = async (
  tree: ReactTestRenderer.ReactTestRenderer,
  testID: string,
  value: boolean,
) => {
  const node = findWith(tree, testID, 'onValueChange');
  await ReactTestRenderer.act(async () => {
    node.props.onValueChange(value);
  });
};

describe('BillMailboxScreen · 账单邮箱', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    fetchMock.mockResolvedValue(unconfigured);
    saveMock.mockResolvedValue(configured);
    testMock.mockResolvedValue({ ok: true });
    syncMock.mockResolvedValue({
      ok: true,
      messages: 3,
      imported: 2,
      duplicated: 1,
      failed: 0,
      error: null,
      summary: '3 封邮件：导入 2 笔，重复 1 笔',
    });
    deleteMock.mockResolvedValue({ configured: false });
  });

  it('未配置时渲染提供商 / 邮箱 / 授权码表单，保存时提交完整 payload', async () => {
    const tree = await renderScreen();
    const texts = textsOf(tree);

    expect(texts).toContain('账单邮箱');
    expect(texts).toContain('QQ 邮箱');
    expect(texts).toContain('163 邮箱');
    expect(texts).toContain('收信配置');

    const passwordInput = findWith(tree, 'mailbox-password', 'onChangeText');
    expect(passwordInput.props.placeholder).toBe('授权码，不是登录密码');
    expect(passwordInput.props.secureTextEntry).toBe(true);

    await typeInto(tree, 'mailbox-username', 'me@163.com');
    await typeInto(tree, 'mailbox-password', 'auth-code-123');
    await press(tree, 'mailbox-provider-163');
    await press(tree, 'mailbox-save');

    expect(saveMock).toHaveBeenCalledWith({
      provider: '163',
      username: 'me@163.com',
      password: 'auth-code-123',
      folder: 'INBOX',
      enabled: true,
    });
    expect(textsOf(tree)).toContain('已保存邮箱配置');
  });

  it('已配置时展示状态卡；授权码留空保存时 payload 不带 password', async () => {
    fetchMock.mockResolvedValue(configured);
    const tree = await renderScreen();
    const texts = textsOf(tree);

    expect(texts).toContain('邮箱状态');
    expect(texts).toContain('reader@qq.com');
    expect(texts).toContain('QQ 邮箱');
    expect(texts).toContain('已启用');
    expect(texts).toContain('导入 2 笔，重复 1 封');
    expect(texts).toContain(
      '留空表示不修改已保存的授权码；填写新授权码会覆盖旧值。',
    );

    await press(tree, 'mailbox-save');

    expect(saveMock).toHaveBeenCalledWith({
      provider: 'qq',
      username: 'reader@qq.com',
      folder: 'INBOX',
      enabled: true,
    });
    const payload = saveMock.mock.calls[0][0];
    expect(payload).not.toHaveProperty('password');
  });

  it('测试连接返回 400 可读原因时行内展示错误，不崩页面', async () => {
    fetchMock.mockResolvedValue(configured);
    testMock.mockRejectedValue(
      Object.assign(new Error('Request failed with status code 400'), {
        isAxiosError: true,
        response: {
          status: 400,
          data: { detail: '授权码不对，或邮箱没有开启 IMAP 服务' },
        },
      }),
    );
    const tree = await renderScreen();

    await press(tree, 'mailbox-test');

    expect(testMock).toHaveBeenCalledWith({
      provider: 'qq',
      username: 'reader@qq.com',
      folder: 'INBOX',
      enabled: true,
    });
    const texts = textsOf(tree);
    expect(texts).toContain('授权码不对，或邮箱没有开启 IMAP 服务');
    expect(texts).toContain('账单邮箱');
  });

  it('立即同步后展示后端 summary', async () => {
    fetchMock.mockResolvedValue(configured);
    const tree = await renderScreen();

    await press(tree, 'mailbox-sync');

    expect(syncMock).toHaveBeenCalledTimes(1);
    expect(textsOf(tree)).toContain('3 封邮件：导入 2 笔，重复 1 笔');
  });

  it('secret_stable 为 false 时展示授权码不稳定提示', async () => {
    fetchMock.mockResolvedValue({ ...configured, secret_stable: false });
    const tree = await renderScreen();

    expect(textsOf(tree)).toContain(
      '服务器 SECRET_KEY 不稳定，重启后需重填授权码。',
    );
  });

  it('删除前先确认，确认后调用 DELETE 并回到未配置表单', async () => {
    fetchMock.mockResolvedValue(configured);
    const tree = await renderScreen();

    await press(tree, 'mailbox-delete');
    expect(textsOf(tree)).toContain('删除邮箱配置');
    expect(deleteMock).not.toHaveBeenCalled();

    const confirm = tree.root
      .findAllByType(GradientButton)
      .find((node) => node.props.title === '删除');
    expect(confirm).toBeDefined();
    await ReactTestRenderer.act(async () => {
      confirm?.props.onPress();
    });
    await flush();

    expect(deleteMock).toHaveBeenCalledTimes(1);
    const texts = textsOf(tree);
    expect(texts).not.toContain('邮箱状态');
    expect(texts).toContain('已删除邮箱配置');
  });

  it('启用开关会带进保存 payload', async () => {
    const tree = await renderScreen();
    await typeInto(tree, 'mailbox-username', 'me@qq.com');
    await typeInto(tree, 'mailbox-password', 'auth-code');
    await toggleSwitch(tree, 'mailbox-enabled', false);
    await press(tree, 'mailbox-save');

    expect(saveMock).toHaveBeenCalledWith({
      provider: 'qq',
      username: 'me@qq.com',
      password: 'auth-code',
      folder: 'INBOX',
      enabled: false,
    });
  });
});
