import React, { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
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

import DateTimePicker, {
  type DateTimePickerEvent,
} from '@react-native-community/datetimepicker';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { fetchCategories, type CategoryItem } from '../api/categories';
import { extractErrorMessage } from '../api/client';
import {
  fetchQuickInputs,
  removeNotePreset,
  setNotePreset,
} from '../api/quickInputs';
import { radius, spacing, typography, useTheme } from '../theme';
import type {
  QuickInputs,
  QuickNoteCandidate,
  Transaction,
  TransactionCreatePayload,
  TransactionType,
} from '../types';
import { isValidDateString, toDateString } from '../utils/format';
import { buildNoteChips, type QuickNoteChip } from '../utils/quickNoteChips';
import GradientButton from './GradientButton';
import GradientView from './GradientView';

interface Props {
  visible: boolean;
  /** 非空 = 编辑模式(预填),否则为新增。 */
  editingItem: Transaction | null;
  onClose: () => void;
  /** 由父组件负责调用 create/update API;抛错时在弹层内展示。 */
  onSubmit: (payload: TransactionCreatePayload) => Promise<void>;
}

const sanitizeAmount = (raw: string): string => {
  const cleaned = raw.replace(/[^0-9.]/g, '');
  if (!cleaned) {
    return '';
  }
  const [whole, ...rest] = cleaned.split('.');
  const decimal = rest.join('').slice(0, 2);
  if (rest.length === 0) {
    return whole;
  }
  return `${whole}.${decimal}`;
};

const quickDate = (offset: number): string => {
  const date = new Date();
  date.setDate(date.getDate() + offset);
  return toDateString(date);
};

/** YYYY-MM-DD -> 本地时区 Date(避免 new Date('YYYY-MM-DD') 的 UTC 偏移)。 */
const parseDateStr = (value: string): Date => {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) {
    return new Date();
  }
  return new Date(
    Number(match[1]),
    Number(match[2]) - 1,
    Number(match[3]),
  );
};

/** YYYY-MM-DD -> MM-DD(「同上次」chip 文案)。 */
const formatMonthDay = (value: string): string => value.slice(5);

/** 校验快捷输入接口结构,异常时按「本次不可用」处理(静默降级,不渲染 chip 区)。 */
const normalizeQuickInputs = (
  data: QuickInputs | null | undefined,
): QuickInputs | null => {
  if (!data || !Array.isArray(data.pinned)) {
    return null;
  }
  if (typeof data.by_category !== 'object' || data.by_category === null) {
    return null;
  }
  return data;
};

/**
 * 记账弹层:底部弹出 Modal。
 * 收支切换 + 金额大输入 + 备注 + 日期(原生选择器)+ 分类宫格(按 type 过滤);
 * 编辑时预填,新增/编辑共用。
 * v0.5 新增:日期行「同上次 MM-DD」chip、备注「＋收藏」、备注 chips 行;
 * 快捷数据接口失败时静默降级,完全不影响记账主流程。
 */
