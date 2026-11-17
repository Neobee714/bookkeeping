import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { extractErrorMessage } from '../api/client';
import { CATEGORY_COLORS } from '../api/stats';
import { fetchPartnerTransactions, fetchTransactions } from '../api/transactions';
import EmptyView from '../components/EmptyView';
import ErrorView from '../components/ErrorView';
import GradientView from '../components/GradientView';
import LoadingView from '../components/LoadingView';
import ScreenHeader from '../components/ScreenHeader';
import SegmentedControl from '../components/SegmentedControl';
import TransactionItem from '../components/TransactionItem';
import type { RootStackParamList } from '../navigation/types';
import { cacheKey, readCache, writeCache } from '../offline/cache';
import { useAuthStore } from '../store/authStore';
import { radius, spacing, typography, useSkin, useTheme } from '../theme';
import type { Transaction } from '../types';
import {
  aggregateNotes,
  buildDayGroups,
  elapsedDaysOfMonth,
  filterCategoryTransactions,
} from '../utils/categoryDetail';
import { getCategoryEmoji } from '../utils/categoryMeta';
import { formatDateLabel, formatMoney } from '../utils/format';

type DetailNavigation = NativeStackNavigationProp<RootStackParamList, 'CategoryDetail'>;
type DetailRoute = RouteProp<RootStackParamList, 'CategoryDetail'>;

const formatMonthLabel = (month: string): string => {
  const [year, monthNumber] = month.split('-');
  return `${year}年${Number(monthNumber)}月`;
};

const noop = () => undefined;

/**
 * 分类/商家明细页（v0.21）：图表页支出分布点入。
 * 汇总卡 + 「明细 / 备注」两档；数据用整月账单（我的/伴侣）本地过滤聚合，先缓存后联网。
 */
