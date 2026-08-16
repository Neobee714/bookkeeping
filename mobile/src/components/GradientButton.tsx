import React from 'react';
import {
  Pressable,
  StyleSheet,
  Text,
  type StyleProp,
  type ViewStyle,
} from 'react-native';

import { radius, spacing, typography } from '../theme';
import GradientView from './GradientView';

interface Props {
  title: string;
  onPress: () => void;
  disabled?: boolean;
  /** 作用于外层 Pressable,便于调用方控制布局(如 flex: 1)。 */
  style?: StyleProp<ViewStyle>;
}

/** 活力渐变主按钮(大圆角 + 渐变底)。 */
export default function GradientButton({
  title,
  onPress,
  disabled = false,
  style,
}: Props) {
  return (
    <Pressable
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [styles.pressable, style, pressed && styles.pressed]}
    >
      <GradientView style={[styles.gradient, disabled && styles.disabled]}>
        <Text style={styles.text}>{title}</Text>
      </GradientView>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  pressable: {
    borderRadius: radius.xl,
  },
  gradient: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.lg,
    paddingHorizontal: spacing.xl,
    borderRadius: radius.xl,
  },
  pressed: {
    opacity: 0.85,
  },
  disabled: {
    opacity: 0.5,
  },
  text: {
    ...typography.button,
    color: '#FFFFFF',
  },
});
