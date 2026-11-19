import React, { type ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';

import { useTheme } from '../theme';
import ErrorView from './ErrorView';

interface Props {
  children: ReactNode;
  /** 自定义兜底;收到 reset 回调,点「重试」时清空错误状态重新渲染子树。 */
  fallback?: (reset: () => void, error: Error | null) => ReactNode;
}

interface State {
  error: Error | null;
}

/**
 * 顶层错误边界:任意子树在渲染/生命周期里抛错时落到兜底页,
 * 而不是整屏白屏(用户只能强制退出或重装)。
 *
 * 只捕获渲染期异常;Pressable onPress 等事件回调里的异常仍会冒到原生,
 * 但不会把已渲染的页面变成白屏。
 */
class ErrorBoundary extends React.Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    // 保留在 logcat 里:线上没有 crash 上报,这里是唯一线索。
    console.error(
      '[ErrorBoundary] 渲染异常',
      error?.message,
      info.componentStack,
    );
  }

  private reset = () => this.setState({ error: null });

  render() {
    const { error } = this.state;
    if (!error) {
      return this.props.children;
    }
    if (this.props.fallback) {
      return this.props.fallback(this.reset, error);
    }
    return <DefaultCrashFallback error={error} onRetry={this.reset} />;
  }
}

/** 默认兜底页:复用 ErrorView,跟随当前皮肤,给出可读的错误摘要。 */
export function DefaultCrashFallback({
  error,
  onRetry,
}: {
  error: Error | null;
  onRetry: () => void;
}) {
  const colors = useTheme();
  const detail = error?.message?.trim();
  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      <ErrorView
        emoji="🫠"
        title="页面出了点问题"
        message={
          detail
            ? `已拦截,数据未受影响。\n${detail}`
            : '已拦截,数据未受影响。'
        }
        retryText="重试"
        onRetry={onRetry}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
});

export default ErrorBoundary;
