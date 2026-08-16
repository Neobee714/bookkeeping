import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { spacing, useTheme } from '../theme';
import GradientButton from './GradientButton';

interface Props {
  emoji?: string;
  title?: string;
  message?: string;
  retryText?: string;
  onRetry?: () => void;
}

/** 错误态视图(emoji + 说明 + 渐变重试按钮)。 */
export default function ErrorView({
  emoji = '😵',
  title = '出错了',
  message,
  retryText = '重试',
  onRetry,
}: Props) {
  const colors = useTheme();
  return (
    <View style={styles.container}>
      <Text style={styles.emoji}>{emoji}</Text>
      <Text style={[styles.title, { color: colors.textPrimary }]}>{title}</Text>
      {message ? (
        <Text style={[styles.message, { color: colors.textSecondary }]}>
          {message}
        </Text>
      ) : null}
      {onRetry ? (
        <View style={styles.retryWrap}>
          <GradientButton title={retryText} onPress={onRetry} />
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.xl,
  },
  emoji: {
    fontSize: 48,
    marginBottom: spacing.md,
  },
  title: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: spacing.xs,
  },
  message: {
    fontSize: 13,
    textAlign: 'center',
    marginBottom: spacing.lg,
  },
  retryWrap: {
    minWidth: 140,
  },
});
