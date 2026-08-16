import React from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';

import { spacing, useTheme } from '../theme';

interface Props {
  /** 加载文案,传空则不显示。 */
  text?: string;
}

/** 居中加载态(转圈 + 可选文案)。 */
export default function LoadingView({ text = '加载中…' }: Props) {
  const colors = useTheme();
  return (
    <View style={styles.container}>
      <ActivityIndicator size="large" color={colors.primary} />
      {text ? (
        <Text style={[styles.text, { color: colors.textSecondary }]}>{text}</Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.md,
  },
  text: {
    fontSize: 14,
  },
});
