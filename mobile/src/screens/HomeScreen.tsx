import axios from 'axios';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  Animated,
  FlatList,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { fetchCategories, type CategoryItem } from '../api/categories';
import { extractErrorMessage } from '../api/client';
import { fetchMonthlySummary, fetchPartnerMonthlySummary } from '../api/stats';
import {
  createTransaction,
  fetchPartnerTransactions,
  fetchTransactions,
  removeTransaction,
  updateTransaction,
} from '../api/transactions';
import AddTransactionSheet from '../components/AddTransactionSheet';
import ConfirmModal from '../components/ConfirmModal';
import EmptyView from '../components/EmptyView';
import ErrorView from '../components/ErrorView';
import GradientView from '../components/GradientView';
import LoadingView from '../components/LoadingView';
import SegmentedControl from '../components/SegmentedControl';
import TransactionItem from '../components/TransactionItem';
import { useAuthStore } from '../store/authStore';
import { gradient, spacing, typography, useTheme } from '../theme';
import type {
  MonthlySummary,
  Transaction,
  TransactionCreatePayload,
} from '../types';
import {
  formatDateLabel,
  formatMoney,
  formatMonthLabel,
  getMonthKey,
  shiftMonth,
} from '../utils/format';

/** 首页视图:我的账单 / 伴侣账单。 */
type ViewMode = 'self' | 'partner';

/** FlatList 行:日期分组头 / 账单行。 */
type Row =
  | { kind: 'header'; id: string; label: string; dayExpense: number }
  | { kind: 'item'; id: string; tx: Transaction };

/** FR-02 吸顶:滚动超过该阈值(px)时结余卡收缩为窄条。 */
const COLLAPSE_SCROLL_THRESHOLD = 28;
/** FR-02 吸顶:收缩/展开动画时长(ms)。 */
const COLLAPSE_ANIM_DURATION = 200;
/** FR-02 吸顶:收缩后窄条高度(px)。 */
const COLLAPSED_CARD_HEIGHT = 56;

/**
 * 首页账单流(FR-02):月度汇总卡 + 「我的/伴侣」切换 + 按日期分组的账单列表
 * (FlatList 虚拟化),月份切换、下拉刷新、新增/编辑/删除记账。
 * 伴侣视图为只读:隐藏新增 FAB,禁止编辑与删除。
 */
