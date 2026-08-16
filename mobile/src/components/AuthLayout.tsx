import React from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { spacing, typography } from '../theme';
import GradientView from './GradientView';

interface Props {
  emoji: string;
  title: string;
  subtitle: string;
  children: React.ReactNode;
  /** 表单容器内边距等定制(默认水平 padding 36)。 */
  contentStyle?: StyleProp<ViewStyle>;
}

/**
 * 认证页外壳:全屏「活力渐变」背景 + Logo + 标题 + 表单滚动区。
 * 登录 / 注册共用,保证两页视觉一致(见 prototype 01 登录页)。
 *
 * 沉浸式结构:渐变作为最底层铺满整个屏幕(含状态栏/挖孔区域),
 * 内部用 SafeAreaView 让内容避让状态栏与底部,保证可读。
 */
export default function AuthLayout({
  emoji,
  title,
  subtitle,
  children,
  contentStyle,
}: Props) {
  return (
    <GradientView style={styles.background}>
      {/* 登录/注册页顶部为渐变:状态栏图标固定白色。
          AuthLayout 卸载后 RN StatusBar 自动恢复 App 层的主题色配置。 */}
      <StatusBar barStyle="light-content" />
      <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
        <KeyboardAvoidingView
          style={styles.flex}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          <ScrollView
            contentContainerStyle={styles.scroll}
            keyboardShouldPersistTaps="handled"
          >
            <View style={styles.logoWrap}>
              <View style={styles.logoBox}>
                <Text style={styles.logoEmoji}>{emoji}</Text>
              </View>
            </View>
            <Text style={styles.title}>{title}</Text>
            <Text style={styles.subtitle}>{subtitle}</Text>
            <View style={[styles.form, contentStyle]}>{children}</View>
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </GradientView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
  },
  flex: {
    flex: 1,
  },
  background: {
    flex: 1,
    borderRadius: 0,
  },
  scroll: {
    flexGrow: 1,
    justifyContent: 'center',
    paddingVertical: spacing.xxl,
  },
  logoWrap: {
    alignItems: 'center',
    marginBottom: spacing.lg,
  },
  logoBox: {
    width: 88,
    height: 88,
    borderRadius: 26,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000000',
    shadowOpacity: 0.28,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 8 },
    elevation: 8,
  },
  logoEmoji: {
    fontSize: 46,
  },
  title: {
    ...typography.title,
    color: '#FFFFFF',
    textAlign: 'center',
    letterSpacing: 2,
  },
  subtitle: {
    ...typography.body,
    color: 'rgba(255, 255, 255, 0.88)',
    textAlign: 'center',
    marginTop: spacing.sm,
  },
  form: {
    marginTop: spacing.xxl,
    paddingHorizontal: 36,
    gap: spacing.lg,
  },
});
