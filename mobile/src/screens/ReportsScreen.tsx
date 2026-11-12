import { useIsFocused, useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import React, { useCallback, useEffect, useState } from 'react';
import {
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { extractErrorMessage } from '../api/client';
import {
  fetchReportSettings,
  fetchReports,
  generateReportNow,
  markReportRead,
  updateReportSettings,
} from '../api/reports';
import EmptyView from '../components/EmptyView';
import ErrorView from '../components/ErrorView';
import GradientButton from '../components/GradientButton';
import GradientView from '../components/GradientView';
import LoadingView from '../components/LoadingView';
import ReportSettingsSheet from '../components/ReportSettingsSheet';
import { cacheKey, readCache, writeCache } from '../offline/cache';
import { isOnlineNow, subscribeNetwork } from '../offline/network';
import { useAuthStore } from '../store/authStore';
import { radius, spacing, typography, useSkin, useTheme } from '../theme';
import type { RootStackParamList } from '../navigation/types';
import type {
  ReportKind,
  ReportListItem,
  ReportListResponse,
  ReportSettings,
  ReportSettingsPayload,
} from '../types';
import {
  describeNextRun,
  describeReportMeta,
  describeSchedule,
  formatMoney,
  kindBadge,
} from '../utils/reportText';

type ReportsNavigation = NativeStackNavigationProp<RootStackParamList>;

/**
 * 财报列表（个人账本）。
 *
 * 数据：GET /reports + GET /reports/settings，均只查本人；
 * 缓存：列表 cacheKey(userId, 'reports')、设置 cacheKey(userId, 'report-settings')。
 * 规则：读失败静默降级到缓存，写操作离线置灰。
 */
export default function ReportsScreen() {
  const colors = useTheme();
  const skin = useSkin();
  const navigation = useNavigation<ReportsNavigation>();
  const isFocused = useIsFocused();
  const userId = useAuthStore((state) => state.user?.id ?? null);

  const [settings, setSettings] = useState<ReportSettings | null>(null);
  const [items, setItems] = useState<ReportListItem[]>([]);
  const [unread, setUnread] = useState(0);
  const [listTotal, setListTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);
  const [fromCache, setFromCache] = useState(false);
  const [online, setOnline] = useState(() => isOnlineNow());
  const [sheetOpen, setSheetOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [toggling, setToggling] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [reloadTick, setReloadTick] = useState(0);

  const listKey = userId ? cacheKey(userId, 'reports') : null;
  const settingsKey = userId ? cacheKey(userId, 'report-settings') : null;

  const load = useCallback(async () => {
    const cachedList = listKey
      ? await readCache<ReportListResponse>(listKey)
      : null;
    const cachedSettings = settingsKey
      ? await readCache<ReportSettings>(settingsKey)
      : null;

    if (cachedSettings) {
      setSettings(cachedSettings);
    }
    if (cachedList) {
      setItems(cachedList.items);
      setUnread(cachedList.unread_count);
      setListTotal(cachedList.total ?? cachedList.items.length);
      setLoading(false);
      setFromCache(true);
    }

    if (!isOnlineNow()) {
      if (!cachedList) {
        setError(new Error('离线模式：还没有财报缓存'));
        setItems([]);
        setUnread(0);
      }
      setFromCache(true);
      setLoading(false);
      return;
    }

    // 两个接口互不阻塞：单个失败时保留另一份结果 / 已有缓存。
    const [list, nextSettings] = await Promise.all([
      fetchReports().catch(() => null),
      fetchReportSettings().catch(() => null),
    ]);

    if (list) {
      setItems(list.items);
      setUnread(list.unread_count);
      setListTotal(list.total ?? list.items.length);
      setError(null);
      setFromCache(false);
      if (listKey) {
        writeCache(listKey, list).catch(() => undefined);
      }
    } else if (!cachedList) {
      setError(new Error('财报加载失败'));
    }

    if (nextSettings) {
      setSettings(nextSettings);
      if (settingsKey) {
        writeCache(settingsKey, nextSettings).catch(() => undefined);
      }
    }

    setLoading(false);
  }, [listKey, settingsKey]);

  useEffect(() => {
    setOnline(isOnlineNow());
    return subscribeNetwork((next) => setOnline(next));
  }, []);

  useEffect(() => {
    if (!isFocused) {
      return;
    }
    load().catch(() => undefined);
  }, [isFocused, online, reloadTick, load]);

  const reload = useCallback(() => setReloadTick((value) => value + 1), []);

  const openSheet = () => {
    if (!settings) {
      reload();
      return;
    }
    setSheetOpen(true);
  };

  /** 开关直接 PUT 设置；离线 / 保存中置灰，失败回滚原值并提示。 */
  const handleToggleEnabled = async (next: boolean) => {
    if (!settings || !online || toggling) {
      return;
    }
    const previous = settings;
    // 乐观更新：先翻转开关，失败再回滚（后端会返回新的 next_run_at）。
    setSettings({ ...settings, enabled: next });
    setToggling(true);
    try {
      const updated = await updateReportSettings({
        kind: previous.kind,
        anchor_weekday:
          previous.kind === 'weekly' ? previous.anchor_weekday ?? 1 : null,
        anchor_day: previous.anchor_day,
        anchor_hour: previous.anchor_hour,
        enabled: next,
      });
      setSettings(updated);
      if (settingsKey) {
        writeCache(settingsKey, updated).catch(() => undefined);
      }
    } catch (toggleError) {
      setSettings(previous);
      Alert.alert(
        '操作失败',
        extractErrorMessage(toggleError, '设置保存失败，请稍后重试'),
      );
    } finally {
      setToggling(false);
    }
  };

  /** 弹层保存：成功后关闭并回写缓存；失败交给弹层展示。 */
  const handleSaveSettings = async (payload: ReportSettingsPayload) => {
    if (!online) {
      throw new Error('离线状态无法保存，请联网后重试');
    }
    setSaving(true);
    try {
      const updated = await updateReportSettings(payload);
      setSettings(updated);
      if (settingsKey) {
        writeCache(settingsKey, updated).catch(() => undefined);
      }
      setSheetOpen(false);
    } finally {
      setSaving(false);
    }
  };

  /** 立即生成上一期：成功后进详情；已存在时后端返回已有报告。 */
  const runGenerateNow = async (kind?: ReportKind) => {
    if (!online) {
      throw new Error('离线状态无法生成，请联网后重试');
    }
    if (generating) {
      return;
    }
    setGenerating(true);
    try {
      const report = await generateReportNow(kind);
      setSheetOpen(false);
      setReloadTick((value) => value + 1);
      navigation.navigate('ReportDetail', {
        id: report.id,
        label: report.label,
      });
    } finally {
      setGenerating(false);
    }
  };

  const handleGenerateFromEmpty = () => {
    runGenerateNow().catch((generateError: unknown) => {
      Alert.alert(
        '生成失败',
        extractErrorMessage(generateError, '生成失败，请稍后重试'),
      );
    });
  };

  /** 打开详情：先标记已读（失败静默），再导航；未读数本地先减，不等网络。 */
  const openReport = (item: ReportListItem) => {
    if (!item.read_at && online) {
      markReportRead(item.id).catch(() => undefined);
      const readAt = new Date().toISOString();
      const nextItems = items.map((current) =>
        current.id === item.id ? { ...current, read_at: readAt } : current,
      );
      const nextUnread = Math.max(unread - 1, 0);
      setItems(nextItems);
      setUnread(nextUnread);
      // 同步缓存，避免离线重开时未读点又回来。
      if (listKey) {
        writeCache(listKey, {
          unread_count: nextUnread,
          total: listTotal,
          items: nextItems,
        }).catch(() => undefined);
      }
    }
    navigation.navigate('ReportDetail', { id: item.id, label: item.label });
  };

  const renderRuleCard = () => {
    if (!settings) {
      return (
        <View style={[styles.ruleCard, skin.surfaces.card]}>
          <View style={[styles.ruleIcon, { backgroundColor: colors.surface }]}>
            <Text style={styles.ruleEmoji}>🗓️</Text>
          </View>
          <View style={styles.ruleMain}>
            <Text style={[styles.ruleTitle, { color: colors.textPrimary }]}>
              生成设置
            </Text>
            <Text style={[styles.ruleSub, { color: colors.textTertiary }]}>
              {loading ? '正在读取规则…' : '规则读取失败，点击重试'}
            </Text>
          </View>
          {!loading ? (
            <Pressable onPress={reload} hitSlop={8}>
              <Text style={[styles.ruleRetry, { color: colors.primary }]}>
                重试
              </Text>
            </Pressable>
          ) : null}
        </View>
      );
    }

    return (
      <View style={[styles.ruleCard, skin.surfaces.card]}>
        <Pressable
          onPress={openSheet}
          style={({ pressed }) => [styles.rulePressable, pressed && styles.pressed]}
        >
          <GradientView colors={skin.gradient} style={styles.ruleIcon}>
            <Text style={styles.ruleEmoji}>🗓️</Text>
          </GradientView>
          <View style={styles.ruleMain}>
            <Text
              style={[styles.ruleTitle, { color: colors.textPrimary }]}
              numberOfLines={1}
            >
              {describeSchedule(settings)}
            </Text>
            <Text
              style={[styles.ruleSub, { color: colors.textTertiary }]}
              numberOfLines={1}
            >
              {describeNextRun(settings)}
            </Text>
          </View>
        </Pressable>
        <Switch
          value={settings.enabled}
          onValueChange={(next) => {
            handleToggleEnabled(next);
          }}
          disabled={!online || toggling || saving}
          trackColor={{ false: colors.border, true: colors.primary }}
          ios_backgroundColor={colors.border}
        />
      </View>
    );
  };

  const renderBody = () => {
    if (loading && items.length === 0 && !error) {
      return (
        <View style={styles.stateWrap}>
          <LoadingView text="加载财报…" />
        </View>
      );
    }

    if (error && items.length === 0) {
      return (
        <View style={styles.stateWrap}>
          <ErrorView
            title="财报加载失败"
            message={extractErrorMessage(error, '请稍后重试')}
            onRetry={reload}
          />
        </View>
      );
    }

    if (items.length === 0) {
      return (
        <>
          <View style={styles.emptyWrap}>
            <EmptyView
              emoji="📄"
              title="还没有财报"
              description="服务端会在设定时间自动生成上一期的财报；也可以现在生成一份看看"
            />
          </View>
          <GradientButton
            title={generating ? '生成中…' : '立即生成上一期'}
            onPress={handleGenerateFromEmpty}
            disabled={!online || generating}
          />
        </>
      );
    }

    return (
      <>
        <View style={styles.listHead}>
          <Text style={[styles.listHeadText, { color: colors.textTertiary }]}>
            历史报告
          </Text>
          <Text style={[styles.listHeadText, { color: colors.textTertiary }]}>
            {listTotal} 份{unread > 0 ? ` · ${unread} 份未读` : ''}
          </Text>
        </View>

        {items.map((item) => {
          const unreadItem = !item.read_at;
          return (
            <Pressable
              key={item.id}
              onPress={() => openReport(item)}
              style={({ pressed }) => [
                styles.reportItem,
                skin.surfaces.card,
                unreadItem && {
                  borderWidth: 1,
                  borderColor: colors.primary,
                },
                pressed && styles.pressed,
              ]}
            >
              <GradientView colors={skin.gradient} style={styles.badge}>
                <Text
                  style={[styles.badgeText, { color: skin.colors.onAccent }]}
                >
                  {kindBadge(item.kind)}
                </Text>
              </GradientView>
              <View style={styles.itemMain}>
                <Text
                  style={[styles.itemLabel, { color: colors.textPrimary }]}
                  numberOfLines={1}
                >
                  {item.label}
                </Text>
                <Text
                  style={[styles.itemSub, { color: colors.textTertiary }]}
                  numberOfLines={1}
                >
                  {describeReportMeta(item)}
                </Text>
              </View>
              <View style={styles.itemRight}>
                <Text
                  style={[
                    styles.itemBalance,
                    {
                      color:
                        item.balance >= 0 ? colors.income : colors.expense,
                    },
                  ]}
                >
                  {item.balance >= 0 ? '+' : '-'}
                  {formatMoney(Math.abs(item.balance))}
                </Text>
                <Text style={[styles.itemBalanceLabel, { color: colors.textTertiary }]}>
                  结余
                </Text>
              </View>
              {unreadItem ? (
                <View
                  style={[
                    styles.unreadDot,
                    { backgroundColor: colors.expense, borderColor: colors.card },
                  ]}
                />
              ) : null}
            </Pressable>
          );
        })}

        <Text style={[styles.footNote, { color: colors.textTertiary }]}>
          报告由服务端自动生成，每期只保留一份；打开详情即标记已读。
        </Text>
      </>
    );
  };

  return (
    <SafeAreaView
      style={[styles.safe, { backgroundColor: colors.background }]}
      edges={['top']}
    >
      <View style={styles.nav}>
        <Pressable
          onPress={() => navigation.goBack()}
          hitSlop={8}
          style={({ pressed }) => [styles.navSide, pressed && styles.pressed]}
        >
          <Text style={[styles.navBack, { color: colors.textSecondary }]}>
            ‹ 返回
          </Text>
        </Pressable>
        <Text style={[styles.navTitle, { color: colors.textPrimary }]}>财报</Text>
        <Pressable
          onPress={openSheet}
          hitSlop={8}
          style={({ pressed }) => [
            styles.navSide,
            styles.navSideRight,
            pressed && styles.pressed,
          ]}
        >
          <Text style={[styles.navAction, { color: colors.textSecondary }]}>⚙</Text>
        </Pressable>
      </View>

      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        {renderRuleCard()}

        {!online ? (
          <View style={[styles.notice, { backgroundColor: colors.surface }]}>
            <Text style={[styles.noticeText, { color: colors.textSecondary }]}>
              离线模式：显示的是上次缓存；设置、生成与标记已读需联网
            </Text>
          </View>
        ) : fromCache ? (
          <Text style={[styles.cacheHint, { color: colors.textSecondary }]}>
            网络不可用，显示上次缓存
          </Text>
        ) : null}

        {renderBody()}
      </ScrollView>

      <ReportSettingsSheet
        visible={sheetOpen}
        settings={settings}
        online={online}
        saving={saving}
        generating={generating}
        onClose={() => setSheetOpen(false)}
        onSave={handleSaveSettings}
        onGenerateNow={runGenerateNow}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
  },
  nav: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
  },
  navSide: {
    width: 64,
  },
  navSideRight: {
    alignItems: 'flex-end',
  },
  navBack: {
    fontSize: 14,
    fontWeight: '600',
  },
  navTitle: {
    flex: 1,
    textAlign: 'center',
    ...typography.heading,
  },
  navAction: {
    fontSize: 19,
  },
  content: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.xs,
    paddingBottom: spacing.xxl,
    gap: spacing.md,
  },
  ruleCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    borderRadius: radius.lg,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
  },
  rulePressable: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    minWidth: 0,
  },
  ruleIcon: {
    width: 36,
    height: 36,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ruleEmoji: {
    fontSize: 17,
  },
  ruleMain: {
    flex: 1,
    minWidth: 0,
  },
  ruleTitle: {
    fontSize: 13,
    fontWeight: '700',
  },
  ruleSub: {
    fontSize: 10.5,
    marginTop: 2,
  },
  ruleRetry: {
    fontSize: 13,
    fontWeight: '700',
  },
  notice: {
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  noticeText: {
    fontSize: 12,
    lineHeight: 17,
  },
  cacheHint: {
    ...typography.caption,
    textAlign: 'center',
  },
  stateWrap: {
    height: 320,
  },
  emptyWrap: {
    height: 240,
  },
  listHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: spacing.xs,
  },
  listHeadText: {
    fontSize: 11,
  },
  reportItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    borderRadius: radius.lg,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
  },
  badge: {
    width: 36,
    height: 36,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeText: {
    fontSize: 13,
    fontWeight: '800',
  },
  itemMain: {
    flex: 1,
    minWidth: 0,
  },
  itemLabel: {
    fontSize: 13.5,
    fontWeight: '700',
  },
  itemSub: {
    fontSize: 10.5,
    marginTop: 2,
  },
  itemRight: {
    alignItems: 'flex-end',
  },
  itemBalance: {
    fontSize: 13.5,
    fontWeight: '800',
  },
  itemBalanceLabel: {
    fontSize: 9.5,
    marginTop: 2,
  },
  unreadDot: {
    position: 'absolute',
    top: 8,
    right: 8,
    width: 7,
    height: 7,
    borderRadius: 4,
    borderWidth: 1.5,
  },
  footNote: {
    fontSize: 10,
    textAlign: 'center',
    marginTop: spacing.sm,
    lineHeight: 15,
  },
  pressed: {
    opacity: 0.7,
  },
});
