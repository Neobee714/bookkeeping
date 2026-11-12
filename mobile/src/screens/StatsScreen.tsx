import { useIsFocused, useNavigation } from '@react-navigation/native';
import type { BottomTabNavigationProp } from '@react-navigation/bottom-tabs';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import axios from 'axios';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Svg, {
  Circle,
  Line,
  Path,
  Text as SvgText,
} from 'react-native-svg';

import { extractErrorMessage } from '../api/client';
import { fetchReports } from '../api/reports';
import {
  CATEGORY_COLORS,
  fetchBreakdown,
  fetchMonthlySummary,
  fetchMonthlyTrendSeries,
  fetchPartnerMonthlySummary,
} from '../api/stats';
import EmptyView from '../components/EmptyView';
import ErrorView from '../components/ErrorView';
import GradientView from '../components/GradientView';
import LoadingView from '../components/LoadingView';
import SegmentedControl from '../components/SegmentedControl';
import type { MainTabParamList, RootStackParamList } from '../navigation/types';
import { cacheKey, readCache, writeCache } from '../offline/cache';
import { isOnlineNow } from '../offline/network';
import { useAuthStore } from '../store/authStore';
import { radius, spacing, typography, useTheme, type ThemeColors , useSkin} from '../theme';
import type {
  BreakdownDimension,
  BreakdownResponse,
  MonthlySummary,
  ReportListItem,
  ReportListResponse,
  TrendPoint,
} from '../types';

type SummaryTab = 'self' | 'partner';

/** 支出分布三档：分类沿用汇总，商家 / 菜品走 /stats/breakdown。 */
type DistributionDimension = 'category' | BreakdownDimension;

type TabNavigation = BottomTabNavigationProp<MainTabParamList>;
type RootNavigation = NativeStackNavigationProp<RootStackParamList>;

/** 分类 emoji(与 Web 端分类对应,缺失时兜底)。 */
const CATEGORY_EMOJI: Record<string, string> = {
  餐饮: '🍜',
  交通: '🚇',
  日用: '🛒',
  娱乐: '🎮',
  医疗: '💊',
  教育: '📚',
  购物: '🛍️',
  零食: '🍿',
  收入: '💰',
  生活费: '💵',
  其他: '📌',
};

const getCategoryEmoji = (name: string): string => CATEGORY_EMOJI[name] ?? '🏷️';

const startOfMonth = (value: Date): Date =>
  new Date(value.getFullYear(), value.getMonth(), 1);

const shiftMonth = (value: Date, offset: number): Date =>
  new Date(value.getFullYear(), value.getMonth() + offset, 1);

const formatMonthKey = (value: Date): string =>
  `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, '0')}`;

const formatMonthLabel = (value: Date): string =>
  `${value.getFullYear()}年${value.getMonth() + 1}月`;

const formatShortMonth = (month: string): string =>
  `${Number.parseInt(month.slice(5), 10)}月`;

const formatMoney = (value: number): string =>
  value.toLocaleString('zh-CN', { maximumFractionDigits: 2 });

function MonthArrow({
  onPress,
  children,
}: {
  onPress: () => void;
  children: React.ReactNode;
}) {
  const colors = useTheme();
  return (
    <Pressable
      onPress={onPress}
      hitSlop={8}
      style={({ pressed }) => [
        styles.arrow,
        { backgroundColor: colors.surface },
        pressed && styles.pressed,
      ]}
    >
      <Text style={[styles.arrowText, { color: colors.primary }]}>
        {children}
      </Text>
    </Pressable>
  );
}

function SummaryCell({
  label,
  value,
  color,
}: {
  label: string;
  value: string;
  color: string;
}) {
  const colors = useTheme();
  return (
    <View style={styles.summaryCell}>
      <Text style={[styles.summaryLabel, { color: colors.textSecondary }]}>
        {label}
      </Text>
      <Text style={[styles.summaryValue, { color }]}>{value}</Text>
    </View>
  );
}

interface TrendChartProps {
  data: TrendPoint[];
  colors: ThemeColors;
}

