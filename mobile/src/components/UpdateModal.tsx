import React from 'react';
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { radius, spacing, typography, useTheme } from '../theme';
import GradientButton from './GradientButton';
import GradientView from './GradientView';

interface UpdateModalProps {
  visible: boolean;
  updateInfo: {
    version: string;
    size?: number;
    changelog?: string;
    force?: boolean;
  } | null;
  /** 点「立即更新」。 */
  onUpdate: () => void;
  /** 点「稍后」;force 模式下不展示。 */
  onLater?: () => void;
  /** Android 返回键关闭;force 模式下忽略。 */
  onRequestClose?: () => void;
}

/** 字节 → MB,保留 1 位小数(如 72450000 → 69.1)。 */
function formatSizeMB(bytes: number): string {
  return (bytes / 1024 / 1024).toFixed(1);
}

/** changelog 按行拆分,去空行。 */
function splitChangelog(changelog?: string): string[] {
  return (changelog ?? '')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
}

/**
 * 更新弹窗(风格 A 活力渐变,与 App 一致)。
 * 可选更新:「立即更新」+「稍后」;强制更新:隐藏「稍后」、不可关闭、红色强制提示。
 */
export function UpdateModal({
  visible,
  updateInfo,
  onUpdate,
  onLater,
  onRequestClose,
}: UpdateModalProps) {
  const colors = useTheme();
  if (!visible || !updateInfo) {
    return null;
  }
  const { version, size, changelog, force = false } = updateInfo;
  const changelogLines = splitChangelog(changelog);

  const handleRequestClose = () => {
    if (!force) {
      onRequestClose?.();
    }
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={handleRequestClose}
    >
      <View style={[styles.overlay, { backgroundColor: colors.overlay }]}>
        <View style={[styles.card, { backgroundColor: colors.card }]}>
          {/* 头部:紫粉渐变 + 图标 + 标题 + 版本徽标 */}
          <GradientView style={styles.hero}>
            <View style={styles.appIcon}>
              <Text style={styles.appIconEmoji}>📒</Text>
            </View>
            <Text style={styles.title}>
              {force ? '必须更新到新版本' : '发现新版本'}
            </Text>
            <View style={styles.badge}>
              <Text style={styles.badgeText}>v{version}</Text>
            </View>
          </GradientView>

          {/* 主体:大小 + 更新说明 + 按钮 */}
          <View style={styles.body}>
            {typeof size === 'number' && size > 0 ? (
              <View style={styles.sizeRow}>
                <View
                  style={[styles.sizeDot, { backgroundColor: colors.primary }]}
                />
                <Text style={[styles.sizeText, { color: colors.primary }]}>
                  新版本大小：{formatSizeMB(size)} MB
                </Text>
              </View>
            ) : null}

            <View
              style={[
                styles.changelogBox,
                { backgroundColor: colors.surface, borderColor: colors.border },
              ]}
            >
              <Text style={[styles.changelogTitle, { color: colors.primary }]}>
                更新内容
              </Text>
              {changelogLines.length > 0 ? (
                <ScrollView style={styles.changelogList}>
                  {changelogLines.map((line, index) => (
                    <View key={index} style={styles.changelogItem}>
                      <Text
                        style={[
                          styles.changelogMarker,
                          { color: colors.primary },
                        ]}
                      >
                        ✦
                      </Text>
                      <Text
                        style={[
                          styles.changelogText,
                          { color: colors.textSecondary },
                        ]}
                      >
                        {line}
                      </Text>
                    </View>
                  ))}
                </ScrollView>
              ) : (
                <Text
                  style={[styles.changelogEmpty, { color: colors.textTertiary }]}
                >
                  暂无更新说明
                </Text>
              )}
            </View>

            <View style={styles.actions}>
              {!force && onLater ? (
                <Pressable
                  onPress={onLater}
                  style={({ pressed }) => [
                    styles.laterButton,
                    { backgroundColor: colors.surface },
                    pressed && styles.pressed,
                  ]}
                >
                  <Text style={[styles.laterText, { color: colors.primary }]}>
                    稍后
                  </Text>
                </Pressable>
              ) : null}
              <GradientButton
                title="立即更新"
                onPress={onUpdate}
                style={
                  force ? styles.updateButtonForce : styles.updateButton
                }
              />
            </View>

            {force ? (
              <Text style={[styles.forceTip, { color: colors.expense }]}>
                ⚠ 此版本为强制更新，更新后方可继续使用
              </Text>
            ) : null}
          </View>
        </View>
      </View>
    </Modal>
  );
}

export default UpdateModal;

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.xl,
  },
  card: {
    width: '88%',
    maxWidth: 380,
    borderRadius: radius.xl,
    overflow: 'hidden',
    shadowColor: '#6B3CFF',
    shadowOffset: { width: 0, height: 16 },
    shadowOpacity: 0.28,
    shadowRadius: 24,
    elevation: 16,
  },
  hero: {
    alignItems: 'center',
    // 覆盖 GradientView 默认圆角,顶部圆角由卡片 overflow hidden 裁切
    borderRadius: 0,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
    paddingBottom: spacing.xl,
  },
  appIcon: {
    width: 56,
    height: 56,
    borderRadius: 16,
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.5)',
    backgroundColor: 'rgba(255,255,255,0.22)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  appIconEmoji: {
    fontSize: 28,
  },
  title: {
    ...typography.heading,
    color: '#FFFFFF',
    textAlign: 'center',
    marginTop: spacing.sm,
  },
  badge: {
    backgroundColor: 'rgba(255,255,255,0.25)',
    borderColor: 'rgba(255,255,255,0.4)',
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: spacing.md,
    paddingVertical: 2,
    marginTop: spacing.sm,
  },
  badgeText: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '600',
  },
  body: {
    padding: spacing.lg,
  },
  sizeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  sizeDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  sizeText: {
    fontSize: 12,
    fontWeight: '600',
  },
  changelogBox: {
    borderWidth: 1,
    borderRadius: radius.md,
    padding: spacing.md + 2,
  },
  changelogTitle: {
    fontSize: 12,
    fontWeight: '700',
    marginBottom: spacing.xs,
  },
  changelogList: {
    maxHeight: 120,
  },
  changelogItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
  },
  changelogMarker: {
    fontSize: 10,
    lineHeight: 22,
  },
  changelogText: {
    flex: 1,
    fontSize: 13,
    lineHeight: 22,
  },
  changelogEmpty: {
    fontSize: 13,
  },
  actions: {
    flexDirection: 'row',
    gap: spacing.md,
    marginTop: spacing.lg,
  },
  laterButton: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.lg,
    borderRadius: radius.xl,
  },
  laterText: {
    ...typography.button,
  },
  updateButton: {
    flex: 1,
  },
  updateButtonForce: {
    width: '100%',
  },
  forceTip: {
    textAlign: 'center',
    fontSize: 11,
    fontWeight: '600',
    marginTop: spacing.md,
  },
  pressed: {
    opacity: 0.85,
  },
});