export default function CategoryDetailScreen() {
  const navigation = useNavigation<DetailNavigation>();
  const route = useRoute<DetailRoute>();
  const { dimension, name, month, tab } = route.params;
  const colors = useTheme();
  const skin = useSkin();
  const userId = useAuthStore((s) => s.user?.id);

  const heroGradient = skin.heroGradient ?? [skin.colors.card, skin.colors.card];
  const heroCellBg = skin.heroGradient
    ? 'rgba(255, 255, 255, 0.20)'
    : 'rgba(43, 52, 69, 0.07)';

  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [view, setView] = useState<'detail' | 'note'>('detail');
  const [expandedNote, setExpandedNote] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!userId) {
      setLoading(false);
      return;
    }
    const key = cacheKey(userId, 'tx', tab, month);
    let cached: Transaction[] | null = null;
    try {
      cached = await readCache<Transaction[]>(key);
    } catch {
      cached = null;
    }
    if (cached) {
      setTransactions(cached);
      setLoading(false);
    }
    setError('');
    try {
      const fresh =
        tab === 'partner'
          ? await fetchPartnerTransactions(month)
          : await fetchTransactions(month);
      setTransactions(fresh);
      setLoading(false);
      writeCache(key, fresh).catch(() => undefined);
    } catch (err) {
      if (!cached) {
        setError(extractErrorMessage(err, '账单加载失败'));
        setLoading(false);
      }
    }
  }, [userId, tab, month]);

  useEffect(() => {
    load();
  }, [load]);

  const filtered = useMemo(
    () => filterCategoryTransactions(transactions, dimension, name),
    [transactions, dimension, name],
  );

  const total = useMemo(
    () => filtered.reduce((sum, tx) => sum + tx.amount, 0),
    [filtered],
  );
  const monthExpense = useMemo(
    () =>
      transactions
        .filter((tx) => tx.type === 'expense')
        .reduce((sum, tx) => sum + tx.amount, 0),
    [transactions],
  );
  const percent = monthExpense > 0 ? Math.round((total / monthExpense) * 100) : 0;
  const average = filtered.length > 0 ? total / filtered.length : 0;
  const daily = total / elapsedDaysOfMonth(month);
  const dayGroups = useMemo(() => buildDayGroups(filtered), [filtered]);
  const noteRows = useMemo(() => aggregateNotes(filtered), [filtered]);
  const maxNoteAmount = noteRows.length > 0 ? noteRows[0].amount : 0;

  const tabLabel = tab === 'partner' ? '伴侣账本' : '我的账本';

  return (
    <SafeAreaView
      style={[styles.safe, { backgroundColor: colors.background }]}
      edges={['top', 'left', 'right']}
    >
      <ScreenHeader title={name} onBack={() => navigation.goBack()} />
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        <GradientView colors={heroGradient} style={styles.hero}>
          <Text style={[styles.heroMeta, { color: skin.colors.onHeroMuted }]}>
            {`${formatMonthLabel(month)} · ${tabLabel} · ${
              dimension === 'category' ? getCategoryEmoji(name) : '🏪'
            } ${name}`}
          </Text>
          <View style={styles.heroSum}>
            <Text style={[styles.heroAmount, { color: skin.colors.onHero }]}>
              ¥{formatMoney(total)}
            </Text>
            <Text style={[styles.heroCount, { color: skin.colors.onHeroMuted }]}>
              {`${filtered.length} 笔`}
            </Text>
          </View>
          <View style={styles.heroCells}>
            <View style={[styles.heroCell, { backgroundColor: heroCellBg }]}>
              <Text style={[styles.cellLabel, { color: skin.colors.onHeroMuted }]}>
                占本月支出
              </Text>
              <Text style={[styles.cellValue, { color: skin.colors.onHero }]}>
                {`${percent}%`}
              </Text>
            </View>
            <View style={[styles.heroCell, { backgroundColor: heroCellBg }]}>
              <Text style={[styles.cellLabel, { color: skin.colors.onHeroMuted }]}>
                日均
              </Text>
              <Text style={[styles.cellValue, { color: skin.colors.onHero }]}>
                ¥{formatMoney(daily)}
              </Text>
            </View>
            <View style={[styles.heroCell, { backgroundColor: heroCellBg }]}>
              <Text style={[styles.cellLabel, { color: skin.colors.onHeroMuted }]}>
                笔均
              </Text>
              <Text style={[styles.cellValue, { color: skin.colors.onHero }]}>
                ¥{formatMoney(average)}
              </Text>
            </View>
          </View>
        </GradientView>

        <View style={styles.segmentWrap}>
          <SegmentedControl
            options={[
              { key: 'detail', label: '明细' },
              { key: 'note', label: '备注' },
            ]}
            value={view}
            onChange={(key) => setView(key as 'detail' | 'note')}
          />
        </View>

        {loading && transactions.length === 0 ? (
          <LoadingView text="加载账单…" />
        ) : error && transactions.length === 0 ? (
          <ErrorView
            title="账单加载失败"
            message={error}
            onRetry={() => {
              setLoading(true);
              load();
            }}
          />
        ) : filtered.length === 0 ? (
          <EmptyView
            emoji={dimension === 'category' ? '🌱' : '🏪'}
            title="这个月没有相关支出"
            description={
              dimension === 'category'
                ? '该分类本月没有支出账单'
                : '该商家本月没有支出账单'
            }
          />
        ) : view === 'detail' ? (
          <View>
            {dayGroups.map((group) => (
              <View key={group.date} style={styles.dayGroup}>
                <View style={styles.dayRow}>
                  <Text style={[styles.dayLabel, { color: colors.textSecondary }]}>
                    {formatDateLabel(group.date)}
                  </Text>
                  <Text style={[styles.dayTotal, { color: colors.textTertiary }]}>
                    {`¥${formatMoney(group.total)}`}
                  </Text>
                </View>
                {group.items.map((item) => (
                  <TransactionItem
                    key={item.id}
                    item={item}
                    icon={getCategoryEmoji(item.category)}
                    color={CATEGORY_COLORS[item.category] ?? colors.primary}
                    onPress={noop}
                    onLongPress={noop}
                  />
                ))}
              </View>
            ))}
          </View>
        ) : (
          <View>
            {noteRows.map((row) => {
              const expanded = expandedNote === row.note;
              const barPercent =
                maxNoteAmount > 0 ? Math.round((row.amount / maxNoteAmount) * 100) : 0;
              return (
                <Pressable
                  key={row.note}
                  onPress={() => setExpandedNote(expanded ? null : row.note)}
                  style={({ pressed }) => [
                    styles.noteCard,
                    skin.surfaces.card,
                    { borderColor: colors.border },
                    pressed && styles.pressed,
                  ]}
                >
                  <View style={styles.noteTop}>
                    <Text
                      style={[styles.noteName, { color: colors.textPrimary }]}
                      numberOfLines={1}
                      ellipsizeMode="tail"
                    >
                      {row.note}
                    </Text>
                    <Text style={[styles.noteAmount, { color: colors.textPrimary }]}>
                      ¥{formatMoney(row.amount)}
                    </Text>
                  </View>
                  <Text style={[styles.noteMeta, { color: colors.textTertiary }]}>
                    {`${row.count} 次 · 平均 ¥${formatMoney(row.avg)}`}
                  </Text>
                  <View style={[styles.noteTrack, { backgroundColor: colors.surface }]}>
                    <View
                      style={[
                        styles.noteFill,
                        { width: `${barPercent}%`, backgroundColor: colors.primary },
                      ]}
                    />
                  </View>
                  {expanded ? (
                    <View style={[styles.noteSub, { borderLeftColor: colors.border }]}>
                      {filtered
                        .filter((tx) => ((tx.note ?? '').trim() || '未备注') === row.note)
                        .map((tx) => (
                          <View key={tx.id} style={styles.noteSubRow}>
                            <Text
                              style={[styles.noteSubText, { color: colors.textSecondary }]}
                              numberOfLines={1}
                            >
                              {`${tx.date.slice(5)} · ${tx.merchant || tx.category}`}
                            </Text>
                            <Text style={[styles.noteSubAmount, { color: colors.textSecondary }]}>
                              -¥ {formatMoney(tx.amount)}
                            </Text>
                          </View>
                        ))}
                    </View>
                  ) : null}
                </Pressable>
              );
            })}
            <Text style={[styles.footNote, { color: colors.textTertiary }]}>
              备注是记账时的自由文本，相同文字合并统计；未填备注的账单归入「未备注」。
            </Text>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
  },
  scrollContent: {
    paddingTop: spacing.sm,
    paddingBottom: spacing.xxl,
  },
  hero: {
    marginHorizontal: spacing.lg,
    borderRadius: radius.lg,
    padding: spacing.lg,
  },
  heroMeta: {
    fontSize: 11,
    lineHeight: 16,
  },
  heroSum: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: spacing.sm,
    marginTop: spacing.xs,
  },
  heroAmount: {
    fontSize: 30,
    fontWeight: '800',
    letterSpacing: 0.3,
  },
  heroCount: {
    fontSize: 12,
  },
  heroCells: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginTop: spacing.md,
  },
  heroCell: {
    flex: 1,
    borderRadius: radius.sm,
    paddingVertical: spacing.xs + 2,
    paddingHorizontal: spacing.sm,
  },
  cellLabel: {
    fontSize: 10,
  },
  cellValue: {
    ...typography.body,
    fontWeight: '700',
    marginTop: 2,
  },
  segmentWrap: {
    marginHorizontal: spacing.lg,
    marginTop: spacing.md,
    marginBottom: spacing.sm,
  },
  dayGroup: {
    marginTop: spacing.sm,
    paddingHorizontal: spacing.lg,
  },
  dayRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: spacing.xs,
    paddingBottom: spacing.xs,
  },
  dayLabel: {
    ...typography.caption,
    fontWeight: '600',
  },
  dayTotal: {
    ...typography.caption,
  },
  noteCard: {
    padding: spacing.md,
    marginBottom: spacing.sm + 2,
    marginHorizontal: spacing.lg,
    borderWidth: 1,
  },
  noteTop: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  noteName: {
    ...typography.body,
    fontWeight: '600',
    flexShrink: 1,
  },
  noteAmount: {
    ...typography.body,
    fontWeight: '700',
  },
  noteMeta: {
    ...typography.caption,
    marginTop: 2,
  },
  noteTrack: {
    height: 4,
    borderRadius: 2,
    overflow: 'hidden',
    marginTop: spacing.xs + 2,
  },
  noteFill: {
    height: '100%',
    borderRadius: 2,
  },
  noteSub: {
    borderLeftWidth: 2,
    marginTop: spacing.sm,
    paddingLeft: spacing.sm,
  },
  noteSubRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: spacing.sm,
    paddingVertical: 3,
  },
  noteSubText: {
    ...typography.caption,
    flexShrink: 1,
  },
  noteSubAmount: {
    ...typography.caption,
  },
  footNote: {
    ...typography.caption,
    lineHeight: 16,
    marginHorizontal: spacing.lg,
    paddingTop: spacing.xs,
  },
  pressed: {
    opacity: 0.85,
  },
});