/** 手写 SVG 折线图(收入/支出双线),不引入第三方图表库。 */
function TrendChart({ data, colors }: TrendChartProps) {
  const width = 320;
  const height = 170;
  const padLeft = 34;
  const padRight = 8;
  const padTop = 14;
  const padBottom = 26;

  const values = data.flatMap((point) => [point.income, point.expense]);
  let yMin = Math.min(0, ...values);
  let yMax = Math.max(...values);
  if (!Number.isFinite(yMax) || yMax <= yMin) {
    yMax = yMin + 1;
  }
  const span = yMax - yMin;
  yMin -= span * 0.15;
  yMax += span * 0.15;

  const plotWidth = width - padLeft - padRight;
  const plotHeight = height - padTop - padBottom;
  const count = data.length;
  const xFor = (index: number): number =>
    count <= 1
      ? padLeft + plotWidth / 2
      : padLeft + (index / (count - 1)) * plotWidth;
  const yFor = (value: number): number =>
    padTop + (1 - (value - yMin) / (yMax - yMin)) * plotHeight;

  const incomePoints = data.map((point, index) => ({
    x: xFor(index),
    y: yFor(point.income),
  }));
  const expensePoints = data.map((point, index) => ({
    x: xFor(index),
    y: yFor(point.expense),
  }));
  const toPath = (points: Array<{ x: number; y: number }>): string =>
    points
      .map(
        (point, index) =>
          `${index === 0 ? 'M' : 'L'}${point.x.toFixed(1)},${point.y.toFixed(1)}`,
      )
      .join(' ');

  const gridLines = [yMin, (yMin + yMax) / 2, yMax].map((value) => ({
    y: yFor(value),
    label: formatMoney(Math.round(value)),
  }));
  const xLabels = data.map((point, index) => ({
    x: xFor(index),
    label: formatShortMonth(point.month),
  }));

  return (
    <Svg width="100%" height={height} viewBox={`0 0 ${width} ${height}`}>
      {gridLines.map((line, index) => (
        <React.Fragment key={`grid-${index}`}>
          <Line
            x1={padLeft}
            y1={line.y}
            x2={width - padRight}
            y2={line.y}
            stroke={colors.border}
            strokeWidth={1}
          />
          <SvgText
            x={padLeft - 4}
            y={line.y + 3}
            fontSize={9}
            fill={colors.textTertiary}
            textAnchor="end"
          >
            {line.label}
          </SvgText>
        </React.Fragment>
      ))}
      <Path
        d={toPath(expensePoints)}
        stroke={colors.expense}
        strokeWidth={2.5}
        fill="none"
        strokeLinejoin="round"
        strokeLinecap="round"
      />
      <Path
        d={toPath(incomePoints)}
        stroke={colors.income}
        strokeWidth={2.5}
        fill="none"
        strokeLinejoin="round"
        strokeLinecap="round"
      />
      {expensePoints.map((point, index) => (
        <Circle
          key={`expense-dot-${index}`}
          cx={point.x}
          cy={point.y}
          r={3}
          fill={colors.expense}
        />
      ))}
      {incomePoints.map((point, index) => (
        <Circle
          key={`income-dot-${index}`}
          cx={point.x}
          cy={point.y}
          r={3}
          fill={colors.income}
        />
      ))}
      {xLabels.map((label, index) => (
        <SvgText
          key={`x-${index}`}
          x={label.x}
          y={height - 8}
          fontSize={9}
          fill={colors.textTertiary}
          textAnchor="middle"
        >
          {label.label}
        </SvgText>
      ))}
    </Svg>
  );
}

/** 收入/支出双色图例。 */
function ChartLegend({ colors }: { colors: ThemeColors }) {
  return (
    <View style={styles.legend}>
      <View style={styles.legendItem}>
        <View style={[styles.legendDot, { backgroundColor: colors.income }]} />
        <Text style={[styles.legendText, { color: colors.textSecondary }]}>收入</Text>
      </View>
      <View style={styles.legendItem}>
        <View style={[styles.legendDot, { backgroundColor: colors.expense }]} />
        <Text style={[styles.legendText, { color: colors.textSecondary }]}>支出</Text>
      </View>
    </View>
  );
}

