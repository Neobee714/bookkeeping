/**
 * @format
 */

import React from 'react';
import ReactTestRenderer from 'react-test-renderer';

import LoadingView from '../src/components/LoadingView';

// 注:App 依赖 react-navigation 与原生模块(keychain/async-storage 等),
// 完整渲染需要原生环境;此处对纯 UI 组件做冒烟测试。
test('renders LoadingView correctly', async () => {
  let tree: ReactTestRenderer.ReactTestRenderer | undefined;
  await ReactTestRenderer.act(() => {
    tree = ReactTestRenderer.create(<LoadingView text="加载中" />);
  });
  expect(tree?.toJSON()).toBeTruthy();
});
