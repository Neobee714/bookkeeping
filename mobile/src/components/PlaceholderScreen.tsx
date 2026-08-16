import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { spacing, typography, useTheme } from '../theme';

interface Props {
  title: string;
  emoji?: string;
  description?: string;
  /** 额外内容(如操作按钮),渲染在说明文字下方。 */
  children?: React.ReactNode;
}

/**
 * 功能占位页:标题 + emoji + 后续填充提示。
 * 各功能模块(Fr-02 ~ FR-10)开发时以此为基础替换为真实页面。
 */
export default function PlaceholderScreen({
  title,
  emoji = '🚧',
  description = '功能开发中,敬请期待',
  children,
}: Props) {
  const colors = useTheme();
  return (
    <SafeAreaView
      style={[styles.safe, { backgroundColor: colors.background }]}
      edges={['top']}
    >
      <View style={styles.container}>
        <Text style={styles.emoji}>{emoji}</Text>
        <Text style={[styles.title, { color: colors.textPrimary }]}>{title}</Text>
        <Text style={[styles.description, { color: colors.textSecondary }]}>
          {description}
        </Text>
        {children}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
  },
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.xl,
  },
  emoji: {
    fontSize: 56,
    marginBottom: spacing.lg,
  },
  title: {
    ...typography.title,
    marginBottom: spacing.sm,
  },
  description: {
    ...typography.body,
    textAlign: 'center',
  },
});
