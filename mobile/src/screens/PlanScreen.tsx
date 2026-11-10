import { useIsFocused } from '@react-navigation/native';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Alert,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { extractErrorMessage } from '../api/client';
import { fetchBudget, setBudget, updateBudget } from '../api/budget';
import {
  createRecurringRule,
  deleteRecurringRule,
  fetchRecurringRules,
  updateRecurringRule,
} from '../api/recurring';
import {
  createSaving,
  deleteSaving,
  fetchSavings,
  updateSaving,
} from '../api/savings';
import ConfirmModal from '../components/ConfirmModal';
import EmptyView from '../components/EmptyView';
import ErrorView from '../components/ErrorView';
import GradientButton from '../components/GradientButton';
import GradientView from '../components/GradientView';
import LoadingView from '../components/LoadingView';
import RecurringSheet from '../components/RecurringSheet';
import SegmentedControl from '../components/SegmentedControl';
import { cacheKey, readCache, writeCache } from '../offline/cache';
import { isOnlineNow, subscribeNetwork } from '../offline/network';
import { useAuthStore } from '../store/authStore';
import { radius, spacing, typography, useSkin, useTheme } from '../theme';
import type {
  Budget,
  BudgetSummary,
  RecurringCreatePayload,
  RecurringRule,
  RecurringUpdatePayload,
  SavingsGoal,
} from '../types';
import { describeFreq, nextRunLabel } from '../utils/recurringText';

type PlanTab = 'budget' | 'savings' | 'recurring';

/** 分类元信息(emoji + 渐变),与 Web 端 PlanPage 对齐。 */
const CATEGORY_META: Record<string, { emoji: string; gradient: [string, string] }> = {
  餐饮: { emoji: '🍜', gradient: ['#FF9500', '#FFB340'] },
  交通: { emoji: '🚇', gradient: ['#007AFF', '#5AC8FA'] },
  日用: { emoji: '🛒', gradient: ['#34C759', '#30D158'] },
  娱乐: { emoji: '🎮', gradient: ['#FF2D55', '#FF6961'] },
  医疗: { emoji: '💊', gradient: ['#34C759', '#5AC8FA'] },
  教育: { emoji: '📚', gradient: ['#5AC8FA', '#64D2FF'] },
  购物: { emoji: '🛍️', gradient: ['#AF52DE', '#FF2D55'] },
  零食: { emoji: '🍿', gradient: ['#FF9500', '#FFB340'] },
  收入: { emoji: '💰', gradient: ['#34C759', '#30D158'] },
  生活费: { emoji: '💵', gradient: ['#34C759', '#30D158'] },
  其他: { emoji: '📌', gradient: ['#8E8E93', '#AEAEB2'] },
};

const DEFAULT_META: { emoji: string; gradient: [string, string] } = {
  emoji: '🏷️',
  gradient: ['#8E8E93', '#AEAEB2'],
};

const getCategoryMeta = (name: string): { emoji: string; gradient: [string, string] } =>
  CATEGORY_META[name] ?? DEFAULT_META;

/** 循环规则常见分类的 emoji；「居住 / 通讯 / 会员」等不在预算分类表里。 */
const RECURRING_EMOJI: Record<string, string> = {
  居住: '🏠',
  通讯: '📶',
  宽带: '📶',
  会员: '🎬',
  保险: '🛡️',
  工资: '💰',
};

const getRecurringEmoji = (name: string): string =>
  RECURRING_EMOJI[name] ?? getCategoryMeta(name).emoji;

/** 预算可选分类(支出类)。 */
const EXPENSE_CATEGORIES = [
  '餐饮',
  '交通',
  '日用',
  '娱乐',
  '医疗',
  '教育',
  '购物',
  '零食',
  '其他',
];

const QUICK_ADD_AMOUNTS = [100, 500, 1000];

const startOfMonth = (value: Date): Date =>
  new Date(value.getFullYear(), value.getMonth(), 1);

const shiftMonth = (value: Date, offset: number): Date =>
  new Date(value.getFullYear(), value.getMonth() + offset, 1);

const formatMonthKey = (value: Date): string =>
  `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, '0')}`;

const formatMonthLabel = (value: Date): string =>
  `${value.getFullYear()}年${value.getMonth() + 1}月`;

const parseAmount = (value: string): number | null => {
  const parsed = Number.parseFloat(value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return null;
  }
  return Number(parsed.toFixed(2));
};

const formatMoney = (value: number): string =>
  value.toLocaleString('zh-CN', { maximumFractionDigits: 2 });

const formatCurrency = (value: number): string => `¥${formatMoney(value)}`;

const getProgress = (
  spent: number,
  limit: number,
  gradient: [string, string],
): { percent: number; colors: [string, string] } => {
  if (limit <= 0) {
    if (spent > 0) {
      return { percent: 100, colors: ['#EF4444', '#F87171'] };
    }
    return { percent: 0, colors: gradient };
  }
  const rate = spent / limit;
  const percent = Math.min(rate * 100, 100);
  if (rate > 1) {
    return { percent, colors: ['#EF4444', '#F87171'] };
  }
  if (rate >= 0.9) {
    return { percent, colors: ['#F59E0B', '#EF4444'] };
  }
  return { percent, colors: gradient };
};

