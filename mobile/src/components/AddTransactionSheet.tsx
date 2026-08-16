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

/**
 * 记账弹层(FR-02):底部弹出 Modal。
 * 金额大输入 + 收入/支出切换 + 分类宫格(按 type 过滤)+ 日期 + 备注;
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
                              <GradientView
                                style={[
                                  styles.catActive,
                                  { borderColor: colors.primary },
                                ]}
                              >
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

              {/* 日期 */}
              <Text style={[styles.label, { color: colors.textSecondary }]}>日期</Text>
              <View style={styles.dateRow}>
                <TextInput
                  style={[
                    styles.dateInput,
                    { backgroundColor: colors.surface, color: colors.textPrimary },
                  ]}
                  value={dateStr}
                  onChangeText={setDateStr}
                  placeholder="YYYY-MM-DD"
                  placeholderTextColor={colors.textTertiary}
                  keyboardType="numbers-and-punctuation"
                  maxLength={10}
                />
                <Pressable
                  style={[styles.dateChip, { backgroundColor: colors.surface }]}
                  onPress={() => setDateStr(quickDate(0))}
                >
                  <Text style={[styles.dateChipText, { color: colors.primary }]}>今天</Text>
                </Pressable>
                <Pressable
                  style={[styles.dateChip, { backgroundColor: colors.surface }]}
                  onPress={() => setDateStr(quickDate(-1))}
                >
                  <Text style={[styles.dateChipText, { color: colors.primary }]}>昨天</Text>
                </Pressable>
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
  },
  catActive: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 11,
    borderRadius: 16,
    gap: 6,
    borderWidth: 1.5,
    width: '100%',
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
  dateRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginBottom: spacing.lg,
  },
  dateInput: {
    flex: 1,
    borderRadius: 14,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    fontSize: 14,
  },
  dateChip: {
    borderRadius: 999,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  dateChipText: {
    fontSize: 12,
    fontWeight: '700',
  },
  noteInput: {
    borderRadius: 14,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    fontSize: 14,
    marginBottom: spacing.lg,
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
