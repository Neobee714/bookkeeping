import React from 'react';
import {
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
  type KeyboardTypeOptions,
} from 'react-native';

import { radius, spacing, typography, useTheme } from '../theme';
import GradientButton from './GradientButton';

export interface InputModalField {
  key: string;
  placeholder?: string;
  value: string;
  onChangeText: (text: string) => void;
  multiline?: boolean;
  maxLength?: number;
  keyboardType?: KeyboardTypeOptions;
  autoCapitalize?: 'none' | 'sentences' | 'words' | 'characters';
  /** 密码类输入:遮蔽明文。 */
  secureTextEntry?: boolean;
}

interface Props {
  visible: boolean;
  title: string;
  fields: InputModalField[];
  confirmText?: string;
  cancelText?: string;
  loading?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

/** 通用输入弹窗(标题 + 若干输入项 + 渐变确认按钮),用于创建/加入/编辑等表单。 */
export default function InputModal({
  visible,
  title,
  fields,
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
          {fields.map((field) => (
            <TextInput
              key={field.key}
              style={[
                styles.input,
                { backgroundColor: colors.surface, color: colors.textPrimary },
              ]}
              placeholder={field.placeholder}
              placeholderTextColor={colors.textTertiary}
              value={field.value}
              onChangeText={field.onChangeText}
              multiline={field.multiline}
              maxLength={field.maxLength}
              keyboardType={field.keyboardType}
              autoCapitalize={field.autoCapitalize}
              secureTextEntry={field.secureTextEntry}
            />
          ))}
          <View style={styles.actions}>
            <Pressable
              onPress={onCancel}
              style={[styles.cancelButton, { backgroundColor: colors.surface }]}
            >
              <Text
                style={[styles.cancelText, { color: colors.textSecondary }]}
              >
                {cancelText}
              </Text>
            </Pressable>
            <GradientButton
              title={confirmText}
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
    marginBottom: spacing.lg,
  },
  input: {
    borderRadius: radius.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    marginBottom: spacing.md,
    fontSize: 15,
    minHeight: 48,
    textAlignVertical: 'center',
  },
  actions: {
    flexDirection: 'row',
    gap: spacing.md,
    marginTop: spacing.sm,
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
