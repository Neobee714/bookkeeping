import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { radius, spacing, typography, useTheme } from '../theme';
import { formatMoney } from '../utils/format';
import type { Transaction } from '../types';

interface Props {
  item: Transaction;
  /** 分类 emoji 图标(取自分类表)。 */
  icon: string;
  /** 分类主题色(#RRGGBB)。 */
  color: string;
  onPress: () => void;
  onLongPress: () => void;
}

/** 账单列表行:分类图标 + 名称/备注 + 金额(收绿/支红)。 */
export default function TransactionItem({
  item,
  icon,
  color,
  onPress,
  onLongPress,
}: Props) {
  const colors = useTheme();
  const isIncome = item.type === 'income';
  const amountText = `${isIncome ? '+¥ ' : '-¥ '}${formatMoney(item.amount)}`;
  const amountColor = isIncome ? colors.income : colors.expense;
  const iconBg = color ? `${color}1A` : colors.surface;

  return (
    <Pressable
      onPress={onPress}
      onLongPress={onLongPress}
      delayLongPress={450}
      style={({ pressed }) => [
        styles.row,
        { backgroundColor: colors.card },
        pressed && styles.pressed,
      ]}
    >
      <View style={[styles.iconWrap, { backgroundColor: iconBg }]}>
        <Text style={styles.icon}>{icon}</Text>
      </View>

      <View style={styles.main}>
        <Text style={[styles.category, { color: colors.textPrimary }]}>
          {item.category}
        </Text>
        <Text
          numberOfLines={1}
          style={[styles.note, { color: colors.textSecondary }]}
        >
          {item.note || '无备注'}
        </Text>
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
  category: {
    fontSize: 14,
    fontWeight: '600',
  },
  note: {
    fontSize: 11,
    marginTop: 3,
  },
  amount: {
    ...typography.amount,
    fontSize: 15,
    flexShrink: 0,
  },
});
