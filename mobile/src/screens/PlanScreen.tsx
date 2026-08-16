import { useIsFocused } from '@react-navigation/native';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { extractErrorMessage } from '../api/client';
import { fetchBudget, setBudget, updateBudget } from '../api/budget';
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
import SegmentedControl from '../components/SegmentedControl';
import { gradient, radius, spacing, typography, useTheme } from '../theme';
import type { Budget, BudgetSummary, SavingsGoal } from '../types';

type PlanTab = 'budget' | 'savings';

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

  // ---------- 渲染 ----------

  const remaining =
    (budgetSummary?.total_budget ?? 0) - (budgetSummary?.total_spent ?? 0);
  const budgetErrorText = extractErrorMessage(budgetError, '预算加载失败');
  const savingsErrorText = extractErrorMessage(savingsError, '储蓄目标加载失败');

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
        <View style={[styles.card, { backgroundColor: colors.card }]}>
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

        <View style={[styles.card, { backgroundColor: colors.card }]}>
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
      <View style={[styles.card, { backgroundColor: colors.card }]}>
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

        {tab === 'budget' ? renderBudget() : renderSavings()}
      </ScrollView>

      <Pressable
        style={styles.fab}
        onPress={tab === 'budget' ? openCreateBudgetSheet : openCreateSavingSheet}
      >
        <GradientView style={styles.fabGradient}>
          <Text style={styles.fabText}>+</Text>
        </GradientView>
      </Pressable>

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
          <View style={[styles.sheet, { backgroundColor: colors.card }]}>
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
          <View style={[styles.sheet, { backgroundColor: colors.card }]}>
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
  fab: {
    position: 'absolute',
    right: 20,
    bottom: 96,
    borderRadius: radius.fab,
    elevation: 8,
    shadowColor: gradient.start,
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
