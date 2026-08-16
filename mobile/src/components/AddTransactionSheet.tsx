import React, { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
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
import { radius, spacing, typography, useTheme } from '../theme';
import type { Transaction, TransactionCreatePayload, TransactionType } from '../types';
import { isValidDateString, toDateString } from '../utils/format';
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

/**
 * 记账弹层:底部弹出 Modal。
 * 收支切换 + 金额大输入 + 备注 + 日期(原生选择器)+ 分类宫格(按 type 过滤);
 * 编辑时预填,新增/编辑共用。
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
              <TextInput
                style={[
                  styles.noteInput,
                  { backgroundColor: colors.surface, color: colors.textPrimary },
                ]}
                value={note}
                onChangeText={setNote}
                placeholder="写点备注"
                placeholderTextColor={colors.textTertiary}
                maxLength={255}
              />

              {/* 日期 */}
              <Text style={[styles.label, { color: colors.textSecondary }]}>日期</Text>
              <Pressable
                style={[styles.dateRow, { backgroundColor: colors.surface }]}
                onPress={handleOpenDatePicker}
              >
                <Text style={[styles.dateText, { color: colors.textPrimary }]}>
                  {dateStr}
                </Text>
                <Text style={[styles.dateHint, { color: colors.primary }]}>选择 ›</Text>
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
  noteInput: {
    borderRadius: 14,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    fontSize: 14,
    marginBottom: spacing.lg,
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
  dateHint: {
    fontSize: 12,
    fontWeight: '700',
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