/** 图表:统计页(FR-04)。 */
export default function StatsScreen() {
  const colors = useTheme();
  const skin = useSkin();
  const isFocused = useIsFocused();
  const navigation = useNavigation<TabNavigation>();
  const userId = useAuthStore((state) => state.user?.id ?? null);
  const partner = useAuthStore((state) => state.user?.partner);
  const partnerLabel = partner?.nickname?.trim() || '伴侣';

  const [currentMonth, setCurrentMonth] = useState(() => startOfMonth(new Date()));
  const [tab, setTab] = useState<SummaryTab>('self');
  const [summary, setSummary] = useState<MonthlySummary | null>(null);
  const [trend, setTrend] = useState<TrendPoint[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);
  const [fromCache, setFromCache] = useState(false);
  const [reloadTick, setReloadTick] = useState(0);
  const [dimension, setDimension] = useState<DistributionDimension>('category');
  const [breakdown, setBreakdown] = useState<BreakdownResponse | null>(null);
  const [breakdownLoading, setBreakdownLoading] = useState(false);
  const [breakdownFromCache, setBreakdownFromCache] = useState(false);
  const [breakdownFailed, setBreakdownFailed] = useState(false);
  /** 财报入口：未读数 + 最新一期（失败静默，只用于入口提示）。 */
  const [reportHint, setReportHint] = useState<{
    unread: number;
    item: ReportListItem | null;
  }>({ unread: 0, item: null });

  const monthKey = formatMonthKey(currentMonth);
  const requestKey = `${tab}:${monthKey}`;
  const requestKeyRef = useRef(requestKey);
  useEffect(() => {
    requestKeyRef.current = requestKey;
  }, [requestKey]);
  /** 商家 / 菜品请求令牌：切维度或月份时丢弃过期响应。 */
  const breakdownRequestRef = useRef(0);

  const load = useCallback(async () => {
    const key = requestKeyRef.current;
    const [activeTab, activeMonth] = key.split(':') as [SummaryTab, string];
    const [year, monthIndex] = activeMonth.split('-').map(Number);
    const endMonth = new Date(year, monthIndex - 1, 1);
    const summaryLoader =
      activeTab === 'self' ? fetchMonthlySummary : fetchPartnerMonthlySummary;
    const summaryKey = userId
      ? cacheKey(userId, 'summary', activeTab, activeMonth)
      : null;
    const trendKey = userId
      ? cacheKey(userId, 'trend', activeTab, '6', activeMonth)
      : null;

    const readCached = async (): Promise<{
      summary: MonthlySummary;
      trend: TrendPoint[];
    } | null> => {
      if (!summaryKey || !trendKey) {
        return null;
      }
      const [cachedSummary, cachedTrend] = await Promise.all([
        readCache<MonthlySummary>(summaryKey),
        readCache<TrendPoint[]>(trendKey),
      ]);
      return cachedSummary
        ? { summary: cachedSummary, trend: cachedTrend ?? [] }
        : null;
    };

    setLoading(true);
    setError(null);
    setFromCache(false);

    if (!isOnlineNow()) {
      const cached = await readCached();
      if (requestKeyRef.current === key) {
        if (cached) {
          setSummary(cached.summary);
          setTrend(cached.trend);
          setFromCache(true);
        } else {
          setSummary(null);
          setTrend([]);
          setError(new Error('离线模式：这个月份还没有缓存'));
        }
        setLoading(false);
      }
      return;
    }

    try {
      const [summaryData, trendData] = await Promise.all([
        summaryLoader(activeMonth),
        fetchMonthlyTrendSeries({ target: activeTab, months: 6, endMonth }),
      ]);
      if (requestKeyRef.current === key) {
        setSummary(summaryData);
        setTrend(trendData);
        setFromCache(false);
        if (summaryKey) {
          writeCache(summaryKey, summaryData).catch(() => undefined);
        }
        if (trendKey) {
          writeCache(trendKey, trendData).catch(() => undefined);
        }
      }
    } catch (loadError) {
      const cached = await readCached();
      if (requestKeyRef.current === key) {
        if (cached) {
          setSummary(cached.summary);
          setTrend(cached.trend);
          setFromCache(true);
          setError(null);
        } else {
          setError(loadError);
          setSummary(null);
          setTrend([]);
        }
      }
    } finally {
      if (requestKeyRef.current === key) {
        setLoading(false);
      }
    }
  }, [userId]);

  useEffect(() => {
    if (!isFocused) {
      return;
    }
    void load();
  }, [isFocused, requestKey, reloadTick, load]);

  /**
   * 商家 / 菜品排行：只在对应档位加载；失败静默降级为「暂无」，
   * 绝不把整页打成错误态。缓存 key 按 ARCH 3.4 固定。
   */
  useEffect(() => {
    if (dimension === 'category') {
      breakdownRequestRef.current += 1;
      setBreakdown(null);
      setBreakdownLoading(false);
      setBreakdownFromCache(false);
      setBreakdownFailed(false);
      return;
    }
    if (!isFocused || !userId) {
      return;
    }

    const requestId = breakdownRequestRef.current + 1;
    breakdownRequestRef.current = requestId;
    const activeDimension = dimension;
    const cache = cacheKey(userId, 'breakdown', activeDimension, tab, monthKey);
    let cancelled = false;

    const run = async () => {
      setBreakdownLoading(true);
      setBreakdownFailed(false);
      const cached = await readCache<BreakdownResponse>(cache);
      if (cancelled || breakdownRequestRef.current !== requestId) {
        return;
      }
      if (cached) {
        setBreakdown(cached);
        setBreakdownFromCache(true);
      } else {
        setBreakdown(null);
        setBreakdownFromCache(false);
      }

      if (!isOnlineNow()) {
        setBreakdownFailed(!cached);
        setBreakdownLoading(false);
        return;
      }

      try {
        const data = await fetchBreakdown({
          dimension: activeDimension,
          month: monthKey,
          target: tab,
          category: '餐饮',
        });
        if (cancelled || breakdownRequestRef.current !== requestId) {
          return;
        }
        setBreakdown(data);
        setBreakdownFromCache(false);
        setBreakdownFailed(false);
        writeCache(cache, data).catch(() => undefined);
      } catch {
        if (cancelled || breakdownRequestRef.current !== requestId) {
          return;
        }
        // 有缓存时保持缓存内容；没有缓存则展示空态，不覆盖整页错误。
        setBreakdownFailed(true);
      } finally {
        if (!cancelled && breakdownRequestRef.current === requestId) {
          setBreakdownLoading(false);
        }
      }
    };

    run().catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [isFocused, dimension, tab, monthKey, reloadTick, userId]);

  const reload = useCallback(() => setReloadTick((value) => value + 1), []);

  /**
   * 财报入口数据：只取最新 1 条用于未读提示，失败静默（读缓存 / 保持原值），
   * 与统计主流程互不阻塞。这里刻意不写列表缓存，避免把列表截成 1 条。
   */
  const loadReportHint = useCallback(async () => {
    const key = userId ? cacheKey(userId, 'reports') : null;
    const readCached = async () => {
      if (!key) {
        return;
      }
      const cached = await readCache<ReportListResponse>(key);
      if (cached) {
        setReportHint({
          unread: cached.unread_count,
          item: cached.items[0] ?? null,
        });
      }
    };

    if (!isOnlineNow()) {
      await readCached();
      return;
    }

    try {
      const data = await fetchReports(1);
      setReportHint({
        unread: data.unread_count,
        item: data.items[0] ?? null,
      });
    } catch {
      await readCached();
    }
  }, [userId]);

  useEffect(() => {
    if (!isFocused) {
      return;
    }
    loadReportHint().catch(() => undefined);
  }, [isFocused, reloadTick, loadReportHint]);

  const openReports = useCallback(() => {
    navigation.getParent<RootNavigation>()?.navigate('Reports');
  }, [navigation]);

  const categoryRows = useMemo(() => {
    if (!summary) {
      return [];
    }
    const total = summary.total_expense;
    return Object.entries(summary.category_expenses)
      .map(([name, value]) => ({
        name,
        value,
        color: CATEGORY_COLORS[name] ?? colors.primary,
        percent: total > 0 ? Math.round((value / total) * 100) : 0,
      }))
      .filter((item) => item.value > 0)
      .sort((a, b) => b.value - a.value);
  }, [summary, colors.primary]);

  const breakdownRows = useMemo(() => {
    if (!breakdown || breakdown.dimension !== dimension) {
      return [];
    }
    const items = breakdown.items ?? [];
    if (items.length === 0) {
      return [];
    }
    const max = items.reduce(
      (value, candidate) => (candidate.amount > value ? candidate.amount : value),
      0,
    );
    return items.map((candidate) => ({
      ...candidate,
      percent: max > 0 ? Math.round((candidate.amount / max) * 100) : 0,
    }));
  }, [breakdown, dimension]);

  const legacyNoteCount =
    breakdown && breakdown.dimension === dimension
      ? (breakdown.legacy_note_count ?? 0)
      : 0;
  const lastCleanup =
    breakdown && breakdown.dimension === dimension
      ? (breakdown.last_cleanup ?? null)
      : null;

  const openNoteCleanup = useCallback(() => {
    navigation.getParent<RootNavigation>()?.navigate('NoteCleanup');
  }, [navigation]);

  const isPartnerUnavailable =
    tab === 'partner' &&
    axios.isAxiosError(error) &&
    error.response?.status === 403;
  const errorMessage = extractErrorMessage(error, '统计数据加载失败');

  /** 未读提示条：最新一期未读时给标题，否则只报未读份数。 */
  const latestReport = reportHint.item;
  const reportBanner =
    reportHint.unread > 0
      ? {
          title:
            latestReport && !latestReport.read_at
              ? `${latestReport.label} 已生成`
              : `有 ${reportHint.unread} 份新财报`,
          sub: latestReport
            ? `收入 ¥${formatMoney(
                latestReport.total_income,
              )} · 支出 ¥${formatMoney(
                latestReport.total_expense,
              )} · 结余 ¥${formatMoney(latestReport.balance)}`
            : '点击查看财报',
        }
      : null;

  return (
    <SafeAreaView
      style={[styles.safe, { backgroundColor: colors.background }]}
      edges={['top']}
    >
      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.titleRow}>
          <Text style={[styles.title, { color: colors.textPrimary }]}>图表</Text>
          <Pressable
            onPress={openReports}
            hitSlop={8}
            style={({ pressed }) => [
              styles.reportEntry,
              { backgroundColor: colors.card, borderColor: colors.border },
              pressed && styles.pressed,
            ]}
          >
            <Text
              style={[styles.reportEntryText, { color: colors.textPrimary }]}
            >
              📄 财报
            </Text>
            {reportHint.unread > 0 ? (
              <View
                style={[
                  styles.reportEntryDot,
                  { backgroundColor: colors.expense, borderColor: colors.card },
                ]}
              />
            ) : null}
          </Pressable>
        </View>

        {reportBanner ? (
          <Pressable
            onPress={openReports}
            style={({ pressed }) => [
              styles.reportBanner,
              {
                backgroundColor: colors.chipSoftBg,
                borderColor: colors.border,
              },
              pressed && styles.pressed,
            ]}
          >
            <GradientView colors={skin.gradient} style={styles.reportBannerIcon}>
              <Text style={styles.reportBannerEmoji}>📄</Text>
            </GradientView>
            <View style={styles.reportBannerMain}>
              <Text
                style={[
                  styles.reportBannerTitle,
                  { color: colors.chipSoftText },
                ]}
                numberOfLines={1}
              >
                {reportBanner.title}
              </Text>
              <Text
                style={[
                  styles.reportBannerSub,
                  { color: colors.textSecondary },
                ]}
                numberOfLines={1}
              >
                {reportBanner.sub}
              </Text>
            </View>
            <Text style={[styles.reportBannerGo, { color: colors.primary }]}>
              查看 ›
            </Text>
          </Pressable>
        ) : null}

        <View style={[styles.card, skin.surfaces.card]}>
          <View style={styles.monthRow}>
            <MonthArrow onPress={() => setCurrentMonth((previous) => shiftMonth(previous, -1))}>
              ‹
            </MonthArrow>
            <Text style={[styles.monthLabel, { color: colors.textPrimary }]}>
              {formatMonthLabel(currentMonth)}
            </Text>
            <MonthArrow onPress={() => setCurrentMonth((previous) => shiftMonth(previous, 1))}>
              ›
            </MonthArrow>
          </View>
          <View style={styles.summaryRow}>
            <SummaryCell
              label="收入"
              value={`¥${formatMoney(summary?.total_income ?? 0)}`}
              color={colors.income}
            />
            <SummaryCell
              label="支出"
              value={`¥${formatMoney(summary?.total_expense ?? 0)}`}
              color={colors.expense}
            />
          </View>
          <View style={[styles.divider, { backgroundColor: colors.border }]} />
          <View style={styles.summaryRow}>
            <SummaryCell
              label="结余"
              value={`¥${formatMoney(summary?.balance ?? 0)}`}
              color={(summary?.balance ?? 0) >= 0 ? colors.income : colors.expense}
            />
            <SummaryCell
              label="记录笔数"
              value={(summary?.transaction_count ?? 0).toLocaleString('zh-CN')}
              color={colors.textPrimary}
            />
          </View>
        </View>

        <SegmentedControl
          options={[
            { key: 'self', label: '我的' },
            { key: 'partner', label: partnerLabel },
          ]}
          value={tab}
          onChange={(key) => setTab(key as SummaryTab)}
        />

        {fromCache ? (
          <Text style={[styles.cacheHint, { color: colors.textSecondary }]}>
            网络不可用，显示上次缓存
          </Text>
        ) : null}

        {loading ? (
          <View style={styles.stateWrap}>
            <LoadingView text="加载统计数据…" />
          </View>
        ) : isPartnerUnavailable ? (
          <View style={styles.stateWrap}>
            <ErrorView
              emoji="💑"
              title="还没有绑定伴侣"
              message="在「我的」页面绑定伴侣后,即可查看对方的收支汇总与趋势"
            />
          </View>
        ) : error ? (
          <View style={styles.stateWrap}>
            <ErrorView
              title="统计数据加载失败"
              message={errorMessage}
              onRetry={reload}
            />
          </View>
        ) : summary ? (
          <>
            <View style={[styles.card, skin.surfaces.card]}>
              <View style={styles.distributionHead}>
                <Text style={[styles.cardTitle, { color: colors.textPrimary }]}>
                  支出分布
                </Text>
                {dimension !== 'category' && breakdownFromCache ? (
                  <Text style={[styles.cardMeta, { color: colors.textTertiary }]}>
                    显示缓存
                  </Text>
                ) : null}
              </View>
              <View style={styles.dimensionControl}>
                <SegmentedControl
                  options={[
                    { key: 'category', label: '分类' },
                    { key: 'merchant', label: '商家' },
                    { key: 'item', label: '菜品' },
                  ]}
                  value={dimension}
                  onChange={(key) => setDimension(key as DistributionDimension)}
                />
              </View>
              {dimension === 'category' ? (
                categoryRows.length === 0 ? (
                <View style={styles.emptyWrap}>
                  <EmptyView emoji="🌱" title="本月暂无支出" />
                </View>
              ) : (
                categoryRows.map((item) => (
                  <View key={item.name} style={styles.catRow}>
                    <View style={styles.catHeader}>
                      <View style={styles.catNameWrap}>
                        <Text style={styles.catEmoji}>
                          {getCategoryEmoji(item.name)}
                        </Text>
                        <Text
                          style={[styles.catName, { color: colors.textPrimary }]}
                        >
                          {item.name}
                        </Text>
                      </View>
                      <Text
                        style={[styles.catAmount, { color: colors.textPrimary }]}
                      >
                        ¥{formatMoney(item.value)}
                        <Text
                          style={[styles.catPercent, { color: colors.textTertiary }]}
                        >
                          {' '}
                          · {item.percent}%
                        </Text>
                      </Text>
                    </View>
                    <View
                      style={[styles.track, { backgroundColor: colors.surface }]}
                    >
                      <View
                        style={[
                          styles.fill,
                          { width: `${item.percent}%`, backgroundColor: item.color },
                        ]}
                      />
                    </View>
                  </View>
                ))
                )
              ) : breakdownLoading ||
                (!breakdownFailed && breakdown?.dimension !== dimension) ? (
                <View style={styles.emptyWrap}>
                  <LoadingView text="加载排行…" />
                </View>
              ) : breakdownRows.length === 0 ? (
                <View style={styles.emptyWrap}>
                  <EmptyView
                    emoji={dimension === 'merchant' ? '🏪' : '🍜'}
                    title={
                      dimension === 'merchant'
                        ? '本月还没有商家数据'
                        : '本月还没有菜品数据'
                    }
                    description={
                      breakdownFailed
                        ? '暂时无法加载排行，记账不受影响'
                        : dimension === 'merchant'
                          ? '记账时填写「商家」后会出现在这里'
                          : '记账时选「吃了什么」后会出现在这里'
                    }
                  />
                </View>
              ) : (
                <>
                  {breakdownRows.map((item) => (
                    <View
                      key={`${dimension}:${item.name}`}
                      style={styles.catRow}
                    >
                      <View style={styles.catHeader}>
                        <Text
                          style={[styles.catName, { color: colors.textPrimary }]}
                          numberOfLines={1}
                          ellipsizeMode="tail"
                        >
                          {item.name}
                        </Text>
                        <Text
                          style={[styles.catAmount, { color: colors.textPrimary }]}
                        >
                          ¥{formatMoney(item.amount)}
                        </Text>
                      </View>
                      <Text
                        style={[styles.rankMeta, { color: colors.textTertiary }]}
                      >
                        {`${item.count} 次 · 人均 ¥${formatMoney(item.avg)}`}
                      </Text>
                      <View
                        style={[styles.track, { backgroundColor: colors.surface }]}
                      >
                        <View
                          style={[
                            styles.fill,
                            {
                              width: `${item.percent}%`,
                              backgroundColor:
                                dimension === 'merchant'
                                  ? colors.primary
                                  : colors.secondary,
                            },
                          ]}
                        />
                      </View>
                    </View>
                  ))}
                  <Text
                    style={[styles.rankFoot, { color: colors.textTertiary }]}
                  >
                    {dimension === 'merchant'
                      ? '仅统计「餐饮」；未填写「商家」的账单不计入'
                      : '仅统计「餐饮」；未填写「吃了什么」的账单不计入'}
                  </Text>
                </>
              )}
              {dimension === 'item' &&
              tab === 'self' &&
              (legacyNoteCount > 0 || lastCleanup) ? (
                <Pressable
                  onPress={openNoteCleanup}
                  style={({ pressed }) => [
                    styles.cleanupEntry,
                    pressed && styles.pressed,
                  ]}
                >
                  <Text
                    style={[styles.cleanupEntryText, { color: colors.primary }]}
                  >
                    {legacyNoteCount > 0
                      ? `旧备注 ${legacyNoteCount} 条未整理 · 去整理 ›`
                      : `上次整理 ${lastCleanup?.affected_count ?? 0} 条 · 可撤销 ›`}
                  </Text>
                </Pressable>
              ) : null}
            </View>

            <View style={[styles.card, skin.surfaces.card]}>
              <Text style={[styles.cardTitle, { color: colors.textPrimary }]}>
                收支趋势
              </Text>
              <Text style={[styles.cardSubtitle, { color: colors.textSecondary }]}>
                近 6 个月
              </Text>
              {trend.length === 0 ? (
                <View style={styles.emptyWrap}>
                  <EmptyView emoji="📉" title="暂无趋势数据" />
                </View>
              ) : (
                <TrendChart data={trend} colors={colors} />
              )}
              <ChartLegend colors={colors} />
            </View>
          </>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
  },
  content: {
    padding: spacing.lg,
    paddingBottom: spacing.xxl,
    gap: spacing.md,
  },
  cacheHint: {
    ...typography.caption,
    textAlign: 'center',
  },
  title: {
    ...typography.title,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
  },
  reportEntry: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    borderRadius: 999,
    borderWidth: 1,
    paddingHorizontal: 11,
    paddingVertical: 6,
  },
  reportEntryText: {
    fontSize: 12,
    fontWeight: '700',
  },
  reportEntryDot: {
    position: 'absolute',
    top: -3,
    right: -3,
    width: 8,
    height: 8,
    borderRadius: 4,
    borderWidth: 1.5,
  },
  reportBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    borderRadius: radius.lg,
    borderWidth: 1,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  reportBannerIcon: {
    width: 30,
    height: 30,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  reportBannerEmoji: {
    fontSize: 15,
  },
  reportBannerMain: {
    flex: 1,
    minWidth: 0,
  },
  reportBannerTitle: {
    fontSize: 12,
    fontWeight: '700',
  },
  reportBannerSub: {
    fontSize: 10,
    marginTop: 1,
  },
  reportBannerGo: {
    fontSize: 11,
    fontWeight: '700',
  },
  card: {
    borderRadius: radius.xl,
    padding: spacing.lg,
  },
  cardTitle: {
    ...typography.heading,
    marginBottom: spacing.sm,
  },
  distributionHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  dimensionControl: {
    marginTop: spacing.xs,
    marginBottom: spacing.lg,
  },
  cardMeta: {
    fontSize: 10,
    marginBottom: spacing.sm,
  },
  cardSubtitle: {
    fontSize: 12,
    marginBottom: spacing.sm,
  },
  rankMeta: {
    fontSize: 11,
    marginTop: -2,
    marginBottom: spacing.xs,
  },
  rankFoot: {
    fontSize: 10,
    lineHeight: 15,
    marginTop: spacing.xs,
  },
  cleanupEntry: {
    marginTop: spacing.sm,
    paddingVertical: spacing.xs,
  },
  cleanupEntryText: {
    fontSize: 12,
    fontWeight: '700',
  },
  monthRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.lg,
    marginBottom: spacing.lg,
  },
  monthLabel: {
    fontSize: 16,
    fontWeight: '600',
  },
  arrow: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
  },
  arrowText: {
    fontSize: 16,
    fontWeight: '700',
  },
  pressed: {
    opacity: 0.7,
  },
  summaryRow: {
    flexDirection: 'row',
  },
  summaryCell: {
    flex: 1,
    alignItems: 'center',
  },
  summaryLabel: {
    fontSize: 12,
    marginBottom: spacing.xs,
  },
  summaryValue: {
    fontSize: 22,
    fontWeight: '700',
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    marginVertical: spacing.lg,
  },
  stateWrap: {
    height: 340,
  },
  emptyWrap: {
    minHeight: 180,
  },
  catRow: {
    marginBottom: spacing.lg,
  },
  catHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.sm,
  },
  catNameWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  catEmoji: {
    fontSize: 15,
  },
  catName: {
    fontSize: 15,
    fontWeight: '500',
  },
  catAmount: {
    fontSize: 14,
    fontWeight: '600',
  },
  catPercent: {
    fontSize: 12,
    fontWeight: '400',
  },
  track: {
    height: 8,
    borderRadius: 4,
    overflow: 'hidden',
  },
  fill: {
    height: 8,
    borderRadius: 4,
  },
  legend: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: spacing.xl,
    marginTop: spacing.sm,
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  legendDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  legendText: {
    fontSize: 12,
  },
});
