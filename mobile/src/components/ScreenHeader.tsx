import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { spacing, typography, useTheme } from '../theme';

interface Props {
  title: string;
  /** 返回按钮,不传则不显示。 */
  onBack?: () => void;
  /** 标题右侧附加内容(如操作按钮)。 */
  right?: React.ReactNode;
}

/** 二级页面顶部栏(返回 + 居中标题),配合 headerShown: false 的 Stack 页面使用。 */
export default function ScreenHeader({ title, onBack, right }: Props) {
  const colors = useTheme();
  return (
    <View
      style={[styles.header, { borderBottomColor: colors.border }]}
    >
      <View style={styles.side}>
        {onBack ? (
          <Pressable
            onPress={onBack}
            hitSlop={8}
            style={({ pressed }) => [styles.backButton, pressed && styles.pressed]}
          >
            <Text style={[styles.backIcon, { color: colors.textPrimary }]}>‹</Text>
          </Pressable>
        ) : null}
      </View>
      <Text
        style={[styles.title, { color: colors.textPrimary }]}
        numberOfLines={1}
      >
        {title}
      </Text>
      <View style={[styles.side, styles.sideRight]}>{right ?? null}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  side: {
    width: 44,
    justifyContent: 'center',
  },
  sideRight: {
    alignItems: 'flex-end',
  },
  backButton: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pressed: {
    opacity: 0.5,
  },
  backIcon: {
    fontSize: 30,
    lineHeight: 32,
    fontWeight: '600',
  },
  title: {
    flex: 1,
    ...typography.heading,
    textAlign: 'center',
  },
});
