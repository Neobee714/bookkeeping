import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { spacing, useTheme } from '../theme';

interface Props {
  emoji?: string;
  title?: string;
  description?: string;
}

/** 空态视图(emoji + 标题 + 说明)。 */
export default function EmptyView({
  emoji = '🫙',
  title = '暂无数据',
  description,
}: Props) {
  const colors = useTheme();
  return (
    <View style={styles.container}>
      <Text style={styles.emoji}>{emoji}</Text>
      <Text style={[styles.title, { color: colors.textPrimary }]}>{title}</Text>
      {description ? (
        <Text style={[styles.description, { color: colors.textSecondary }]}>
          {description}
        </Text>
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
  description: {
    fontSize: 13,
    textAlign: 'center',
  },
});
