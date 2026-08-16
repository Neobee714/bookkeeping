import { useIsFocused } from '@react-navigation/native';
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
import {
  CATEGORY_COLORS,
  fetchMonthlySummary,
  fetchMonthlyTrendSeries,
  fetchPartnerMonthlySummary,
} from '../api/stats';
import EmptyView from '../components/EmptyView';
import ErrorView from '../components/ErrorView';
import LoadingView from '../components/LoadingView';
import SegmentedControl from '../components/SegmentedControl';
import { useAuthStore } from '../store/authStore';
import { radius, spacing, typography, useTheme, type ThemeColors } from '../theme';
import type { MonthlySummary, TrendPoint } from '../types';

type SummaryTab = 'self' | 'partner';

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

/** 图表:统计页(FR-04)。 */
export default function StatsScreen() {
  const colors = useTheme();
  const isFocused = useIsFocused();
  const partner = useAuthStore((state) => state.user?.partner);
  const partnerLabel = partner?.nickname?.trim() || '伴侣';

  const [currentMonth, setCurrentMonth] = useState(() => startOfMonth(new Date()));
  const [tab, setTab] = useState<SummaryTab>('self');
  const [summary, setSummary] = useState<MonthlySummary | null>(null);
  const [trend, setTrend] = useState<TrendPoint[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);
  const [reloadTick, setReloadTick] = useState(0);

  const monthKey = formatMonthKey(currentMonth);
  const requestKey = `${tab}:${monthKey}`;
  const requestKeyRef = useRef(requestKey);
  useEffect(() => {
    requestKeyRef.current = requestKey;
  }, [requestKey]);

  const load = useCallback(async () => {
    const key = requestKeyRef.current;
    const [activeTab, activeMonth] = key.split(':') as [SummaryTab, string];
    const [year, monthIndex] = activeMonth.split('-').map(Number);
    const endMonth = new Date(year, monthIndex - 1, 1);
    const summaryLoader =
      activeTab === 'self' ? fetchMonthlySummary : fetchPartnerMonthlySummary;

    setLoading(true);
    setError(null);
    try {
      const [summaryData, trendData] = await Promise.all([
        summaryLoader(activeMonth),
        fetchMonthlyTrendSeries({ target: activeTab, months: 6, endMonth }),
      ]);
      if (requestKeyRef.current === key) {
        setSummary(summaryData);
        setTrend(trendData);
      }
    } catch (loadError) {
      if (requestKeyRef.current === key) {
        setError(loadError);
        setSummary(null);
        setTrend([]);
      }
    } finally {
      if (requestKeyRef.current === key) {
        setLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    if (!isFocused) {
      return;
    }
    void load();
  }, [isFocused, requestKey, reloadTick, load]);

  const reload = useCallback(() => setReloadTick((value) => value + 1), []);

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

  const isPartnerUnavailable =
    tab === 'partner' &&
    axios.isAxiosError(error) &&
    error.response?.status === 403;
  const errorMessage = extractErrorMessage(error, '统计数据加载失败');

  return (
    <SafeAreaView
      style={[styles.safe, { backgroundColor: colors.background }]}
      edges={['top']}
    >
      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        <Text style={[styles.title, { color: colors.textPrimary }]}>图表</Text>

        <View style={[styles.card, { backgroundColor: colors.card }]}>
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
            <View style={[styles.card, { backgroundColor: colors.card }]}>
              <Text style={[styles.cardTitle, { color: colors.textPrimary }]}>
                支出分布
              </Text>
              {categoryRows.length === 0 ? (
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
              )}
            </View>

            <View style={[styles.card, { backgroundColor: colors.card }]}>
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
              <View style={styles.legend}>
                <View style={styles.legendItem}>
                  <View
                    style={[
                      styles.legendDot,
                      { backgroundColor: colors.income },
                    ]}
                  />
                  <Text style={[styles.legendText, { color: colors.textSecondary }]}>
                    收入
                  </Text>
                </View>
                <View style={styles.legendItem}>
                  <View
                    style={[
                      styles.legendDot,
                      { backgroundColor: colors.expense },
                    ]}
                  />
                  <Text style={[styles.legendText, { color: colors.textSecondary }]}>
                    支出
                  </Text>
                </View>
              </View>
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
  title: {
    ...typography.title,
  },
  card: {
    borderRadius: radius.xl,
    padding: spacing.lg,
  },
  cardTitle: {
    ...typography.heading,
    marginBottom: spacing.sm,
  },
  cardSubtitle: {
    fontSize: 12,
    marginBottom: spacing.sm,
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
