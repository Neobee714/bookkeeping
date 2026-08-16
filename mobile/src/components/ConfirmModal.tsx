import React from 'react';
import {
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { radius, spacing, typography, useTheme } from '../theme';
import GradientButton from './GradientButton';

interface Props {
  visible: boolean;
  title: string;
  message?: string;
  confirmText?: string;
  cancelText?: string;
  /** 确认操作进行中:禁用按钮并展示「处理中…」。 */
  loading?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

/** 确认弹窗(遮罩 + 白卡片 + 渐变确认按钮)。 */
export default function ConfirmModal({
  visible,
  title,
  message,
  confirmText = '确认',
  cancelText = '取消',
  loading = false,
  onConfirm,
  onCancel,
}: Props) {
  const colors = useTheme();
  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onCancel}
    >
      <View style={[styles.overlay, { backgroundColor: colors.overlay }]}>
        <View style={[styles.card, { backgroundColor: colors.card }]}>
          <Text style={[styles.title, { color: colors.textPrimary }]}>
            {title}
          </Text>
          {message ? (
            <Text style={[styles.message, { color: colors.textSecondary }]}>
              {message}
            </Text>
          ) : null}
          <View style={styles.actions}>
            <Pressable
              onPress={onCancel}
              disabled={loading}
              style={[styles.cancelButton, { backgroundColor: colors.surface }]}
            >
              <Text style={[styles.cancelText, { color: colors.textSecondary }]}>
                {cancelText}
              </Text>
            </Pressable>
            <GradientButton
              title={loading ? '处理中…' : confirmText}
              onPress={onConfirm}
              disabled={loading}
              style={styles.confirmButton}
            />
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.xl,
  },
  card: {
    width: '100%',
    maxWidth: 340,
    borderRadius: radius.xl,
    padding: spacing.xl,
  },
  title: {
    ...typography.heading,
    marginBottom: spacing.sm,
  },
  message: {
    ...typography.body,
    marginBottom: spacing.lg,
    lineHeight: 22,
  },
  actions: {
    flexDirection: 'row',
    gap: spacing.md,
  },
  cancelButton: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.lg,
    borderRadius: radius.xl,
  },
  cancelText: {
    ...typography.button,
  },
  confirmButton: {
    flex: 1,
  },
});
