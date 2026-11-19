import React from 'react';
import { Text } from 'react-native';
import ReactTestRenderer, { act } from 'react-test-renderer';

import ErrorBoundary from '../src/components/ErrorBoundary';

jest.mock('react-native-linear-gradient', () => {
  const { View } = jest.requireActual('react-native');
  return {
    __esModule: true,
    default: ({ children }: { children?: React.ReactNode }) => (
      <View>{children}</View>
    ),
  };
});

/** 可控炸弹:第一次渲染抛错,重试后正常渲染。 */
let shouldThrow = true;

function Bomb() {
  if (shouldThrow) {
    throw new Error('渲染炸了');
  }
  return <Text>正常内容</Text>;
}

function renderBoundary() {
  return ReactTestRenderer.create(
    <ErrorBoundary>
      <Bomb />
    </ErrorBoundary>,
  );
}

function textsOf(tree: ReactTestRenderer.ReactTestRenderer): string[] {
  const out: string[] = [];
  const walk = (node: ReactTestRenderer.ReactTestInstance) => {
    node.children.forEach((child) => {
      if (typeof child === 'string') {
        out.push(child);
      } else {
        walk(child);
      }
    });
  };
  walk(tree.root);
  return out;
}

describe('ErrorBoundary', () => {
  let consoleError: jest.SpyInstance;

  beforeEach(() => {
    shouldThrow = true;
    // React 会把捕获到的异常再打一遍 console.error,测试里静音。
    consoleError = jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    consoleError.mockRestore();
  });

  it('子组件正常时不渲染兜底页', () => {
    shouldThrow = false;
    let tree: ReactTestRenderer.ReactTestRenderer | undefined;
    act(() => {
      tree = renderBoundary();
    });
    expect(textsOf(tree!)).toContain('正常内容');
    act(() => {
      tree?.unmount();
    });
  });

  it('子树抛错时显示兜底页并带上错误摘要', () => {
    let tree: ReactTestRenderer.ReactTestRenderer | undefined;
    act(() => {
      tree = renderBoundary();
    });
    const texts = textsOf(tree!);
    expect(texts).toContain('🫠');
    expect(texts).toContain('页面出了点问题');
    expect(texts.join(' ')).toContain('渲染炸了');
    act(() => {
      tree?.unmount();
    });
  });

  it('点重试会清空错误并重新渲染子树', () => {
    let tree: ReactTestRenderer.ReactTestRenderer | undefined;
    act(() => {
      tree = renderBoundary();
    });
    shouldThrow = false;
    const retry = tree!.root.findAll(
      (node) => typeof node.props.onPress === 'function',
    );
    expect(retry.length).toBeGreaterThan(0);
    act(() => {
      retry[0].props.onPress();
    });
    expect(textsOf(tree!)).toContain('正常内容');
    act(() => {
      tree?.unmount();
    });
  });
});