export default function HomeScreen() {
  const colors = useTheme();
  const user = useAuthStore((s) => s.user);
  const partner = user?.partner ?? null;
  const partnerLabel = partner?.nickname?.trim() || '伴侣';
  const showPartnerTab = Boolean(partner?.nickname);

  const [viewMode, setViewMode] = useState<ViewMode>('self');
  const [currentMonth, setCurrentMonth] = useState(() => new Date());
  const [summary, setSummary] = useState<MonthlySummary | null>(null);
  const [transactions, setTransactions] = useState<Transaction[] | null>(null);
  const [loadedKey, setLoadedKey] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<unknown>(null);

  const [sheetOpen, setSheetOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<Transaction | null>(null);
  const [deletingItem, setDeletingItem] = useState<Transaction | null>(null);
  const [deleting, setDeleting] = useState(false);

  const [categories, setCategories] = useState<CategoryItem[]>([]);

  // FR-02 吸顶:FlatList contentOffset → 原生驱动 scrollY;阈值触发 collapse 0↔1 动画。
  const scrollY = useRef(new Animated.Value(0)).current;
  const collapse = useRef(new Animated.Value(0)).current;
  const collapsedRef = useRef(false);
  const [collapsed, setCollapsed] = useState(false);
  const [cardFullHeight, setCardFullHeight] = useState<number | null>(null);

  const monthKey = getMonthKey(currentMonth);
  const viewKey = `${viewMode}:${monthKey}`;
  const requestIdRef = useRef(0);
  const isSelfView = viewMode === 'self';

  // 未绑定伴侣时隐藏伴侣 Tab;若正处在伴侣视图则切回「我的」。
  useEffect(() => {
    if (!showPartnerTab && viewMode === 'partner') {
      setViewMode('self');
    }
  }, [showPartnerTab, viewMode]);

  const load = useCallback(async () => {
    const requestId = ++requestIdRef.current;
    setError(null);
    try {
      const txLoader =
        viewMode === 'self' ? fetchTransactions : fetchPartnerTransactions;
      const summaryLoader =
        viewMode === 'self' ? fetchMonthlySummary : fetchPartnerMonthlySummary;
      const [txs, sum] = await Promise.all([
        txLoader(monthKey),
        summaryLoader(monthKey),
      ]);
      if (requestId !== requestIdRef.current) {
        return; // 已被更新的请求取代,丢弃过期结果
      }
      setTransactions(txs);
      setSummary(sum);
      setLoadedKey(viewKey);
    } catch (loadError) {
      if (requestId !== requestIdRef.current) {
        return;
      }
      setError(loadError);
    }
  }, [viewMode, monthKey, viewKey]);

  // 分类表:用于账单行的 emoji 图标与主题色。
  const loadCategories = useCallback(async () => {
    try {
      setCategories(await fetchCategories());
    } catch {
      // 图标缺失时行组件会回退默认 emoji,不阻塞列表
    }
  }, []);

  useEffect(() => {
    void loadCategories();
  }, [loadCategories]);

  // FR-02 吸顶:监听滚动偏移,越过阈值时以 200ms 动画收缩/恢复,双向平滑。
  useEffect(() => {
    const listenerId = scrollY.addListener(({ value }) => {
      const shouldCollapse = value > COLLAPSE_SCROLL_THRESHOLD;
      if (shouldCollapse === collapsedRef.current) {
        return;
      }
      collapsedRef.current = shouldCollapse;
      setCollapsed(shouldCollapse);
      Animated.timing(collapse, {
        toValue: shouldCollapse ? 1 : 0,
        duration: COLLAPSE_ANIM_DURATION,
        // 高度/阴影等布局属性无法走原生驱动;滚动事件本身已用 useNativeDriver: true
        useNativeDriver: false,
      }).start();
    });
    return () => scrollY.removeListener(listenerId);
  }, [scrollY, collapse]);

  // 月份切换 / 视图切换 / 首次加载:进入加载态并拉取数据。
  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      setLoading(true);
      await load();
      if (!cancelled) {
        setLoading(false);
      }
    };
    void run();
    return () => {
      cancelled = true;
    };
  }, [load]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await Promise.all([load(), loadCategories()]);
    setRefreshing(false);
  }, [load, loadCategories]);

  const categoryMap = useMemo(() => {
    const map: Record<string, CategoryItem> = {};
    categories.forEach((category) => {
      map[category.name] = category;
    });
    return map;
  }, [categories]);

  const iconFor = (category: string): string =>
    categoryMap[category]?.icon || '💰';
  const colorFor = (category: string): string =>
    categoryMap[category]?.color || '#8E8E93';

  // 按日期分组,生成 FlatList 扁平行(header + item 交错)。
  // 每组顺序:日期分组头在前,账单行在后。
  const rows = useMemo<Row[]>(() => {
    const txs = transactions ?? [];
    const groupMap = new Map<string, { dayExpense: number; items: Transaction[] }>();
    txs.forEach((tx) => {
      let group = groupMap.get(tx.date);
      if (!group) {
        group = { dayExpense: 0, items: [] };
        groupMap.set(tx.date, group);
      }
      if (tx.type === 'expense') {
        group.dayExpense += tx.amount;
      }
      group.items.push(tx);
    });

    const result: Row[] = [];
    groupMap.forEach((group, date) => {
      result.push({
        kind: 'header',
        id: `header-${date}`,
        label: formatDateLabel(date),
        dayExpense: group.dayExpense,
      });
      group.items.forEach((tx) => {
        result.push({ kind: 'item', id: `tx-${tx.id}`, tx });
      });
    });
    return result;
  }, [transactions]);

  const hasMonthData = loadedKey === viewKey;
  const isPartnerUnavailable =
    viewMode === 'partner' &&
    axios.isAxiosError(error) &&
    error.response?.status === 403;
  const errorMessage = extractErrorMessage(error, '账单加载失败');

  const openCreate = () => {
    if (!isSelfView) {
      return;
    }
    setEditingItem(null);
    setSheetOpen(true);
  };

  const openEdit = (tx: Transaction) => {
    if (!isSelfView) {
      return;
    }
    setEditingItem(tx);
    setSheetOpen(true);
  };

  const closeSheet = () => {
    setSheetOpen(false);
    setEditingItem(null);
  };

  const handleSubmit = async (payload: TransactionCreatePayload) => {
    if (editingItem) {
      await updateTransaction(editingItem.id, {
        amount: payload.amount,
        type: payload.type,
        category: payload.category,
        date: payload.date,
        note: payload.note ?? null,
      });
    } else {
      await createTransaction(payload);
    }
    closeSheet();
    await load();
  };

  const handleDelete = async () => {
    if (!deletingItem) {
      return;
    }
    const target = deletingItem;
    setDeleting(true);
    try {
      await removeTransaction(target.id);
      setDeletingItem(null);
      await load();
    } catch (deleteError) {
      setDeletingItem(null);
      Alert.alert('删除失败', extractErrorMessage(deleteError, '删除失败,请重试'));
    } finally {
      setDeleting(false);
    }
  };

  const renderRow = ({ item }: { item: Row }) => {
    if (item.kind === 'header') {
      return (
        <View style={styles.dayHeader}>
          <Text style={[styles.dayLabel, { color: colors.textSecondary }]}>
            {item.label}
          </Text>
          {item.dayExpense > 0 ? (
            <Text style={[styles.dayTotal, { color: colors.textPrimary }]}>
              支出 ¥{formatMoney(item.dayExpense)}
            </Text>
          ) : null}
        </View>
      );
    }
    const tx = item.tx;
    return (
      <TransactionItem
        item={tx}
        icon={iconFor(tx.category)}
        color={colorFor(tx.category)}
        onPress={() => openEdit(tx)}
        onLongPress={() => {
          if (isSelfView) {
            setDeletingItem(tx);
          }
        }}
      />
    );
  };

  const greeting = user?.nickname ? `Hi, ${user.nickname}` : '';
  const balance = summary?.balance ?? 0;

  // FR-02 吸顶:collapse 0↔1 驱动的高度/透明度/阴影插值(完整卡 → 56px 窄条)。
  const cardAnim = useMemo(
    () => ({
      height: cardFullHeight
        ? collapse.interpolate({
            inputRange: [0, 1],
            outputRange: [cardFullHeight, COLLAPSED_CARD_HEIGHT],
          })
        : undefined,
      fullOpacity: collapse.interpolate({
        inputRange: [0, 1],
        outputRange: [1, 0],
      }),
      stripOpacity: collapse.interpolate({
        inputRange: [0, 1],
        outputRange: [0, 1],
      }),
      shadowOpacity: collapse.interpolate({
        inputRange: [0, 1],
        outputRange: [0.35, 0.1],
      }),
      elevation: collapse.interpolate({
        inputRange: [0, 1],
        outputRange: [8, 2],
      }),
    }),
    [collapse, cardFullHeight]
  );

  // FR-02 吸顶:FlatList 滚动事件 → scrollY(原生驱动,不阻塞滚动)。
  const onScroll = useMemo(
    () =>
      Animated.event(
        [{ nativeEvent: { contentOffset: { y: scrollY } } }],
        { useNativeDriver: true }
      ),
    [scrollY]
  );

  return (
    <SafeAreaView
      style={[styles.safe, { backgroundColor: colors.background }]}
      edges={['top']}
    >
      <View style={styles.container}>
        <View style={styles.header}>
          {greeting ? (
            <Text style={[styles.greet, { color: colors.textSecondary }]}>
              {greeting}
            </Text>
          ) : null}
          <Text style={[styles.title, { color: colors.textPrimary }]}>金流</Text>
        </View>

        {/* 月度汇总卡(渐变):滚动时收缩为 56px 窄条吸顶(FR-02) */}
        <Animated.View
          style={[
            styles.cardShadow,
            { shadowOpacity: cardAnim.shadowOpacity, elevation: cardAnim.elevation },
          ]}
        >
          <Animated.View
            style={[
              styles.cardClip,
              cardAnim.height ? { height: cardAnim.height } : null,
            ]}
          >
            <GradientView style={styles.cardGradient}>
              {/* 完整卡内容:收缩时整体淡出,并被容器高度裁剪 */}
              <Animated.View
                style={[styles.cardFull, { opacity: cardAnim.fullOpacity }]}
                pointerEvents={collapsed ? 'none' : 'auto'}
                onLayout={(event) => {
                  const height = event.nativeEvent.layout.height;
                  setCardFullHeight((previous) =>
                    previous === height ? previous : height
                  );
                }}
              >
                <MonthSwitcher
                  currentMonth={currentMonth}
                  onShift={(direction) =>
                    setCurrentMonth((previous) => shiftMonth(previous, direction))
                  }
                  style={styles.monthRow}
                />
                <Text style={styles.balanceLabel}>本月结余</Text>
                <Text style={styles.balanceAmount}>¥{formatMoney(balance)}</Text>
                <View style={styles.sumRow}>
                  <View style={styles.sumChip}>
                    <Text style={styles.sumChipLabel}>收入</Text>
                    <Text style={styles.sumChipValue}>
                      ¥{formatMoney(summary?.total_income ?? 0)}
                    </Text>
                  </View>
                  <View style={styles.sumChip}>
                    <Text style={styles.sumChipLabel}>支出</Text>
                    <Text style={styles.sumChipValue}>
                      ¥{formatMoney(summary?.total_expense ?? 0)}
                    </Text>
                  </View>
                </View>
              </Animated.View>

              {/* 收缩窄条:保留月份切换与「本月结余 ¥金额」,隐藏收支 chips */}
              <Animated.View
                style={[styles.collapsedStrip, { opacity: cardAnim.stripOpacity }]}
                pointerEvents={collapsed ? 'auto' : 'none'}
              >
                <MonthSwitcher
                  currentMonth={currentMonth}
                  onShift={(direction) =>
                    setCurrentMonth((previous) => shiftMonth(previous, direction))
                  }
                  style={styles.collapsedMonthGroup}
                />
                <Text style={styles.collapsedBalance}>
                  本月结余 ¥{formatMoney(balance)}
                </Text>
              </Animated.View>
            </GradientView>
          </Animated.View>
        </Animated.View>

        {/* 我的 / 伴侣切换(仅已绑定伴侣时显示) */}
        {showPartnerTab ? (
          <View style={styles.segmentWrap}>
            <SegmentedControl
              options={[
                { key: 'self', label: '我的' },
                { key: 'partner', label: partnerLabel },
              ]}
              value={viewMode}
              onChange={(key) => setViewMode(key as ViewMode)}
            />
          </View>
        ) : null}

        {/* 列表区:加载 / 未绑定伴侣 / 错误 / 空 / 列表 */}
        <View style={styles.content}>
          {error && hasMonthData && !isPartnerUnavailable ? (
            <View style={[styles.errorBanner, { backgroundColor: colors.card }]}>
              <Text style={[styles.errorBannerText, { color: colors.expense }]}>
                {errorMessage}
              </Text>
              <Pressable onPress={() => void load()}>
                <Text style={[styles.errorBannerRetry, { color: colors.primary }]}>
                  重试
                </Text>
              </Pressable>
            </View>
          ) : null}

          {isPartnerUnavailable ? (
            <ErrorView
              emoji="💑"
              title="还没有绑定伴侣"
              message="在「我的」页面绑定伴侣后,即可查看对方的账单"
            />
          ) : loading && !hasMonthData && !error ? (
            <LoadingView text="账单加载中…" />
          ) : error && !hasMonthData ? (
            <ErrorView
              emoji="😵"
              title="账单加载失败"
              message={errorMessage}
              onRetry={() => void load()}
            />
          ) : transactions && transactions.length === 0 ? (
            <ScrollView
              contentContainerStyle={styles.emptyScroll}
              refreshControl={
                <RefreshControl
                  refreshing={refreshing}
                  onRefresh={onRefresh}
                  colors={[colors.primary]}
                  tintColor={colors.primary}
                />
              }
            >
              <EmptyView
                emoji="🧾"
                title={
                  isSelfView
                    ? '这个月还没有账单'
                    : `${partnerLabel}这个月还没有账单`
                }
                description={isSelfView ? '点右下角 + 添加第一笔吧' : undefined}
              />
            </ScrollView>
          ) : (
            <FlatList
              data={rows}
              keyExtractor={(row) => row.id}
              renderItem={renderRow}
              ItemSeparatorComponent={ItemSeparator}
              contentContainerStyle={styles.listContent}
              showsVerticalScrollIndicator={false}
              onScroll={onScroll}
              scrollEventThrottle={16}
              refreshControl={
                <RefreshControl
                  refreshing={refreshing}
                  onRefresh={onRefresh}
                  colors={[colors.primary]}
                  tintColor={colors.primary}
                />
              }
            />
          )}
        </View>
      </View>

      {/* 渐变 FAB(右下角 60px,仅「我的」视图显示) */}
      {isSelfView ? (
        <Pressable style={styles.fab} onPress={openCreate}>
          <GradientView style={styles.fabGradient}>
            <Text style={styles.fabText}>+</Text>
          </GradientView>
        </Pressable>
      ) : null}

      <AddTransactionSheet
        visible={sheetOpen}
        editingItem={editingItem}
        onClose={closeSheet}
        onSubmit={handleSubmit}
      />

      <ConfirmModal
        visible={deletingItem !== null}
        title="删除账单"
        message={
          deletingItem
            ? `确定删除这条账单吗?\n${deletingItem.category} ${
                deletingItem.type === 'income' ? '+' : '-'
              }¥${formatMoney(deletingItem.amount)}`
            : undefined
        }
        confirmText="删除"
        onConfirm={() => void handleDelete()}
        onCancel={() => setDeletingItem(null)}
        loading={deleting}
      />
    </SafeAreaView>
  );
}

