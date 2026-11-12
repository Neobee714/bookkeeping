import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import React, { useCallback, useEffect, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { extractErrorMessage } from '../api/client';
import { fetchReportDetail, markReportRead } from '../api/reports';
import { CATEGORY_COLORS } from '../api/stats';
import ErrorView from '../components/ErrorView';
import GradientView from '../components/GradientView';
import LoadingView from '../components/LoadingView';
import ScreenHeader from '../components/ScreenHeader';
import type { RootStackParamList } from '../navigation/types';
import { cacheKey, readCache, writeCache } from '../offline/cache';
import { isOnlineNow } from '../offline/network';
import { useAuthStore } from '../store/authStore';
import { radius, spacing, typography, useSkin, useTheme } from '../theme';
import type { ReportDetail } from '../types';
import {
  categoryEmoji,
  describeKind,
  formatDelta,
  formatGeneratedAt,
  formatMoney,
  formatMonthDay,
  formatPeriodRange,
  formatRate,
  trendTitle,
} from '../utils/reportText';

type DetailNavigation = NativeStackNavigationProp<RootStackParamList>;

interface HeroStatProps {
  label: string;
  value: string;
  labelColor: string;
  valueColor: string;
}

function HeroStat({ label, value, labelColor, valueColor }: HeroStatProps) {
  return (
    <View style={styles.heroCell}>
      <Text style={[styles.heroCellLabel, { color: labelColor }]}>{label}</Text>
      <Text style={[styles.heroCellValue, { color: valueColor }]}>{value}</Text>
    </View>
  );
}

interface CompareCellProps {
  label: string;
  value: string;
  labelColor: string;
  valueColor: string;
}

function CompareCell({ label, value, labelColor, valueColor }: CompareCellProps) {
  return (
    <View style={styles.compareCell}>
      <Text style={[styles.compareLabel, { color: labelColor }]}>{label}</Text>
      <Text style={[styles.compareValue, { color: valueColor }]}>{value}</Text>
    </View>
  );
}

/** 柱高：按最大值等比缩放到 64px，0 支出保留 3px 基线。 */
const barHeight = (value: number, max: number): number => {
  if (!Number.isFinite(value) || value <= 0 || max <= 0) {
    return 3;
  }
  return Math.max(3, Math.round((value / max) * 64));
};

/** 「常去的店」Top3 的顺序 emoji（不改数据，只做视觉点缀）。 */
const DINING_EMOJIS = ['🍜', '🍔', '🍲'];

/**
 * 财报详情（个人账本）。
 *
 * 内容全部来自生成时固化的快照：结余 / 储蓄率、环比、洞察、
 * 支出分布、趋势、最大单笔。离线读 cacheKey(userId, 'report', id)。
 */
export default function ReportDetailScreen() {
  const colors = useTheme();
  const skin = useSkin();
  const route = useRoute<RouteProp<RootStackParamList, 'ReportDetail'>>();
  const navigation = useNavigation<DetailNavigation>();
  const userId = useAuthStore((state) => state.user?.id ?? null);
  const { id } = route.params;

  const [detail, setDetail] = useState<ReportDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);
  const [fromCache, setFromCache] = useState(false);
  const [reloadTick, setReloadTick] = useState(0);

  const load = useCallback(async () => {
    const key = userId ? cacheKey(userId, 'report', id) : null;
    const cached = key ? await readCache<ReportDetail>(key) : null;
    if (cached) {
      setDetail(cached);
      setLoading(false);
      setFromCache(true);
    }

    if (!isOnlineNow()) {
      if (!cached) {
        setError(new Error('离线模式：这份报告还没有缓存'));
      }
      setLoading(false);
      return;
    }

    try {
      const data = await fetchReportDetail(id);
      setDetail(data);
      setError(null);
      setFromCache(false);
      if (key) {
        writeCache(key, data).catch(() => undefined);
      }
      // 打开详情即标记已读；失败静默，不阻塞展示。
      if (!data.read_at) {
        markReportRead(id).catch(() => undefined);
      }
    } catch (loadError) {
      if (!cached) {
        setError(loadError);
        setDetail(null);
      }
    } finally {
      setLoading(false);
    }
  }, [id, userId]);

  useEffect(() => {
    load().catch(() => undefined);
  }, [load, reloadTick]);

  const reload = () => setReloadTick((value) => value + 1);

  if (loading && !detail) {
    return (
      <SafeAreaView
        style={[styles.safe, { backgroundColor: colors.background }]}
        edges={['top']}
      >
        <ScreenHeader title="财报" onBack={() => navigation.goBack()} />
        <View style={styles.stateWrap}>
          <LoadingView text="加载财报…" />
        </View>
      </SafeAreaView>
    );
  }

  if (!detail) {
    return (
      <SafeAreaView
        style={[styles.safe, { backgroundColor: colors.background }]}
        edges={['top']}
      >
        <ScreenHeader title="财报" onBack={() => navigation.goBack()} />
        <View style={styles.stateWrap}>
          <ErrorView
            title="财报加载失败"
            message={extractErrorMessage(error, '请稍后重试')}
            onRetry={reload}
          />
        </View>
      </SafeAreaView>
    );
  }

  const content = detail.content;
  const heroColors = skin.heroGradient ?? [colors.card, colors.card];
  const heroRadius = Number(skin.surfaces.hero.borderRadius ?? radius.xl);
  // 快照 JSON 里的数组字段做一次兜底，避免历史脏数据把整页打崩。
  const categories = content.categories ?? [];
  const insights = content.insights ?? [];
  const topExpenses = content.top_expenses ?? [];
  const trendPoints = content.trend?.points ?? [];
  // v0.18 新增字段：旧报告没有这些键，全部按可选处理。
  const diningInsights = content.dining_insights ?? [];
  const diningMerchants = content.merchants ?? [];
  const dining = content.dining ?? null;
  const hasDining =
    diningInsights.length > 0 ||
    diningMerchants.length > 0 ||
    (dining?.count ?? 0) > 0;
  const maxTrend = trendPoints.reduce(
    (max, point) => (point.expense > max ? point.expense : max),
    0,
  );
  const prev = content.prev;
  const expenseDelta = prev?.expense_delta_pct ?? null;
  const incomeDelta = prev?.income_delta_pct ?? null;
  const expenseDeltaColor =
    expenseDelta !== null && expenseDelta > 0
      ? colors.expense
      : colors.textSecondary;
  const incomeDeltaColor =
    incomeDelta !== null && incomeDelta < 0
      ? colors.expense
      : colors.textSecondary;
  const generatedAt = formatGeneratedAt(detail.generated_at);

  return (
    <SafeAreaView
      style={[styles.safe, { backgroundColor: colors.background }]}
      edges={['top']}
    >
      <ScreenHeader title="财报" onBack={() => navigation.goBack()} />
      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        {fromCache ? (
          <Text style={[styles.cacheHint, { color: colors.textSecondary }]}>
            网络不可用，显示上次缓存
          </Text>
        ) : null}

        <View style={styles.docHead}>
          <View style={[styles.tag, { backgroundColor: colors.chipSoftBg }]}>
            <Text style={[styles.tagText, { color: colors.chipSoftText }]}>
              {describeKind(detail.kind)} · {detail.label}
            </Text>
          </View>
          <Text style={[styles.headline, { color: colors.textPrimary }]}>
            {content.headline}
          </Text>
          <Text style={[styles.subline, { color: colors.textTertiary }]}>
            {formatPeriodRange(detail.period_start, detail.period_end)}
            {generatedAt ? ` · ${generatedAt}` : ''}
          </Text>
        </View>

        {content.transaction_count === 0 ? (
          <View style={[styles.card, skin.surfaces.card]}>
            <Text style={[styles.bodyText, { color: colors.textSecondary }]}>
              本期还没有记账，报告里的数字都是 0；下一期有账单后会生成完整分析。
            </Text>
          </View>
        ) : null}

        {/* Hero：结余 + 储蓄率 + 收支笔数；neu 用纯色卡 + onHero 深色字 */}
        <View
          style={[styles.heroShadow, skin.surfaces.hero, { borderRadius: heroRadius }]}
        >
          <View style={[styles.heroClip, { borderRadius: heroRadius }]}>
            <GradientView
              colors={heroColors}
              style={[styles.heroGradient, { borderRadius: heroRadius }]}
            >
              <View style={styles.heroTop}>
                <View style={styles.heroMain}>
                  <Text
                    style={[
                      styles.heroLabel,
                      { color: skin.colors.onHeroMuted },
                    ]}
                  >
                    本期结余
                  </Text>
                  <Text
                    style={[styles.heroValue, { color: skin.colors.onHero }]}
                    numberOfLines={1}
                    adjustsFontSizeToFit
                  >
                    ¥{formatMoney(content.balance)}
                  </Text>
                </View>
                {content.savings_rate !== null &&
                content.savings_rate !== undefined ? (
                  <View style={styles.heroRate}>
                    <Text
                      style={[
                        styles.heroRateValue,
                        { color: skin.colors.onHero },
                      ]}
                    >
                      {formatRate(content.savings_rate)}
                    </Text>
                    <Text
                      style={[
                        styles.heroRateLabel,
                        { color: skin.colors.onHeroMuted },
                      ]}
                    >
                      储蓄率
                    </Text>
                  </View>
                ) : null}
              </View>

              <View
                style={[
                  styles.heroDivider,
                  { backgroundColor: skin.colors.onHeroMuted },
                ]}
              />

              <View style={styles.heroRow}>
                <HeroStat
                  label="收入"
                  value={`¥${formatMoney(content.total_income)}`}
                  labelColor={skin.colors.onHeroMuted}
                  valueColor={skin.colors.onHero}
                />
                <HeroStat
                  label="支出"
                  value={`¥${formatMoney(content.total_expense)}`}
                  labelColor={skin.colors.onHeroMuted}
                  valueColor={skin.colors.onHero}
                />
                <HeroStat
                  label="笔数"
                  value={`${content.transaction_count}`}
                  labelColor={skin.colors.onHeroMuted}
                  valueColor={skin.colors.onHero}
                />
              </View>
            </GradientView>
          </View>
        </View>

        {/* 三格环比：支出涨 / 收入跌用 expense，其余用 textSecondary */}
        <View style={[styles.card, skin.surfaces.card]}>
          <View style={styles.compareRow}>
            <CompareCell
              label="支出环比"
              value={formatDelta(expenseDelta)}
              labelColor={colors.textTertiary}
              valueColor={expenseDeltaColor}
            />
            <CompareCell
              label="收入环比"
              value={formatDelta(incomeDelta)}
              labelColor={colors.textTertiary}
              valueColor={incomeDeltaColor}
            />
            <CompareCell
              label="日均支出"
              value={`¥${formatMoney(content.daily_expense)}`}
              labelColor={colors.textTertiary}
              valueColor={colors.textPrimary}
            />
          </View>
          <Text style={[styles.compareHint, { color: colors.textTertiary }]}>
            {prev && content.prev_label
              ? `对比 ${content.prev_label}`
              : '上一期还没有账单，暂无环比'}
          </Text>
        </View>

        {/* 自动洞察 */}
        <View style={[styles.card, skin.surfaces.card]}>
          <View style={styles.cardHead}>
            <Text style={[styles.cardTitle, { color: colors.textPrimary }]}>
              本期洞察
            </Text>
            <Text style={[styles.cardMeta, { color: colors.textTertiary }]}>
              自动生成
            </Text>
          </View>
          {insights.length === 0 ? (
            <Text style={[styles.bodyText, { color: colors.textSecondary }]}>
              本期还没有足够的账单生成洞察。
            </Text>
          ) : (
            insights.map((text, index) => (
              <View key={`insight-${index}`} style={styles.insightRow}>
                <View
                  style={[
                    styles.insightIndex,
                    { backgroundColor: colors.chipSoftBg },
                  ]}
                >
                  <Text
                    style={[
                      styles.insightIndexText,
                      { color: colors.chipSoftText },
                    ]}
                  >
                    {index + 1}
                  </Text>
                </View>
                <Text
                  style={[styles.insightText, { color: colors.textSecondary }]}
                >
                  {text}
                </Text>
              </View>
            ))
          )}
        </View>

        {/* 吃喝：v0.18 新字段；旧报告没有这些字段 / 空数组时整卡隐藏 */}
        {hasDining ? (
          <View style={[styles.card, skin.surfaces.card]}>
            <View style={styles.cardHead}>
              <Text style={[styles.cardTitle, { color: colors.textPrimary }]}>
                吃喝
              </Text>
              <Text style={[styles.cardMeta, { color: colors.textTertiary }]}>
                来自商家 + 吃了什么
              </Text>
            </View>
            {diningInsights.map((text, index) => (
              <View key={`dining-insight-${index}`} style={styles.insightRow}>
                <View
                  style={[
                    styles.insightIndex,
                    { backgroundColor: colors.chipSoftBg },
                  ]}
                >
                  <Text
                    style={[
                      styles.insightIndexText,
                      { color: colors.chipSoftText },
                    ]}
                  >
                    {index + 1}
                  </Text>
                </View>
                <Text
                  style={[styles.insightText, { color: colors.textSecondary }]}
                >
                  {text}
                </Text>
              </View>
            ))}
            {diningInsights.length === 0 && dining && dining.count > 0 ? (
              <View style={styles.insightRow}>
                <View
                  style={[
                    styles.insightIndex,
                    { backgroundColor: colors.chipSoftBg },
                  ]}
                >
                  <Text
                    style={[
                      styles.insightIndexText,
                      { color: colors.chipSoftText },
                    ]}
                  >
                    1
                  </Text>
                </View>
                <Text
                  style={[styles.insightText, { color: colors.textSecondary }]}
                >
                  外食 {dining.count} 次，平均每次 ¥{formatMoney(dining.avg)}
                </Text>
              </View>
            ) : null}
            {diningMerchants.length > 0 ? (
              <>
                <Text
                  style={[
                    styles.diningSubtitle,
                    { color: colors.textTertiary },
                  ]}
                >
                  常去的店
                </Text>
                {diningMerchants.slice(0, 3).map((merchantItem, index) => (
                  <View
                    key={`dining-merchant-${index}`}
                    style={[
                      styles.diningRow,
                      index > 0 && {
                        borderTopWidth: StyleSheet.hairlineWidth,
                        borderTopColor: colors.border,
                      },
                    ]}
                  >
                    <View
                      style={[
                        styles.diningIcon,
                        { backgroundColor: colors.surface },
                      ]}
                    >
                      <Text style={styles.diningEmoji}>
                        {DINING_EMOJIS[index] ?? '🍽️'}
                      </Text>
                    </View>
                    <View style={styles.diningMain}>
                      <Text
                        style={[
                          styles.diningName,
                          { color: colors.textPrimary },
                        ]}
                        numberOfLines={1}
                      >
                        {merchantItem.name}
                      </Text>
                      <Text
                        style={[
                          styles.diningMeta,
                          { color: colors.textTertiary },
                        ]}
                      >
                        {`${merchantItem.count} 次 · 人均 ¥${formatMoney(
                          merchantItem.avg,
                        )}`}
                      </Text>
                    </View>
                    <Text style={[styles.diningAmount, { color: colors.expense }]}>
                      ¥{formatMoney(merchantItem.amount)}
                    </Text>
                  </View>
                ))}
              </>
            ) : null}
          </View>
        ) : null}

        {/* 支出分布：条形用固定分类色，文字全部走 theme token */}
        <View style={[styles.card, skin.surfaces.card]}>
          <View style={styles.cardHead}>
            <Text style={[styles.cardTitle, { color: colors.textPrimary }]}>
              支出分布
            </Text>
            <Text style={[styles.cardMeta, { color: colors.textTertiary }]}>
              我的账本
            </Text>
          </View>
          {categories.length === 0 ? (
            <Text style={[styles.bodyText, { color: colors.textSecondary }]}>
              本期没有支出。
            </Text>
          ) : (
            categories.map((item) => (
              <View key={item.name} style={styles.barRow}>
                <View style={styles.barHead}>
                  <Text
                    style={[styles.barName, { color: colors.textPrimary }]}
                    numberOfLines={1}
                  >
                    {categoryEmoji(item.name)} {item.name}
                  </Text>
                  <Text style={[styles.barValue, { color: colors.textTertiary }]}>
                    <Text style={[styles.barAmount, { color: colors.textPrimary }]}>
                      ¥{formatMoney(item.amount)}
                    </Text>
                    {` · ${Math.round(item.share)}%`}
                  </Text>
                </View>
                <View style={[styles.track, { backgroundColor: colors.surface }]}>
                  <View
                    style={[
                      styles.fill,
                      {
                        width: `${Math.min(Math.max(item.share, 0), 100)}%`,
                        backgroundColor:
                          CATEGORY_COLORS[item.name] ?? colors.primary,
                      },
                    ]}
                  />
                </View>
              </View>
            ))
          )}
        </View>

        {/* 趋势：纯 View 柱状图，不引第三方图表库 */}
        <View style={[styles.card, skin.surfaces.card]}>
          <View style={styles.cardHead}>
            <Text style={[styles.cardTitle, { color: colors.textPrimary }]}>
              {trendTitle(content.trend?.unit ?? '')}
            </Text>
            <Text style={[styles.cardMeta, { color: colors.textTertiary }]}>
              {maxTrend > 0 ? `最高 ¥${formatMoney(maxTrend)}` : '本期无支出'}
            </Text>
          </View>
          {trendPoints.length === 0 ? (
            <Text style={[styles.bodyText, { color: colors.textSecondary }]}>
              暂无趋势数据。
            </Text>
          ) : (
            <View style={styles.chart}>
              {trendPoints.map((point, index) => (
                <View key={`trend-${index}`} style={styles.chartCol}>
                  <View style={styles.chartTrack}>
                    <View
                      style={[
                        styles.chartBar,
                        {
                          height: barHeight(point.expense, maxTrend),
                          backgroundColor: colors.primary,
                        },
                      ]}
                    />
                  </View>
                  <Text
                    style={[styles.chartLabel, { color: colors.textTertiary }]}
                    numberOfLines={1}
                  >
                    {point.label}
                  </Text>
                </View>
              ))}
            </View>
          )}
        </View>

        {/* 最大单笔：金额 + 分类 + 备注 + 日期 */}
        <View style={[styles.card, skin.surfaces.card]}>
          <View style={styles.cardHead}>
            <Text style={[styles.cardTitle, { color: colors.textPrimary }]}>
              最大单笔
            </Text>
            <Text style={[styles.cardMeta, { color: colors.textTertiary }]}>
              {topExpenses.length > 0
                ? `Top ${topExpenses.length}`
                : '本期无支出'}
            </Text>
          </View>
          {topExpenses.length === 0 ? (
            <Text style={[styles.bodyText, { color: colors.textSecondary }]}>
              本期没有支出记录。
            </Text>
          ) : (
            topExpenses.map((item, index) => (
              <View
                key={`top-${index}`}
                style={[
                  styles.topRow,
                  index > 0 && {
                    borderTopWidth: StyleSheet.hairlineWidth,
                    borderTopColor: colors.border,
                  },
                ]}
              >
                <View style={[styles.topIcon, { backgroundColor: colors.surface }]}>
                  <Text style={styles.topEmoji}>
                    {categoryEmoji(item.category)}
                  </Text>
                </View>
                <View style={styles.topMain}>
                  <Text
                    style={[styles.topTitle, { color: colors.textPrimary }]}
                    numberOfLines={1}
                  >
                    {item.item?.trim() ||
                      item.merchant?.trim() ||
                      item.note?.trim() ||
                      item.category}
                  </Text>
                  <Text style={[styles.topSub, { color: colors.textTertiary }]}>
                    {[
                      item.merchant?.trim() && item.merchant !== item.item
                        ? item.merchant.trim()
                        : '',
                      item.category,
                      item.note?.trim() &&
                      item.note !== item.item &&
                      item.note !== item.merchant
                        ? item.note.trim()
                        : '',
                      formatMonthDay(item.date),
                    ]
                      .filter(Boolean)
                      .join(' · ')}
                  </Text>
                </View>
                <Text style={[styles.topAmount, { color: colors.expense }]}>
                  -¥{formatMoney(item.amount)}
                </Text>
              </View>
            ))
          )}
        </View>

        <Text style={[styles.foot, { color: colors.textTertiary }]}>
          本期共 {content.transaction_count} 笔账单 · 记账 {content.active_days} /{' '}
          {content.period_days} 天 · 数据截至 {formatMonthDay(detail.period_end)}
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
  },
  content: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: spacing.xxl,
    gap: spacing.md,
  },
  cacheHint: {
    ...typography.caption,
    textAlign: 'center',
  },
  stateWrap: {
    flex: 1,
    minHeight: 320,
  },
  docHead: {
    gap: spacing.xs,
  },
  tag: {
    alignSelf: 'flex-start',
    borderRadius: 999,
    paddingHorizontal: spacing.md,
    paddingVertical: 3,
  },
  tagText: {
    fontSize: 10.5,
    fontWeight: '700',
  },
  headline: {
    fontSize: 22,
    fontWeight: '800',
    letterSpacing: -0.2,
    marginTop: 2,
  },
  subline: {
    fontSize: 10.5,
  },
  card: {
    borderRadius: radius.xl,
    padding: spacing.lg,
  },
  cardHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.md,
  },
  cardTitle: {
    fontSize: 14,
    fontWeight: '800',
  },
  cardMeta: {
    fontSize: 10,
  },
  bodyText: {
    fontSize: 12.5,
    lineHeight: 19,
  },
  heroShadow: {
    marginTop: spacing.xs,
  },
  heroClip: {
    overflow: 'hidden',
  },
  heroGradient: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: spacing.md,
  },
  heroTop: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: spacing.md,
  },
  heroMain: {
    flex: 1,
    minWidth: 0,
  },
  heroLabel: {
    fontSize: 11,
  },
  heroValue: {
    fontSize: 29,
    fontWeight: '800',
    letterSpacing: -0.4,
    marginTop: 2,
  },
  heroRate: {
    alignItems: 'flex-end',
  },
  heroRateValue: {
    fontSize: 19,
    fontWeight: '800',
  },
  heroRateLabel: {
    fontSize: 9.5,
  },
  heroDivider: {
    height: StyleSheet.hairlineWidth,
    marginTop: spacing.md,
    marginBottom: spacing.md,
    opacity: 0.32,
  },
  heroRow: {
    flexDirection: 'row',
    gap: spacing.md,
  },
  heroCell: {
    flex: 1,
    minWidth: 0,
  },
  heroCellLabel: {
    fontSize: 10,
  },
  heroCellValue: {
    fontSize: 14,
    fontWeight: '800',
    marginTop: 1,
  },
  compareRow: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  compareCell: {
    flex: 1,
  },
  compareLabel: {
    fontSize: 9.5,
  },
  compareValue: {
    fontSize: 14,
    fontWeight: '800',
    marginTop: 2,
  },
  compareHint: {
    fontSize: 9.5,
    marginTop: spacing.sm,
  },
  insightRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginBottom: spacing.sm,
  },
  insightIndex: {
    width: 20,
    height: 20,
    borderRadius: 7,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 1,
  },
  insightIndexText: {
    fontSize: 11,
    fontWeight: '700',
  },
  insightText: {
    flex: 1,
    fontSize: 12,
    lineHeight: 18,
  },
  diningSubtitle: {
    fontSize: 10,
    fontWeight: '700',
    marginTop: spacing.sm,
    marginBottom: 2,
  },
  diningRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.sm,
  },
  diningIcon: {
    width: 30,
    height: 30,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  diningEmoji: {
    fontSize: 15,
  },
  diningMain: {
    flex: 1,
    minWidth: 0,
  },
  diningName: {
    fontSize: 11.5,
    fontWeight: '700',
  },
  diningMeta: {
    fontSize: 9.5,
    marginTop: 2,
  },
  diningAmount: {
    fontSize: 12,
    fontWeight: '800',
  },
  barRow: {
    marginBottom: spacing.sm,
  },
  barHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
    marginBottom: 3,
  },
  barName: {
    flexShrink: 1,
    fontSize: 11.5,
    fontWeight: '600',
  },
  barValue: {
    fontSize: 10.5,
  },
  barAmount: {
    fontWeight: '700',
  },
  track: {
    height: 6,
    borderRadius: 999,
    overflow: 'hidden',
  },
  fill: {
    height: 6,
    borderRadius: 999,
  },
  chart: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    marginTop: spacing.xs,
  },
  chartCol: {
    flex: 1,
    alignItems: 'center',
  },
  chartTrack: {
    height: 70,
    width: '100%',
    alignItems: 'center',
    justifyContent: 'flex-end',
  },
  chartBar: {
    width: '62%',
    maxWidth: 18,
    borderTopLeftRadius: 5,
    borderTopRightRadius: 5,
    borderBottomLeftRadius: 2,
    borderBottomRightRadius: 2,
  },
  chartLabel: {
    fontSize: 9,
    marginTop: 4,
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.sm,
  },
  topIcon: {
    width: 32,
    height: 32,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  topEmoji: {
    fontSize: 16,
  },
  topMain: {
    flex: 1,
    minWidth: 0,
  },
  topTitle: {
    fontSize: 12.5,
    fontWeight: '700',
  },
  topSub: {
    fontSize: 10,
    marginTop: 2,
  },
  topAmount: {
    fontSize: 13,
    fontWeight: '800',
  },
  foot: {
    fontSize: 9.5,
    textAlign: 'center',
    lineHeight: 15,
    marginTop: spacing.xs,
  },
});
