import React from 'react';
import { StyleSheet, type StyleProp, type ViewStyle } from 'react-native';
import LinearGradient from 'react-native-linear-gradient';

import { radius, useSkin } from '../theme';

interface Props {
  /** 渐变起始色 → 结束色；默认取当前皮肤的主渐变。 */
  colors?: [string, string];
  /** 渐变方向,默认左上 → 右下。 */
  start?: { x: number; y: number };
  end?: { x: number; y: number };
  style?: StyleProp<ViewStyle>;
  children?: React.ReactNode;
}

/**
 * 活力渐变容器(核心视觉元素)。
 * 默认紫 #8B5CF6 → 粉 #EC4899,带大圆角;按钮 / FAB / Tab 选中胶囊 / 卡片强调均可用。
 */
export default function GradientView({
  colors,
  start = { x: 0, y: 0 },
  end = { x: 1, y: 1 },
  style,
  children,
}: Props) {
  const skin = useSkin();
  return (
    <LinearGradient
      colors={colors ?? skin.gradient}
      start={start}
      end={end}
      style={[styles.base, style]}
    >
      {children}
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  base: {
    borderRadius: radius.lg,
  },
});