/** 规划:预算 + 储蓄目标(FR-05 / FR-06)。 */
export default function PlanScreen() {
  const colors = useTheme();
  const skin = useSkin();
  const isFocused = useIsFocused();

  const [tab, setTab] = useState<PlanTab>('budget');
  const [month, setMonth] = useState(() => startOfMonth(new Date()));

  // 预算数据
  const [budgetSummary, setBudgetSummary] = useState<BudgetSummary | null>(null);
  const [budgetLoading, setBudgetLoading] = useState(true);
  const [budgetError, setBudgetError] = useState<unknown>(null);

  // 储蓄数据
  const [goals, setGoals] = useState<SavingsGoal[]>([]);
  const [savingsLoading, setSavingsLoading] = useState(true);
  const [savingsError, setSavingsError] = useState<unknown>(null);

  // 循环规则数据
  const [rules, setRules] = useState<RecurringRule[]>([]);
  const [rulesLoading, setRulesLoading] = useState(true);
  const [rulesError, setRulesError] = useState<unknown>(null);
  const [online, setOnline] = useState(() => isOnlineNow());
  const [togglingId, setTogglingId] = useState<number | null>(null);
  const [recurringSheetOpen, setRecurringSheetOpen] = useState(false);
  const [editingRule, setEditingRule] = useState<RecurringRule | null>(null);

  const [reloadTick, setReloadTick] = useState(0);

  const monthKey = formatMonthKey(month);
  const monthLabel = formatMonthLabel(month);

  // ---------- 数据加载 ----------

  const loadBudget = useCallback(async () => {
    const key = monthKeyRef.current;
    setBudgetLoading(true);
    setBudgetError(null);
    try {
      const data = await fetchBudget(key);
      if (monthKeyRef.current === key) {
        setBudgetSummary(data);
      }
    } catch (loadError) {
      if (monthKeyRef.current === key) {
        setBudgetError(loadError);
        setBudgetSummary(null);
      }
    } finally {
      if (monthKeyRef.current === key) {
        setBudgetLoading(false);
      }
    }
  }, []);

  const loadSavings = useCallback(async () => {
    setSavingsLoading(true);
    setSavingsError(null);
    try {
      setGoals(await fetchSavings());
    } catch (loadError) {
      setSavingsError(loadError);
      setGoals([]);
    } finally {
      setSavingsLoading(false);
    }
  }, []);

  /** 循环规则缓存：联网成功后写回 bk.cache.v1.<uid>.recurring。 */
  const persistRules = useCallback((list: RecurringRule[]) => {
    const userId = useAuthStore.getState().user?.id;
    if (!userId) {
      return;
    }
    writeCache(cacheKey(userId, 'recurring'), list).catch(() => undefined);
  }, []);

  /** 当前列表快照：缓存只用于冷启动/离线兜底，避免每次刷新先用旧缓存闪一下。 */
  const rulesRef = useRef<RecurringRule[]>(rules);
  useEffect(() => {
    rulesRef.current = rules;
  }, [rules]);

  const loadRecurring = useCallback(async () => {
    setRulesLoading(true);
    setRulesError(null);
    const userId = useAuthStore.getState().user?.id;
    const key = userId ? cacheKey(userId, 'recurring') : null;
    // 先渲染缓存（离线唯一数据源），联网时再用服务端结果覆盖。
    const cached = key ? await readCache<RecurringRule[]>(key) : null;
    if (cached && cached.length > 0 && rulesRef.current.length === 0) {
      setRules(cached);
    }

    if (!isOnlineNow()) {
      // 离线：保留当前/缓存列表，只展示提示，不发写请求。
      setRulesLoading(false);
      return;
    }

    try {
      const list = await fetchRecurringRules();
      setRules(list);
      persistRules(list);
    } catch (loadError) {
      // 有缓存时保留列表并提示「展示的是上次结果」，避免一次网络抖动清空页面。
      setRulesError(loadError);
    } finally {
      setRulesLoading(false);
    }
  }, [persistRules]);

  const monthKeyRef = useRef(monthKey);
  useEffect(() => {
    monthKeyRef.current = monthKey;
  }, [monthKey]);

  useEffect(() => {
    if (!isFocused) {
      return;
    }
    void loadBudget();
  }, [isFocused, monthKey, reloadTick, loadBudget]);

  useEffect(() => {
    if (!isFocused) {
      return;
    }
    void loadSavings();
  }, [isFocused, reloadTick, loadSavings]);

  // 网络状态：决定「循环」分段能否写操作，并在恢复联网时自动刷新。
  useEffect(() => {
    setOnline(isOnlineNow());
    return subscribeNetwork((next) => setOnline(next));
  }, []);

  useEffect(() => {
    if (!isFocused) {
      return;
    }
    loadRecurring().catch(() => undefined);
  }, [isFocused, reloadTick, online, loadRecurring]);

  const reload = useCallback(() => setReloadTick((value) => value + 1), []);

  // ---------- 预算表单 ----------

  const [budgetSheetOpen, setBudgetSheetOpen] = useState(false);
  const [editingBudget, setEditingBudget] = useState<Budget | null>(null);
  const [budgetCategory, setBudgetCategory] = useState('餐饮');
  const [budgetLimitInput, setBudgetLimitInput] = useState('');
  const [budgetSheetError, setBudgetSheetError] = useState('');

  // ---------- 储蓄表单 ----------

  const [savingSheetOpen, setSavingSheetOpen] = useState(false);
  const [editingSaving, setEditingSaving] = useState<SavingsGoal | null>(null);
  const [savingName, setSavingName] = useState('');
  const [savingTargetInput, setSavingTargetInput] = useState('');
  const [savingCurrentInput, setSavingCurrentInput] = useState('');
  const [savingDeadline, setSavingDeadline] = useState('');
  const [savingSheetError, setSavingSheetError] = useState('');
  const [confirmDeleteVisible, setConfirmDeleteVisible] = useState(false);

  const [submitting, setSubmitting] = useState(false);
  const [deleting, setDeleting] = useState(false);

  // ---------- 打开/关闭弹窗 ----------

  const openCreateBudgetSheet = () => {
    setEditingBudget(null);
    setBudgetCategory('餐饮');
    setBudgetLimitInput('');
    setBudgetSheetError('');
    setBudgetSheetOpen(true);
  };

  const openEditBudgetSheet = (item: Budget) => {
    setEditingBudget(item);
    setBudgetCategory(item.category);
    setBudgetLimitInput(item.monthly_limit > 0 ? String(item.monthly_limit) : '');
    setBudgetSheetError('');
    setBudgetSheetOpen(true);
  };

  const openCreateSavingSheet = () => {
    setEditingSaving(null);
    setSavingName('');
    setSavingTargetInput('');
    setSavingCurrentInput('');
    setSavingDeadline('');
    setSavingSheetError('');
    setSavingSheetOpen(true);
  };

  const openEditSavingSheet = (goal: SavingsGoal) => {
    setEditingSaving(goal);
    setSavingName(goal.name);
    setSavingTargetInput(String(goal.target_amount));
    setSavingCurrentInput(String(goal.current_amount));
    setSavingDeadline(goal.deadline ?? '');
    setSavingSheetError('');
    setSavingSheetOpen(true);
  };

  const closeBudgetSheet = () => setBudgetSheetOpen(false);
  const closeSavingSheet = () => setSavingSheetOpen(false);

  // ---------- 提交 ----------

  const handleSubmitBudget = async () => {
    if (submitting) {
      return;
    }
    const amount = parseAmount(budgetLimitInput);
    if (!amount) {
      setBudgetSheetError('请输入有效预算金额');
      return;
    }
    setSubmitting(true);
    setBudgetSheetError('');
    try {
      if (editingBudget?.id) {
        await updateBudget(editingBudget.id, {
          category: budgetCategory,
          monthly_limit: amount,
          year_month: monthKey,
        });
      } else {
        await setBudget({
          category: budgetCategory,
          monthly_limit: amount,
          year_month: monthKey,
        });
      }
      setBudgetSheetOpen(false);
      await loadBudget();
    } catch (submitError) {
      setBudgetSheetError(extractErrorMessage(submitError, '预算保存失败'));
    } finally {
      setSubmitting(false);
    }
  };

  const handleSubmitSaving = async () => {
    if (submitting) {
      return;
    }
    const targetAmount = parseAmount(savingTargetInput);
    const currentRaw = Number.parseFloat(savingCurrentInput || '0');
    const deadline = savingDeadline.trim() || null;
    if (!savingName.trim()) {
      setSavingSheetError('请输入目标名称');
      return;
    }
    if (!targetAmount) {
      setSavingSheetError('请输入有效目标金额');
      return;
    }
    if (!Number.isFinite(currentRaw) || currentRaw < 0) {
      setSavingSheetError('当前金额不正确');
      return;
    }
    if (deadline && !/^\d{4}-\d{2}-\d{2}$/.test(deadline)) {
      setSavingSheetError('截止日期格式应为 YYYY-MM-DD');
      return;
    }
    const currentAmount = Number(currentRaw.toFixed(2));
    setSubmitting(true);
    setSavingSheetError('');
    try {
      if (editingSaving) {
        await updateSaving(editingSaving.id, {
          name: savingName.trim(),
          target_amount: targetAmount,
          current_amount: currentAmount,
          deadline,
        });
      } else {
        await createSaving({
          name: savingName.trim(),
          target_amount: targetAmount,
          current_amount: currentAmount,
          deadline,
        });
      }
      setSavingSheetOpen(false);
      await loadSavings();
    } catch (submitError) {
      setSavingSheetError(extractErrorMessage(submitError, '储蓄目标保存失败'));
    } finally {
      setSubmitting(false);
    }
  };

  const handleDeleteSaving = async () => {
    if (!editingSaving || deleting) {
      return;
    }
    setDeleting(true);
    try {
      await deleteSaving(editingSaving.id);
      setConfirmDeleteVisible(false);
      setSavingSheetOpen(false);
      setEditingSaving(null);
      await loadSavings();
    } catch (deleteError) {
      setSavingSheetError(extractErrorMessage(deleteError, '删除失败'));
      setConfirmDeleteVisible(false);
    } finally {
      setDeleting(false);
    }
  };

  const addToCurrent = (amount: number) => {
    const current = Number.parseFloat(savingCurrentInput || '0');
    const base = Number.isFinite(current) ? current : 0;
    setSavingCurrentInput(String(Number((base + amount).toFixed(2))));
  };

  // ---------- 循环规则 ----------

  const openCreateRecurringSheet = () => {
    if (!isOnlineNow()) {
      Alert.alert('需要联网', '新建循环记账需要联网');
      return;
    }
    setEditingRule(null);
    setRecurringSheetOpen(true);
  };

  const openEditRecurringSheet = (rule: RecurringRule) => {
    if (!isOnlineNow()) {
      Alert.alert('需要联网', '编辑循环规则需要联网');
      return;
    }
    setEditingRule(rule);
    setRecurringSheetOpen(true);
  };

  const closeRecurringSheet = () => setRecurringSheetOpen(false);

  /** 新建/编辑共用：成功后关闭弹层并刷新列表（失败由弹层展示并保留输入）。 */
  const handleSubmitRecurring = async (payload: RecurringCreatePayload) => {
    if (!isOnlineNow()) {
      throw new Error('离线状态无法保存，请联网后重试');
    }
    if (!editingRule) {
      await createRecurringRule(payload);
    } else {
      // 只发改动字段：freq / start_date 未变时不让后端重算 next_run_date。
      const patch: RecurringUpdatePayload = {};
      if (payload.amount !== editingRule.amount) {
        patch.amount = payload.amount;
      }
      if (payload.type !== editingRule.type) {
        patch.type = payload.type;
      }
      if (payload.category !== editingRule.category) {
        patch.category = payload.category;
      }
      if ((payload.note ?? '') !== (editingRule.note ?? '')) {
        // 清空备注时显式传 null（PATCH 用 exclude_unset，字段缺失会保留旧值）。
        patch.note = payload.note ?? null;
      }
      if (payload.freq !== editingRule.freq) {
        patch.freq = payload.freq;
      }
      if (payload.start_date !== editingRule.start_date) {
        patch.start_date = payload.start_date;
      }
      if (Object.keys(patch).length === 0) {
        setRecurringSheetOpen(false);
        return;
      }
      await updateRecurringRule(editingRule.id, patch);
    }
    setRecurringSheetOpen(false);
    await loadRecurring();
  };

  const handleDeleteRecurring = async (rule: RecurringRule) => {
    if (!isOnlineNow()) {
      throw new Error('离线状态无法删除，请联网后重试');
    }
    await deleteRecurringRule(rule.id);
    setRecurringSheetOpen(false);
    await loadRecurring();
  };

  /** 启用/暂停：先乐观更新，失败回滚并提示（离线直接拦截）。 */
  const handleToggleRule = async (rule: RecurringRule, nextEnabled: boolean) => {
    if (!isOnlineNow()) {
      Alert.alert('需要联网', '切换启用状态需要联网');
      return;
    }
    if (togglingId !== null) {
      return;
    }
    setTogglingId(rule.id);
    const optimistic = rules.map((item) =>
      item.id === rule.id ? { ...item, enabled: nextEnabled } : item,
    );
    setRules(optimistic);
    try {
      const updated = await updateRecurringRule(rule.id, {
        enabled: nextEnabled,
      });
      // 后端在恢复启用时会重算 next_run_date，用返回值覆盖。
      const merged = optimistic.map((item) =>
        item.id === updated.id ? updated : item,
      );
      setRules(merged);
      persistRules(merged);
    } catch (toggleError) {
      setRules(
        optimistic.map((item) =>
          item.id === rule.id ? { ...item, enabled: !nextEnabled } : item,
        ),
      );
      Alert.alert(
        '操作失败',
        extractErrorMessage(toggleError, '切换失败，请稍后重试'),
      );
    } finally {
      setTogglingId(null);
    }
  };

  // ---------- 渲染 ----------

  const remaining =
    (budgetSummary?.total_budget ?? 0) - (budgetSummary?.total_spent ?? 0);
  const budgetErrorText = extractErrorMessage(budgetError, '预算加载失败');
  const savingsErrorText = extractErrorMessage(savingsError, '储蓄目标加载失败');
  const rulesErrorText = extractErrorMessage(rulesError, '循环规则加载失败');

  const renderBudget = () => {
    if (budgetLoading && !budgetSummary) {
      return (
        <View style={styles.stateWrap}>
          <LoadingView text="加载预算…" />
        </View>
      );
    }
    if (budgetError) {
      return (
        <View style={styles.stateWrap}>
          <ErrorView title="预算加载失败" message={budgetErrorText} onRetry={reload} />
        </View>
      );
    }
    if (!budgetSummary) {
      return null;
    }
    return (
      <>
        <View style={[styles.card, skin.surfaces.card]}>
          <Text style={[styles.summaryCaption, { color: colors.textSecondary }]}>
            本月预算 · {monthLabel}
          </Text>
          <View style={styles.summaryRow}>
            <View style={styles.summaryCell}>
              <Text style={[styles.summaryLabel, { color: colors.textSecondary }]}>
                总预算
              </Text>
              <Text style={[styles.summaryValue, { color: colors.textPrimary }]}>
                {formatCurrency(budgetSummary.total_budget)}
              </Text>
            </View>
            <View style={styles.summaryCell}>
              <Text style={[styles.summaryLabel, { color: colors.textSecondary }]}>
                总支出
              </Text>
              <Text style={[styles.summaryValue, { color: colors.expense }]}>
                {formatCurrency(budgetSummary.total_spent)}
              </Text>
            </View>
            <View style={styles.summaryCell}>
              <Text style={[styles.summaryLabel, { color: colors.textSecondary }]}>
                剩余
              </Text>
              <Text
                style={[
                  styles.summaryValue,
                  { color: remaining >= 0 ? colors.income : colors.expense },
                ]}
              >
                {formatCurrency(remaining)}
              </Text>
            </View>
          </View>
        </View>

        <View style={[styles.card, skin.surfaces.card]}>
          <Text style={[styles.cardTitle, { color: colors.textPrimary }]}>
            分类预算
          </Text>
          {budgetSummary.items.length === 0 ? (
            <View style={styles.emptyWrap}>
              <EmptyView
                emoji="🎯"
                title="本月暂无预算"
                description="点击右下角 + 为分类设置预算"
              />
            </View>
          ) : (
            budgetSummary.items.map((item) => {
              const meta = getCategoryMeta(item.category);
              const progress = getProgress(
                item.actual_spent,
                item.monthly_limit,
                meta.gradient,
              );
              return (
                <Pressable
                  key={`${item.category}-${item.id ?? 'new'}`}
                  onPress={() => openEditBudgetSheet(item)}
                  style={({ pressed }) => [styles.budgetRow, pressed && styles.pressed]}
                >
                  <View style={styles.budgetHeader}>
                    <Text style={[styles.budgetCategory, { color: colors.textPrimary }]}>
                      {meta.emoji} {item.category}
                    </Text>
                    <Text style={[styles.budgetAmount, { color: colors.textSecondary }]}>
                      {formatCurrency(item.actual_spent)} /{' '}
                      {formatCurrency(item.monthly_limit)}
                    </Text>
                  </View>
                  <View style={[styles.track, { backgroundColor: colors.surface }]}>
                    <View style={{ width: `${progress.percent}%` }}>
                      <GradientView colors={progress.colors} style={styles.fill} />
                    </View>
                  </View>
                  {item.monthly_limit > 0 ? (
                    <Text style={[styles.budgetRemain, { color: colors.textTertiary }]}>
                      剩余 {formatCurrency(item.remaining)}
                    </Text>
                  ) : null}
                </Pressable>
              );
            })
          )}
        </View>
      </>
    );
  };

  const renderSavings = () => {
    if (savingsLoading && goals.length === 0) {
      return (
        <View style={styles.stateWrap}>
          <LoadingView text="加载储蓄目标…" />
        </View>
      );
    }
    if (savingsError) {
      return (
        <View style={styles.stateWrap}>
          <ErrorView
            title="储蓄目标加载失败"
            message={savingsErrorText}
            onRetry={reload}
          />
        </View>
      );
    }
    if (goals.length === 0) {
      return (
        <View style={styles.stateWrap}>
          <EmptyView
            emoji="🐷"
            title="还没有储蓄目标"
            description="点击右下角 + 创建第一个存钱目标"
          />
        </View>
      );
    }
    return (
      <View style={[styles.card, skin.surfaces.card]}>
        <Text style={[styles.cardTitle, { color: colors.textPrimary }]}>
          存钱目标
        </Text>
        {goals.map((goal) => {
          const percent =
            goal.target_amount > 0
              ? Math.min(
                  Math.round((goal.current_amount / goal.target_amount) * 100),
                  100,
                )
              : 0;
          return (
            <Pressable
              key={goal.id}
              onPress={() => openEditSavingSheet(goal)}
              style={({ pressed }) => [
                styles.savingRow,
                { backgroundColor: colors.surface },
                pressed && styles.pressed,
              ]}
            >
              <View style={styles.savingHeader}>
                <Text style={[styles.savingName, { color: colors.textPrimary }]}>
                  {goal.name}
                </Text>
                <Text style={[styles.savingPercent, { color: colors.textSecondary }]}>
                  {percent}%
                </Text>
              </View>
              <View style={[styles.track, { backgroundColor: colors.border }]}>
                <View style={{ width: `${percent}%` }}>
                  <GradientView style={styles.fill} />
                </View>
              </View>
              <View style={styles.savingMeta}>
                <Text style={[styles.savingAmount, { color: colors.textSecondary }]}>
                  {formatCurrency(goal.current_amount)} /{' '}
                  {formatCurrency(goal.target_amount)}
                </Text>
                {goal.deadline ? (
                  <Text style={[styles.savingDeadline, { color: colors.textTertiary }]}>
                    截止 {goal.deadline}
                  </Text>
                ) : null}
              </View>
            </Pressable>
          );
        })}
        <Text style={[styles.savingHint, { color: colors.textTertiary }]}>
          点击目标可编辑、更新进度或删除
        </Text>
      </View>
    );
  };

  const renderRecurring = () => {
    if (rulesLoading && rules.length === 0) {
      return (
        <View style={styles.stateWrap}>
          <LoadingView text="加载循环规则…" />
        </View>
      );
    }
    if (rulesError && rules.length === 0) {
      return (
        <View style={styles.stateWrap}>
          <ErrorView
            title="循环规则加载失败"
            message={rulesErrorText}
            onRetry={reload}
          />
        </View>
      );
    }

    return (
      <>
        {!online ? (
          <View style={[styles.offlineNotice, { backgroundColor: colors.chipSoftBg }]}>
            <Text style={[styles.offlineNoticeText, { color: colors.chipSoftText }]}>
              离线模式：显示的是上次缓存；新建 / 编辑 / 删除 / 开关需联网
            </Text>
          </View>
        ) : rulesError ? (
          <View style={[styles.inlineError, { backgroundColor: colors.surface }]}>
            <Text
              style={[styles.inlineErrorText, { color: colors.expense }]}
              numberOfLines={2}
            >
              刷新失败，展示的是上次结果
            </Text>
            <Pressable onPress={reload} hitSlop={8}>
              <Text style={[styles.inlineRetry, { color: colors.primary }]}>
                重试
              </Text>
            </Pressable>
          </View>
        ) : null}

        {rules.length === 0 ? (
          <View style={styles.stateWrap}>
            <EmptyView
              emoji="🔁"
              title="还没有循环记账"
              description={
                online
                  ? '把房租、工资这类固定账单设成自动记'
                  : '联网后可以新建循环记账'
              }
            />
          </View>
        ) : (
          <View style={[styles.card, skin.surfaces.card]}>
            <Text style={[styles.cardTitle, { color: colors.textPrimary }]}>
              循环规则
            </Text>
            {rules.map((rule) => {
              const isIncome = rule.type === 'income';
              return (
                <Pressable
                  key={rule.id}
                  onPress={() => openEditRecurringSheet(rule)}
                  style={({ pressed }) => [
                    styles.ruleRow,
                    {
                      backgroundColor: colors.surface,
                      opacity: rule.enabled ? 1 : 0.55,
                    },
                    pressed && styles.pressed,
                  ]}
                >
                  <View style={[styles.ruleIcon, { backgroundColor: colors.card }]}>
                    <Text style={styles.ruleEmoji}>
                      {getRecurringEmoji(rule.category)}
                    </Text>
                  </View>
                  <View style={styles.ruleMain}>
                    <Text
                      numberOfLines={1}
                      style={[styles.ruleName, { color: colors.textPrimary }]}
                    >
                      {rule.note?.trim() || rule.category}
                    </Text>
                    <Text
                      numberOfLines={1}
                      style={[styles.ruleSub, { color: colors.textTertiary }]}
                    >
                      {describeFreq(rule)}
                    </Text>
                  </View>
                  <View style={styles.ruleRight}>
                    <Text
                      style={[
                        styles.ruleAmount,
                        { color: isIncome ? colors.income : colors.expense },
                      ]}
                    >
                      {isIncome ? '+' : '-'}¥{formatMoney(rule.amount)}
                    </Text>
                    <Text style={[styles.ruleNext, { color: colors.textTertiary }]}>
                      {nextRunLabel(rule)}
                    </Text>
                  </View>
                  <Switch
                    value={rule.enabled}
                    onValueChange={(next) => {
                      handleToggleRule(rule, next);
                    }}
                    disabled={!online || togglingId !== null}
                    trackColor={{ false: colors.border, true: colors.primary }}
                    ios_backgroundColor={colors.border}
                  />
                </Pressable>
              );
            })}
          </View>
        )}

        <GradientButton
          title="＋ 新建循环记账"
          onPress={openCreateRecurringSheet}
          disabled={!online}
          style={styles.recurringCta}
        />
        <Text style={[styles.recurringHint, { color: colors.textTertiary }]}>
          点条目可编辑；开关控制是否继续自动生成
        </Text>
      </>
    );
  };

  return (
    <SafeAreaView
      style={[styles.safe, { backgroundColor: colors.background }]}
      edges={['top']}
    >
      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        <Text style={[styles.title, { color: colors.textPrimary }]}>规划</Text>

        <SegmentedControl
          options={[
            { key: 'budget', label: '预算' },
            { key: 'savings', label: '存钱' },
            { key: 'recurring', label: '循环' },
          ]}
          value={tab}
          onChange={(key) => setTab(key as PlanTab)}
        />

        {tab === 'budget' && (
          <View style={styles.monthRow}>
            <Pressable
              onPress={() => setMonth((previous) => shiftMonth(previous, -1))}
              hitSlop={8}
              style={({ pressed }) => [
                styles.arrow,
                { backgroundColor: colors.surface },
                pressed && styles.pressed,
              ]}
            >
              <Text style={[styles.arrowText, { color: colors.primary }]}>‹</Text>
            </Pressable>
            <Text style={[styles.monthLabel, { color: colors.textPrimary }]}>
              {monthLabel}
            </Text>
            <Pressable
              onPress={() => setMonth((previous) => shiftMonth(previous, 1))}
              hitSlop={8}
              style={({ pressed }) => [
                styles.arrow,
                { backgroundColor: colors.surface },
                pressed && styles.pressed,
              ]}
            >
              <Text style={[styles.arrowText, { color: colors.primary }]}>›</Text>
            </Pressable>
          </View>
        )}

        {tab === 'budget' ? renderBudget() : null}
        {tab === 'savings' ? renderSavings() : null}
        {tab === 'recurring' ? renderRecurring() : null}
      </ScrollView>

      {tab !== 'recurring' ? (
        <Pressable
          style={[styles.fab, { shadowColor: skin.gradient[0] }]}
          onPress={tab === 'budget' ? openCreateBudgetSheet : openCreateSavingSheet}
        >
          <GradientView style={styles.fabGradient}>
            <Text style={[styles.fabText, { color: skin.colors.onAccent }]}>+</Text>
          </GradientView>
        </Pressable>
      ) : null}

      {/* 预算弹窗 */}
      <Modal
        visible={budgetSheetOpen}
        transparent
        animationType="slide"
        onRequestClose={closeBudgetSheet}
      >
        <KeyboardAvoidingView
          style={styles.sheetRoot}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          <Pressable style={[styles.sheetBackdrop, { backgroundColor: colors.overlay }]} onPress={closeBudgetSheet} />
          <View style={[styles.sheet, skin.surfaces.card]}>
            <View style={[styles.sheetHandle, { backgroundColor: colors.border }]} />
            <ScrollView
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
            >
              <Text style={[styles.sheetTitle, { color: colors.textPrimary }]}>
                {editingBudget?.id ? '编辑预算' : '设置预算'}
              </Text>
              <Text style={[styles.sheetHint, { color: colors.textSecondary }]}>
                预算月份:{monthLabel}
              </Text>

              <Text style={[styles.fieldLabel, { color: colors.textSecondary }]}>
                分类
              </Text>
              <View style={styles.chipWrap}>
                {EXPENSE_CATEGORIES.map((name) => {
                  const selected = budgetCategory === name;
                  const meta = getCategoryMeta(name);
                  return (
                    <Pressable key={name} onPress={() => setBudgetCategory(name)}>
                      {selected ? (
                        <GradientView colors={meta.gradient} style={styles.chipSelected}>
                          <Text style={styles.chipTextSelected}>
                            {meta.emoji} {name}
                          </Text>
                        </GradientView>
                      ) : (
                        <View style={[styles.chip, { backgroundColor: colors.surface }]}>
                          <Text style={[styles.chipText, { color: colors.textSecondary }]}>
                            {meta.emoji} {name}
                          </Text>
                        </View>
                      )}
                    </Pressable>
                  );
                })}
              </View>

              <Text style={[styles.fieldLabel, { color: colors.textSecondary }]}>
                月度限额
              </Text>
              <TextInput
                style={[
                  styles.input,
                  { backgroundColor: colors.surface, color: colors.textPrimary },
                ]}
                value={budgetLimitInput}
                onChangeText={(value) => setBudgetLimitInput(value.replace(/[^0-9.]/g, ''))}
                placeholder="请输入预算金额"
                placeholderTextColor={colors.textTertiary}
                keyboardType="decimal-pad"
                maxLength={12}
              />

              {budgetSheetError ? (
                <Text style={[styles.sheetError, { color: colors.expense }]}>
                  {budgetSheetError}
                </Text>
              ) : null}

              <GradientButton
                title={submitting ? '保存中…' : '保存预算'}
                onPress={handleSubmitBudget}
                disabled={submitting}
                style={styles.sheetButton}
              />
              {editingBudget?.id ? (
                <Text style={[styles.sheetNote, { color: colors.textTertiary }]}>
                  预算暂不支持删除,可修改限额调整
                </Text>
              ) : null}
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* 储蓄弹窗 */}
      <Modal
        visible={savingSheetOpen}
        transparent
        animationType="slide"
        onRequestClose={closeSavingSheet}
      >
        <KeyboardAvoidingView
          style={styles.sheetRoot}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          <Pressable style={[styles.sheetBackdrop, { backgroundColor: colors.overlay }]} onPress={closeSavingSheet} />
          <View style={[styles.sheet, skin.surfaces.card]}>
            <View style={[styles.sheetHandle, { backgroundColor: colors.border }]} />
            <ScrollView
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
            >
              <Text style={[styles.sheetTitle, { color: colors.textPrimary }]}>
                {editingSaving ? '更新储蓄目标' : '新建储蓄目标'}
              </Text>

              <Text style={[styles.fieldLabel, { color: colors.textSecondary }]}>
                目标名称
              </Text>
              <TextInput
                style={[
                  styles.input,
                  { backgroundColor: colors.surface, color: colors.textPrimary },
                ]}
                value={savingName}
                onChangeText={setSavingName}
                placeholder="例如:买 MacBook"
                placeholderTextColor={colors.textTertiary}
                maxLength={100}
              />

              <Text style={[styles.fieldLabel, { color: colors.textSecondary }]}>
                目标金额
              </Text>
              <TextInput
                style={[
                  styles.input,
                  { backgroundColor: colors.surface, color: colors.textPrimary },
                ]}
                value={savingTargetInput}
                onChangeText={(value) => setSavingTargetInput(value.replace(/[^0-9.]/g, ''))}
                placeholder="请输入目标金额"
                placeholderTextColor={colors.textTertiary}
                keyboardType="decimal-pad"
                maxLength={12}
              />

              <Text style={[styles.fieldLabel, { color: colors.textSecondary }]}>
                当前已存
              </Text>
              <TextInput
                style={[
                  styles.input,
                  { backgroundColor: colors.surface, color: colors.textPrimary },
                ]}
                value={savingCurrentInput}
                onChangeText={(value) => setSavingCurrentInput(value.replace(/[^0-9.]/g, ''))}
                placeholder="默认 0"
                placeholderTextColor={colors.textTertiary}
                keyboardType="decimal-pad"
                maxLength={12}
              />
              <View style={styles.quickAddRow}>
                {QUICK_ADD_AMOUNTS.map((amount) => (
                  <Pressable
                    key={amount}
                    onPress={() => addToCurrent(amount)}
                    style={({ pressed }) => [
                      styles.quickChip,
                      { borderColor: colors.border, backgroundColor: colors.surface },
                      pressed && styles.pressed,
                    ]}
                  >
                    <Text style={[styles.quickChipText, { color: colors.primary }]}>
                      +{amount}
                    </Text>
                  </Pressable>
                ))}
              </View>

              <Text style={[styles.fieldLabel, { color: colors.textSecondary }]}>
                预计完成日期(可选)
              </Text>
              <TextInput
                style={[
                  styles.input,
                  { backgroundColor: colors.surface, color: colors.textPrimary },
                ]}
                value={savingDeadline}
                onChangeText={(value) => setSavingDeadline(value.replace(/[^0-9-]/g, ''))}
                placeholder="YYYY-MM-DD"
                placeholderTextColor={colors.textTertiary}
                keyboardType="numbers-and-punctuation"
                maxLength={10}
              />

              {savingSheetError ? (
                <Text style={[styles.sheetError, { color: colors.expense }]}>
                  {savingSheetError}
                </Text>
              ) : null}

              <GradientButton
                title={submitting ? '保存中…' : '保存目标'}
                onPress={handleSubmitSaving}
                disabled={submitting}
                style={styles.sheetButton}
              />

              {editingSaving ? (
                <Pressable
                  onPress={() => setConfirmDeleteVisible(true)}
                  disabled={submitting}
                  style={({ pressed }) => [
                    styles.deleteButton,
                    { backgroundColor: colors.surface },
                    pressed && styles.pressed,
                  ]}
                >
                  <Text style={[styles.deleteText, { color: colors.expense }]}>
                    {deleting ? '删除中…' : '删除目标'}
                  </Text>
                </Pressable>
              ) : null}
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      <ConfirmModal
        visible={confirmDeleteVisible}
        title="删除储蓄目标"
        message={`确定删除目标「${editingSaving?.name ?? ''}」吗?此操作不可恢复。`}
        confirmText="删除"
        onConfirm={handleDeleteSaving}
        onCancel={() => setConfirmDeleteVisible(false)}
      />

      {/* 循环规则弹层（新建 / 编辑共用） */}
      <RecurringSheet
        visible={recurringSheetOpen}
        editingRule={editingRule}
        online={online}
        onClose={closeRecurringSheet}
        onSubmit={handleSubmitRecurring}
        onDelete={handleDeleteRecurring}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
  },
  content: {
    padding: spacing.lg,
    paddingBottom: 120,
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
    marginBottom: spacing.md,
  },
  summaryCaption: {
    fontSize: 13,
    marginBottom: spacing.md,
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
    fontSize: 18,
    fontWeight: '700',
  },
  monthRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.lg,
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
  stateWrap: {
    height: 340,
  },
  emptyWrap: {
    minHeight: 180,
  },
  budgetRow: {
    marginBottom: spacing.lg,
  },
  budgetHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.sm,
  },
  budgetCategory: {
    fontSize: 15,
    fontWeight: '500',
  },
  budgetAmount: {
    fontSize: 13,
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
  budgetRemain: {
    fontSize: 11,
    marginTop: spacing.xs,
  },
  savingRow: {
    borderRadius: radius.lg,
    padding: spacing.lg,
    marginBottom: spacing.sm,
  },
  savingHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.sm,
  },
  savingName: {
    fontSize: 15,
    fontWeight: '600',
  },
  savingPercent: {
    fontSize: 13,
    fontWeight: '600',
  },
  savingMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: spacing.sm,
  },
  savingAmount: {
    fontSize: 13,
  },
  savingDeadline: {
    fontSize: 11,
  },
  savingHint: {
    fontSize: 12,
    textAlign: 'center',
    marginTop: spacing.sm,
  },
  offlineNotice: {
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  offlineNoticeText: {
    fontSize: 12,
    lineHeight: 17,
  },
  inlineError: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  inlineErrorText: {
    flexShrink: 1,
    fontSize: 12,
  },
  inlineRetry: {
    fontSize: 13,
    fontWeight: '700',
  },
  ruleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    borderRadius: radius.lg,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    marginBottom: spacing.sm,
  },
  ruleIcon: {
    width: 38,
    height: 38,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ruleEmoji: {
    fontSize: 19,
  },
  ruleMain: {
    flex: 1,
    minWidth: 0,
  },
  ruleName: {
    fontSize: 14,
    fontWeight: '700',
  },
  ruleSub: {
    fontSize: 11,
    marginTop: 2,
  },
  ruleRight: {
    alignItems: 'flex-end',
  },
  ruleAmount: {
    fontSize: 13,
    fontWeight: '800',
  },
  ruleNext: {
    fontSize: 10,
    fontWeight: '600',
    marginTop: 2,
  },
  recurringCta: {
    marginTop: spacing.sm,
  },
  recurringHint: {
    fontSize: 11,
    textAlign: 'center',
    marginTop: spacing.sm,
  },
  fab: {
    position: 'absolute',
    right: 20,
    bottom: 96,
    borderRadius: radius.fab,
    elevation: 8,
    shadowOpacity: 0.4,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
  },
  fabGradient: {
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },
  fabText: {
    color: '#FFFFFF',
    fontSize: 30,
    fontWeight: '300',
    lineHeight: 34,
  },
  sheetRoot: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  sheetBackdrop: {
    ...StyleSheet.absoluteFill,
  },
  sheet: {
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    padding: spacing.xl,
    paddingBottom: spacing.xxl,
    maxHeight: '88%',
  },
  sheetHandle: {
    alignSelf: 'center',
    width: 40,
    height: 4,
    borderRadius: 2,
    marginBottom: spacing.md,
  },
  sheetTitle: {
    ...typography.heading,
    marginBottom: spacing.xs,
  },
  sheetHint: {
    fontSize: 12,
    marginBottom: spacing.md,
  },
  fieldLabel: {
    fontSize: 12,
    marginBottom: spacing.xs,
    marginTop: spacing.md,
  },
  chipWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  chip: {
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  chipSelected: {
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  chipText: {
    fontSize: 13,
    fontWeight: '500',
  },
  chipTextSelected: {
    fontSize: 13,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  input: {
    borderRadius: radius.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    fontSize: 15,
  },
  quickAddRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginTop: spacing.sm,
  },
  quickChip: {
    borderRadius: radius.md,
    borderWidth: 1,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
  },
  quickChipText: {
    fontSize: 13,
    fontWeight: '600',
  },
  sheetError: {
    fontSize: 12,
    marginTop: spacing.md,
  },
  sheetButton: {
    marginTop: spacing.lg,
  },
  sheetNote: {
    fontSize: 11,
    textAlign: 'center',
    marginTop: spacing.md,
  },
  deleteButton: {
    borderRadius: radius.xl,
    alignItems: 'center',
    paddingVertical: spacing.lg,
    marginTop: spacing.md,
  },
  deleteText: {
    fontSize: 15,
    fontWeight: '600',
  },
});
