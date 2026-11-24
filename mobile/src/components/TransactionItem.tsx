import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { radius, spacing, typography, useSkin, useTheme } from '../theme';
import { formatMoney } from '../utils/format';
import type { Transaction } from '../types';

interface Props {
  item: Transaction;
  /** 分类 emoji 图标(取自分类表)。 */
  icon: string;
  /** 分类主题色(#RRGGBB)。 */
  color: string;
  /** 本地待同步（尚未上传）。 */
  pending?: boolean;
  /** 本地待同步且 4xx 同步失败。 */
  syncFailed?: boolean;
  onPress: () => void;
  onLongPress: () => void;
}

/** 账单列表行:分类图标 + 名称/备注 + 金额(收绿/支红)。 */
export default function TransactionItem({
  item,
  icon,
  color,
  pending,
  syncFailed,
  onPress,
  onLongPress,
}: Props) {
  const colors = useTheme();
  const skin = useSkin();
  const isIncome = item.type === 'income';
  const amountText = `${isIncome ? '+¥ ' : '-¥ '}${formatMoney(item.amount)}`;
  const amountColor = isIncome ? colors.income : colors.expense;
  const iconBg = color ? `${color}1A` : colors.surface;

  // 标题 商家 || 平台 || 分类；副标题 备注 || 有商家/平台时的分类 || 无备注。
  const merchant = item.merchant?.trim() ?? '';
  const channel = item.channel?.trim() ?? '';
  const note = item.note?.trim() ?? '';
  const title = merchant || channel || item.category;
  const subtitle = note || (merchant || channel ? item.category : '无备注');
  /** 商家做标题时，副行前置平台 chip；只有平台时标题已经是平台，不重复。 */
  const showChannelChip = merchant.length > 0 && channel.length > 0 && channel !== merchant;

  return (
    <Pressable
      onPress={onPress}
      onLongPress={onLongPress}
      delayLongPress={450}
      style={({ pressed }) => [
        styles.row,
        skin.surfaces.card,
        pressed && styles.pressed,
      ]}
    >
      <View style={[styles.iconWrap, { backgroundColor: iconBg }]}>
        <Text style={styles.icon}>{icon}</Text>
      </View>

      <View style={styles.main}>
        <View style={styles.categoryRow}>
          <Text
            numberOfLines={1}
            style={[styles.category, { color: colors.textPrimary }]}
          >
            {title}
          </Text>
          {item.recurring_rule_id ? (
            <View
              style={[styles.recurringBadge, { backgroundColor: colors.chipSoftBg }]}
            >
              <Text
                style={[styles.recurringBadgeText, { color: colors.chipSoftText }]}
              >
                循环
              </Text>
            </View>
          ) : null}
        </View>
        <View style={styles.subRow}>
          {showChannelChip ? (
            <View
              testID="transaction-channel-chip"
              style={[styles.channelBadge, { backgroundColor: colors.chipSoftBg }]}
            >
              <Text
                numberOfLines={1}
                ellipsizeMode="tail"
                style={[styles.channelBadgeText, { color: colors.chipSoftText }]}
              >
                {channel}
              </Text>
            </View>
          ) : null}
          <Text
            numberOfLines={1}
            style={[styles.note, { color: colors.textSecondary }]}
          >
            {subtitle}
          </Text>
        </View>
        {pending ? (
          <View
            style={[
              styles.syncBadge,
              {
                backgroundColor: syncFailed
                  ? `${colors.expense}1A`
                  : `${colors.primary}1A`,
              },
            ]}
          >
            <Text
              style={[
                styles.syncBadgeText,
                { color: syncFailed ? colors.expense : colors.primary },
              ]}
            >
              {syncFailed ? '同步失败' : '待同步'}
            </Text>
          </View>
        ) : null}
      </View>

      <Text style={[styles.amount, { color: amountColor }]}>{amountText}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    borderRadius: radius.lg,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  pressed: {
    opacity: 0.85,
  },
  iconWrap: {
    width: 42,
    height: 42,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  icon: {
    fontSize: 21,
  },
  main: {
    flex: 1,
    minWidth: 0,
  },
  categoryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  category: {
    fontSize: 14,
    fontWeight: '600',
    flexShrink: 1,
  },
  /** 「循环」小标：与 note 行同宽高节奏，底色走主题 chip token。 */
  recurringBadge: {
    flexShrink: 0,
    borderRadius: 999,
    paddingHorizontal: 6,
    paddingVertical: 1,
  },
  recurringBadgeText: {
    fontSize: 10,
    fontWeight: '700',
  },
  note: {
    fontSize: 11,
    flexShrink: 1,
  },
  /** 副行：平台 chip + 备注/分类，chip 超宽省略，备注让位。 */
  subRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 3,
  },
  channelBadge: {
    flexShrink: 0,
    maxWidth: 84,
    borderRadius: 999,
    paddingHorizontal: 6,
    paddingVertical: 1,
  },
  channelBadgeText: {
    fontSize: 10,
    fontWeight: '600',
  },
  syncBadge: {
    alignSelf: 'flex-start',
    borderRadius: 6,
    paddingHorizontal: 6,
    paddingVertical: 2,
    marginTop: 4,
  },
  syncBadgeText: {
    fontSize: 10,
    fontWeight: '600',
  },
  amount: {
    ...typography.amount,
    fontSize: 15,
    flexShrink: 0,
  },
});