/**
 * 月份切换器:‹ 月份 › 左右箭头。
 * 完整卡与收缩窄条共用,通过 style 区分布局。
 */
function MonthSwitcher({
  currentMonth,
  onShift,
  style,
}: {
  currentMonth: Date;
  onShift: (direction: -1 | 1) => void;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <View style={style}>
      <Pressable
        onPress={() => onShift(-1)}
        style={styles.monthArrow}
        hitSlop={8}
      >
        <Text style={styles.monthArrowText}>‹</Text>
      </Pressable>
      <Text style={styles.monthLabel}>{formatMonthLabel(currentMonth)}</Text>
      <Pressable
        onPress={() => onShift(1)}
        style={styles.monthArrow}
        hitSlop={8}
      >
        <Text style={styles.monthArrowText}>›</Text>
      </Pressable>
    </View>
  );
}

function ItemSeparator() {
  return <View style={styles.separator} />;
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
  },
  container: {
    flex: 1,
    paddingHorizontal: spacing.lg,
  },
  header: {
    marginTop: spacing.md,
    marginBottom: spacing.lg,
  },
  greet: {
    fontSize: 12,
  },
  title: {
    ...typography.title,
    fontSize: 26,
    marginTop: 2,
  },
  cardShadow: {
    borderRadius: 24,
    shadowColor: gradient.start,
    shadowOpacity: 0.35,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 8 },
    elevation: 8,
  },
  cardClip: {
    borderRadius: 24,
    overflow: 'hidden',
  },
  cardGradient: {
    flex: 1,
  },
  cardFull: {
    padding: spacing.lg,
  },
  collapsedStrip: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: COLLAPSED_CARD_HEIGHT,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
  },
  collapsedMonthGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  collapsedBalance: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '700',
  },
  monthRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  monthArrow: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: 'rgba(255, 255, 255, 0.25)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  monthArrowText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
    lineHeight: 18,
  },
  monthLabel: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '700',
  },
  balanceLabel: {
    color: 'rgba(255, 255, 255, 0.92)',
    fontSize: 13,
    marginTop: spacing.md,
  },
  balanceAmount: {
    color: '#FFFFFF',
    fontSize: 36,
    fontWeight: '800',
    letterSpacing: 1,
    marginVertical: spacing.sm,
  },
  sumRow: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  sumChip: {
    flex: 1,
    backgroundColor: 'rgba(255, 255, 255, 0.17)',
    borderRadius: 14,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
  },
  sumChipLabel: {
    color: 'rgba(255, 255, 255, 0.85)',
    fontSize: 11,
  },
  sumChipValue: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '700',
    marginTop: 2,
  },
  segmentWrap: {
    marginTop: spacing.lg,
  },
  content: {
    flex: 1,
    marginTop: spacing.lg,
  },
  errorBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderRadius: 12,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    marginBottom: spacing.md,
  },
  errorBannerText: {
    flex: 1,
    fontSize: 13,
  },
  errorBannerRetry: {
    fontSize: 13,
    fontWeight: '600',
    marginLeft: spacing.md,
  },
  listContent: {
    paddingBottom: spacing.xxl,
  },
  emptyScroll: {
    flexGrow: 1,
  },
  separator: {
    height: 10,
  },
  dayHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 2,
    marginBottom: spacing.xs,
  },
  dayLabel: {
    fontSize: 12,
    fontWeight: '600',
  },
  dayTotal: {
    fontSize: 12,
    fontWeight: '600',
  },
  fab: {
    position: 'absolute',
    right: spacing.xl,
    bottom: spacing.xl,
  },
  fabGradient: {
    width: 60,
    height: 60,
    borderRadius: 30,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: gradient.end,
    shadowOpacity: 0.5,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 8 },
    elevation: 10,
  },
  fabText: {
    color: '#FFFFFF',
    fontSize: 30,
    fontWeight: '300',
    lineHeight: 34,
  },
});