export default function AddTransactionSheet({
  visible,
  editingItem,
  onClose,
  onSubmit,
}: Props) {
  const colors = useTheme();
  const insets = useSafeAreaInsets();

  const [type, setType] = useState<TransactionType>('expense');
  const [amountInput, setAmountInput] = useState('');
  const [category, setCategory] = useState('');
  const [dateStr, setDateStr] = useState(quickDate(0));
  const [note, setNote] = useState('');
  const [errorMessage, setErrorMessage] = useState('');
  const [submitting, setSubmitting] = useState(false);

  /** 日期选择器:点击日期行后置 true;Android 弹出原生 Dialog,iOS 内嵌 spinner。 */
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [pickerDate, setPickerDate] = useState<Date>(() => new Date());

  const [categories, setCategories] = useState<CategoryItem[]>([]);
  const [categoriesLoading, setCategoriesLoading] = useState(false);
  const [categoriesError, setCategoriesError] = useState('');
  const [categoriesLoaded, setCategoriesLoaded] = useState(false);

  /** 快捷输入数据(最近一笔日期 + 收藏备注 + 各分类高频备注);null = 不可用(不渲染 chip 区)。 */
  const [quickInputs, setQuickInputs] = useState<QuickInputs | null>(null);

  useEffect(() => {
    if (!visible) {
      return;
    }
    if (editingItem) {
      setType(editingItem.type);
      setAmountInput(String(editingItem.amount));
      setCategory(editingItem.category);
      setDateStr(isValidDateString(editingItem.date) ? editingItem.date : quickDate(0));
      setNote(editingItem.note ?? '');
    } else {
      setType('expense');
      setAmountInput('');
      setCategory('');
      setDateStr(quickDate(0));
      setNote('');
    }
    setErrorMessage('');
    setShowDatePicker(false);
  }, [visible, editingItem]);

  const loadCategories = async () => {
    setCategoriesLoading(true);
    setCategoriesError('');
    try {
      const list = await fetchCategories();
      setCategories(list);
      setCategoriesLoaded(true);
    } catch (error) {
      setCategoriesError(extractErrorMessage(error, '分类加载失败'));
    } finally {
      setCategoriesLoading(false);
    }
  };

  useEffect(() => {
    if (visible && !categoriesLoaded && !categoriesLoading) {
      void loadCategories();
    }
  }, [visible, categoriesLoaded, categoriesLoading]);

  // 每次打开弹层拉一次快捷数据(切分类只在本地过滤,不重复请求)。
  // 失败或结构异常一律静默降级:quickInputs 保持 null,不渲染 chip 区、不影响记账。
  useEffect(() => {
    if (!visible) {
      setQuickInputs(null);
      return;
    }
    let cancelled = false;
    fetchQuickInputs()
      .then((data) => {
        if (!cancelled) {
          setQuickInputs(normalizeQuickInputs(data));
        }
      })
      .catch(() => {
        if (!cancelled) {
          setQuickInputs(null);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [visible]);

  const activeCategories = useMemo(
    () => categories.filter((c) => c.type === type),
    [categories, type],
  );

  // 切换收支类型后,若当前分类不属于该类型,自动选中第一个。
  useEffect(() => {
    if (activeCategories.length > 0 && !activeCategories.some((c) => c.name === category)) {
      setCategory(activeCategories[0].name);
    }
  }, [activeCategories, category]);

  const categoryRows = useMemo(() => {
    const rows: CategoryItem[][] = [];
    for (let index = 0; index < activeCategories.length; index += 4) {
      rows.push(activeCategories.slice(index, index + 4));
    }
    return rows;
  }, [activeCategories]);

  const title = editingItem ? '编辑账单' : '新增账单';
  const buttonText = editingItem ? '保存修改' : '确认新增';

  /** 「同上次」chip 的日期:后端返回且格式合法时才渲染。 */
  const lastDate =
    quickInputs?.last_date && isValidDateString(quickInputs.last_date)
      ? quickInputs.last_date
      : null;
  const lastDateActive = lastDate !== null && dateStr === lastDate;

  /** 备注 chips:★ 收藏在最前(保持后端顺序)+ 当前分类推荐(去重后),整体截断 8 个。 */
  const noteChips = useMemo(
    () =>
      buildNoteChips({
        pinned: quickInputs?.pinned,
        byCategory: quickInputs?.by_category,
        category,
      }),
    [quickInputs, category],
  );

  const trimmedNote = note.trim();
  const pinnedNotes = useMemo(
    () => new Set((quickInputs?.pinned ?? []).map((item) => item.note)),
    [quickInputs],
  );
  const canPinNote = trimmedNote.length > 0 && !pinnedNotes.has(trimmedNote);

  const updatePinned = (
    updater: (list: QuickNoteCandidate[]) => QuickNoteCandidate[],
  ) => {
    setQuickInputs((prev) =>
      prev ? { ...prev, pinned: updater(prev.pinned) } : prev,
    );
  };

  const handleUseLastDate = () => {
    if (lastDate) {
      setDateStr(lastDate);
    }
  };

  /** 「＋收藏」:成功后本地乐观更新(新收藏排最前,与后端 created_at 倒序一致)。 */
  const handlePinNote = async () => {
    if (!canPinNote) {
      return;
    }
    const target = trimmedNote;
    try {
      await setNotePreset(target, 'pinned');
      updatePinned((list) => [
        { note: target, count: 0, last_used: null },
        ...list,
      ]);
    } catch (error) {
      // 用户主动点击触发的失败要给提示,否则会被误认为按钮失灵;
      // 失败时不做任何本地变更(与服务端保持一致)。
      Alert.alert('操作失败', extractErrorMessage(error, '收藏失败,请重试'));
    }
  };

  /** 取消收藏:从 ★ 组移除(该备注若仍在自动推荐里,会回到推荐组)。 */
  const handleUnpinNote = async (target: string) => {
    try {
      await removeNotePreset(target);
      updatePinned((list) => list.filter((item) => item.note !== target));
    } catch (error) {
      Alert.alert('操作失败', extractErrorMessage(error, '取消收藏失败,请重试'));
    }
  };

  /** 不再推荐:本地把所有分类里的该备注一并移除(隐藏记录本身是全局的)。 */
  const handleHideNote = async (target: string) => {
    try {
      await setNotePreset(target, 'hidden');
      setQuickInputs((prev) => {
        if (!prev) {
          return prev;
        }
        const byCategory: Record<string, QuickNoteCandidate[]> = {};
        for (const [key, list] of Object.entries(prev.by_category)) {
          byCategory[key] = list.filter((item) => item.note !== target);
        }
        return { ...prev, by_category: byCategory };
      });
    } catch (error) {
      Alert.alert('操作失败', extractErrorMessage(error, '操作失败,请重试'));
    }
  };

  /** 长按 chip:★ 收藏 → 取消收藏;自动推荐 → 不再推荐。 */
  const handleChipLongPress = (chip: QuickNoteChip) => {
    const isPinnedChip = chip.source === 'pinned';
    Alert.alert(chip.note, undefined, [
      {
        text: isPinnedChip ? '取消收藏' : '不再推荐',
        onPress: () => {
          if (isPinnedChip) {
            // 两个处理器内部都自行兜住异常,不会抛到 Alert 回调外。
            handleUnpinNote(chip.note);
          } else {
            handleHideNote(chip.note);
          }
        },
      },
      { text: '取消', style: 'cancel' },
    ]);
  };

  const handleOpenDatePicker = () => {
    setPickerDate(parseDateStr(dateStr));
    setShowDatePicker(true);
  };

  const handleDateChange = (event: DateTimePickerEvent, date?: Date) => {
    if (Platform.OS === 'android') {
      // Android:原生 Dialog 选择/取消后自动关闭,这里同步收起选择器。
      setShowDatePicker(false);
      if (event.type === 'set' && date) {
        setDateStr(toDateString(date));
      }
      return;
    }
    // iOS:spinner 滚动时只更新暂存值,点「完成」后回填并关闭。
    if (date) {
      setPickerDate(date);
    }
  };

  const handleIosConfirm = () => {
    setDateStr(toDateString(pickerDate));
    setShowDatePicker(false);
  };

  const handleConfirm = async () => {
    const amount = Number.parseFloat(amountInput);
    if (!Number.isFinite(amount) || amount <= 0) {
      setErrorMessage('请输入有效金额');
      return;
    }
    if (!category) {
      setErrorMessage('请选择分类');
      return;
    }
    if (!isValidDateString(dateStr)) {
      setErrorMessage('请选择有效日期(YYYY-MM-DD)');
      return;
    }

    setErrorMessage('');
    setSubmitting(true);
    try {
      await onSubmit({
        amount: Number(amount.toFixed(2)),
        type,
        category,
        date: dateStr,
        note: note.trim() || undefined,
      });
    } catch (error) {
      setErrorMessage(extractErrorMessage(error, '提交失败,请重试'));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <View style={[styles.overlay, { backgroundColor: colors.overlay }]}>
        <Pressable style={styles.backdrop} onPress={onClose} />
        <KeyboardAvoidingView
          style={styles.sheetWrap}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          <View
            style={[
              styles.sheet,
              {
                backgroundColor: colors.card,
                paddingBottom: spacing.xl + Math.max(insets.bottom, 56),
              },
            ]}
          >
            <View style={[styles.handle, { backgroundColor: colors.border }]} />
            <View style={styles.head}>
              <Text style={[styles.headTitle, { color: colors.textPrimary }]}>
                {title}
              </Text>
              <Pressable
                onPress={onClose}
                style={[styles.closeButton, { backgroundColor: colors.surface }]}
              >
                <Text style={[styles.closeText, { color: colors.textSecondary }]}>
                  关闭
                </Text>
              </Pressable>
            </View>

            <ScrollView
              keyboardShouldPersistTaps="handled"
              contentContainerStyle={styles.scrollContent}
            >
              {/* 收支切换 */}
              <View style={[styles.toggle, { backgroundColor: colors.surface }]}>
                <Pressable style={styles.seg} onPress={() => setType('expense')}>
                  {type === 'expense' ? (
                    <GradientView style={styles.segActive}>
                      <Text style={styles.segTextActive}>支出</Text>
                    </GradientView>
                  ) : (
                    <Text style={[styles.segText, { color: colors.textSecondary }]}>
                      支出
                    </Text>
                  )}
                </Pressable>
                <Pressable style={styles.seg} onPress={() => setType('income')}>
                  {type === 'income' ? (
                    <GradientView style={styles.segActive}>
                      <Text style={styles.segTextActive}>收入</Text>
                    </GradientView>
                  ) : (
                    <Text style={[styles.segText, { color: colors.textSecondary }]}>
                      收入
                    </Text>
                  )}
                </Pressable>
              </View>

              {/* 金额 */}
              <Text style={[styles.label, { color: colors.textSecondary }]}>金额</Text>
              <View style={[styles.amountBox, { backgroundColor: colors.surface }]}>
                <Text style={[styles.yuan, { color: colors.primary }]}>¥</Text>
                <TextInput
                  style={[styles.amountInput, { color: colors.textPrimary }]}
                  value={amountInput}
                  onChangeText={(text) => setAmountInput(sanitizeAmount(text))}
                  placeholder="0.00"
                  placeholderTextColor={colors.textTertiary}
                  keyboardType="decimal-pad"
                />
              </View>

              {/* 备注 */}
              <Text style={[styles.label, { color: colors.textSecondary }]}>备注(可选)</Text>
              <View style={[styles.noteRow, { backgroundColor: colors.surface }]}>
                <TextInput
                  style={[styles.noteInput, { color: colors.textPrimary }]}
                  value={note}
                  onChangeText={setNote}
                  placeholder="写点备注"
                  placeholderTextColor={colors.textTertiary}
                  maxLength={255}
                />
                <Pressable
                  onPress={handlePinNote}
                  disabled={!canPinNote}
                  hitSlop={8}
                >
                  <Text
                    style={[
                      styles.pinText,
                      {
                        color: canPinNote
                          ? colors.primary
                          : colors.textTertiary,
                      },
                    ]}
                  >
                    ＋收藏
                  </Text>
                </Pressable>
              </View>

              {/* 常用备注 chips(★ 收藏 + 当前分类推荐);无候选时不渲染该行 */}
              {noteChips.length > 0 ? (
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  keyboardShouldPersistTaps="handled"
                  style={styles.chipRow}
                  contentContainerStyle={styles.chipRowContent}
                >
                  {noteChips.map((chip) => {
                    const isPinnedChip = chip.source === 'pinned';
                    return (
                      <Pressable
                        key={`${chip.source}:${chip.note}`}
                        style={[
                          styles.noteChip,
                          isPinnedChip
                            ? {
                                backgroundColor: colors.card,
                                borderColor: colors.primary,
                              }
                            : [
                                styles.noteChipAuto,
                                { backgroundColor: colors.chipSoftBg },
                              ],
                        ]}
                        onPress={() => setNote(chip.note)}
                        onLongPress={() => handleChipLongPress(chip)}
                      >
                        <Text
                          style={[
                            styles.noteChipText,
                            isPinnedChip ? styles.noteChipTextPinned : null,
                            {
                              color: isPinnedChip
                                ? colors.primary
                                : colors.chipSoftText,
                            },
                          ]}
                        >
                          {isPinnedChip ? `★ ${chip.note}` : chip.note}
                        </Text>
                      </Pressable>
                    );
                  })}
                </ScrollView>
              ) : null}

              {/* 日期 */}
              <Text style={[styles.label, { color: colors.textSecondary }]}>日期</Text>
              <Pressable
                style={[styles.dateRow, { backgroundColor: colors.surface }]}
                onPress={handleOpenDatePicker}
              >
                <Text style={[styles.dateText, { color: colors.textPrimary }]}>
                  {dateStr}
                </Text>
                <View style={styles.dateRight}>
                  <Text style={[styles.dateHint, { color: colors.primary }]}>选择 ›</Text>
                  {/* 「同上次」chip:无历史账单(last_date 为空)或接口失败时不渲染 */}
                  {lastDate ? (
                    lastDateActive ? (
                      <Pressable onPress={handleUseLastDate} hitSlop={6}>
                        <GradientView style={styles.dateChip}>
                          <Text style={styles.dateChipTextActive}>
                            {`✓ 同上次 ${formatMonthDay(lastDate)}`}
                          </Text>
                        </GradientView>
                      </Pressable>
                    ) : (
                      <Pressable
                        style={[
                          styles.dateChip,
                          styles.dateChipIdle,
                          {
                            backgroundColor: colors.card,
                            borderColor: colors.primary,
                          },
                        ]}
                        onPress={handleUseLastDate}
                        hitSlop={6}
                      >
                        <Text
                          style={[styles.dateChipText, { color: colors.primary }]}
                        >
                          {`同上次 ${formatMonthDay(lastDate)}`}
                        </Text>
                      </Pressable>
                    )
                  ) : null}
                </View>
              </Pressable>
              {showDatePicker && Platform.OS === 'ios' ? (
                <View style={[styles.pickerBox, { backgroundColor: colors.surface }]}>
                  <DateTimePicker
                    value={pickerDate}
                    mode="date"
                    display="spinner"
                    onChange={handleDateChange}
                  />
                  <Pressable onPress={handleIosConfirm} style={styles.pickerDone}>
                    <Text style={[styles.pickerDoneText, { color: colors.primary }]}>
                      完成
                    </Text>
                  </Pressable>
                </View>
              ) : null}
              {showDatePicker && Platform.OS === 'android' ? (
                // Android:选择器以原生 Dialog 弹出(独立于 RN Modal 层级,置于最上层),无需 portal。
                <DateTimePicker
                  value={pickerDate}
                  mode="date"
                  display="default"
                  onChange={handleDateChange}
                />
              ) : null}

              {/* 分类宫格 */}
              <Text style={[styles.label, { color: colors.textSecondary }]}>分类</Text>
              {categoriesLoading ? (
                <View style={styles.categoriesState}>
                  <ActivityIndicator color={colors.primary} />
                </View>
              ) : categoriesError ? (
                <View style={styles.categoriesState}>
                  <Text style={[styles.categoriesError, { color: colors.expense }]}>
                    {categoriesError}
                  </Text>
                  <Pressable onPress={() => void loadCategories()}>
                    <Text style={[styles.retryText, { color: colors.primary }]}>重试</Text>
                  </Pressable>
                </View>
              ) : (
                <View style={styles.grid}>
                  {categoryRows.map((row, rowIndex) => (
                    <View key={rowIndex} style={styles.catRow}>
                      {row.map((item) => {
                        const active = category === item.name;
                        return (
                          <Pressable
                            key={item.id}
                            style={[styles.cat, { backgroundColor: colors.surface }]}
                            onPress={() => setCategory(item.name)}
                          >
                            {active ? (
                              <GradientView style={styles.catActiveFill}>
                                <Text style={styles.catEmoji}>{item.icon}</Text>
                                <Text style={styles.catNameActive}>{item.name}</Text>
                              </GradientView>
                            ) : (
                              <>
                                <Text style={styles.catEmoji}>{item.icon}</Text>
                                <Text
                                  style={[
                                    styles.catName,
                                    { color: colors.textPrimary },
                                  ]}
                                >
                                  {item.name}
                                </Text>
                              </>
                            )}
                          </Pressable>
                        );
                      })}
                    </View>
                  ))}
                </View>
              )}

              {errorMessage ? (
                <View style={[styles.errorBox, { backgroundColor: colors.surface }]}>
                  <Text style={[styles.errorText, { color: colors.expense }]}>
                    {errorMessage}
                  </Text>
                </View>
              ) : null}

              <GradientButton
                title={submitting ? '提交中…' : buttonText}
                onPress={() => void handleConfirm()}
                disabled={submitting}
                style={styles.saveButton}
              />
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  backdrop: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
  sheetWrap: {
    justifyContent: 'flex-end',
  },
  sheet: {
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    paddingHorizontal: spacing.xl,
    paddingBottom: spacing.xl,
    paddingTop: spacing.sm,
    maxHeight: '92%',
  },
  handle: {
    alignSelf: 'center',
    width: 44,
    height: 5,
    borderRadius: 999,
    marginBottom: spacing.md,
  },
  head: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.md,
  },
  headTitle: {
    ...typography.heading,
  },
  closeButton: {
    borderRadius: 10,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  closeText: {
    fontSize: 12,
  },
  scrollContent: {
    paddingBottom: spacing.sm,
  },
  toggle: {
    flexDirection: 'row',
    alignSelf: 'flex-start',
    borderRadius: 999,
    padding: spacing.xs,
    gap: spacing.xs,
    marginBottom: spacing.lg,
  },
  seg: {
    borderRadius: 999,
    overflow: 'hidden',
  },
  segActive: {
    paddingHorizontal: 30,
    paddingVertical: spacing.sm,
    borderRadius: 999,
  },
  segText: {
    fontSize: 14,
    fontWeight: '600',
    paddingHorizontal: 30,
    paddingVertical: spacing.sm,
  },
  segTextActive: {
    fontSize: 14,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  label: {
    fontSize: 12,
    marginBottom: spacing.sm,
  },
  amountBox: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: radius.md,
    paddingHorizontal: spacing.lg,
    marginBottom: spacing.lg,
  },
  yuan: {
    fontSize: 22,
    fontWeight: '700',
    marginRight: spacing.sm,
  },
  amountInput: {
    flex: 1,
    fontSize: 42,
    fontWeight: '800',
    letterSpacing: 1,
    paddingVertical: spacing.sm,
  },
  noteRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    borderRadius: 14,
    paddingHorizontal: spacing.lg,
    marginBottom: spacing.lg,
  },
  noteInput: {
    flex: 1,
    paddingVertical: spacing.md,
    fontSize: 14,
  },
  pinText: {
    fontSize: 12,
    fontWeight: '700',
  },
  chipRow: {
    marginBottom: spacing.lg,
  },
  chipRowContent: {
    alignItems: 'center',
    gap: 6,
  },
  noteChip: {
    borderRadius: 999,
    borderWidth: 1.5,
    paddingHorizontal: 11,
    paddingVertical: 4,
  },
  /** 自动推荐 chip:无描边(浅紫底随主题变化,由内联样式给出)。 */
  noteChipAuto: {
    borderColor: 'transparent',
  },
  noteChipText: {
    fontSize: 12,
  },
  /** ★ 收藏 chip:文字加粗(颜色随主题变化,由内联样式给出)。 */
  noteChipTextPinned: {
    fontWeight: '700',
  },
  dateRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderRadius: 14,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    marginBottom: spacing.lg,
  },
  dateText: {
    fontSize: 14,
    fontWeight: '600',
  },
  dateRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  dateHint: {
    fontSize: 12,
    fontWeight: '700',
  },
  dateChip: {
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  dateChipIdle: {
    borderWidth: 1.5,
  },
  dateChipText: {
    fontSize: 12,
    fontWeight: '700',
  },
  dateChipTextActive: {
    fontSize: 12,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  pickerBox: {
    borderRadius: 14,
    marginBottom: spacing.lg,
    overflow: 'hidden',
  },
  pickerDone: {
    alignSelf: 'flex-end',
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.md,
  },
  pickerDoneText: {
    fontSize: 14,
    fontWeight: '700',
  },
  categoriesState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.xl,
    gap: spacing.sm,
    marginBottom: spacing.lg,
  },
  categoriesError: {
    fontSize: 13,
  },
  retryText: {
    fontSize: 14,
    fontWeight: '600',
  },
  grid: {
    gap: spacing.md,
    marginBottom: spacing.lg,
  },
  catRow: {
    flexDirection: 'row',
    gap: spacing.md,
  },
  cat: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 11,
    borderRadius: 16,
    gap: 6,
    overflow: 'hidden',
  },
  catActiveFill: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 11,
    gap: 6,
    borderRadius: 16,
  },
  catEmoji: {
    fontSize: 24,
  },
  catName: {
    fontSize: 12,
    fontWeight: '600',
  },
  catNameActive: {
    fontSize: 12,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  errorBox: {
    borderRadius: 12,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    marginBottom: spacing.lg,
  },
  errorText: {
    fontSize: 13,
  },
  saveButton: {
    marginTop: spacing.xs,
  },
});
