import DateTimePicker, {
  type DateTimePickerEvent,
} from '@react-native-community/datetimepicker';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
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
import { cacheKey, readCache, writeCache } from '../offline/cache';
import { useAuthStore } from '../store/authStore';
import { radius, spacing, typography, useSkin, useTheme } from '../theme';
import type {
  RecurringCreatePayload,
  RecurringFreq,
  RecurringRule,
  TransactionType,
} from '../types';
import { isValidDateString, toDateString } from '../utils/format';
import { describeFreq, FREQ_OPTIONS, WORKDAY_FREQ_OPTIONS } from '../utils/recurringText';
import ConfirmModal from './ConfirmModal';
import GradientButton from './GradientButton';
import GradientView from './GradientView';

interface Props {
  visible: boolean;
  /** 非空 = 编辑模式（预填 + 底部删除入口）。 */
  editingRule: RecurringRule | null;
  /** 离线时只读：保存 / 删除置灰并提示需要联网。 */
  online: boolean;
  onClose: () => void;
  /** 由父组件调用 create/update API；抛错时在弹层内展示。成功后由父组件关闭弹层。 */
  onSubmit: (payload: RecurringCreatePayload) => Promise<void>;
  /** 编辑模式的删除（父组件负责 ConfirmModal 之后的接口调用与刷新）。 */
  onDelete: (rule: RecurringRule) => Promise<void>;
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

/** YYYY-MM-DD -> 本地时区 Date（避免 new Date('YYYY-MM-DD') 的 UTC 偏移）。 */
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

const todayString = (): string => toDateString(new Date());

/**
 * 循环记账弹层：新建与编辑共用。
 * 字段：收支 / 金额 / 备注 / 分类宫格 / 频率 / 首次日期；
 * 频率的具体日子由「首次日期」锚定（11-01 → 每月 1 号）。
 */
export default function RecurringSheet({
  visible,
  editingRule,
  online,
  onClose,
  onSubmit,
  onDelete,
}: Props) {
  const colors = useTheme();
  const skin = useSkin();
  const insets = useSafeAreaInsets();

  const [type, setType] = useState<TransactionType>('expense');
  const [amountInput, setAmountInput] = useState('');
  const [category, setCategory] = useState('');
  const [note, setNote] = useState('');
  const [freq, setFreq] = useState<RecurringFreq>('monthly');
  const [dateStr, setDateStr] = useState(todayString);
  const [errorMessage, setErrorMessage] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [confirmDeleteVisible, setConfirmDeleteVisible] = useState(false);

  /** 日期选择器：Android 原生 Dialog，iOS 内嵌 spinner（与记账弹层一致）。 */
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [pickerDate, setPickerDate] = useState<Date>(() => new Date());

  const [categories, setCategories] = useState<CategoryItem[]>([]);
  const [categoriesLoading, setCategoriesLoading] = useState(false);
  const [categoriesError, setCategoriesError] = useState('');

  // 每次打开都按当前规则重置表单（新建则清空）。
  useEffect(() => {
    if (!visible) {
      return;
    }
    if (editingRule) {
      setType(editingRule.type);
      setAmountInput(String(editingRule.amount));
      setCategory(editingRule.category);
      setNote(editingRule.note ?? '');
      setFreq(editingRule.freq);
      setDateStr(
        isValidDateString(editingRule.start_date)
          ? editingRule.start_date
          : todayString(),
      );
    } else {
      setType('expense');
      setAmountInput('');
      setCategory('');
      setNote('');
      setFreq('monthly');
      setDateStr(todayString());
    }
    setErrorMessage('');
    setSubmitting(false);
    setDeleting(false);
    setShowDatePicker(false);
    setConfirmDeleteVisible(false);
  }, [visible, editingRule]);

  /** 分类：先渲染缓存（bk.cache.v1.<uid>.categories），联网后再用服务端结果覆盖。 */
  const loadCategories = useCallback(async () => {
    setCategoriesLoading(true);
    setCategoriesError('');
    const userId = useAuthStore.getState().user?.id;
    const key = userId ? cacheKey(userId, 'categories') : null;
    let cached: CategoryItem[] | null = null;
    if (key) {
      cached = await readCache<CategoryItem[]>(key);
      if (cached && cached.length > 0) {
        setCategories(cached);
      }
    }

    if (!online) {
      if (!cached || cached.length === 0) {
        setCategoriesError('离线模式：还没有分类缓存，请联网后重试');
      }
      setCategoriesLoading(false);
      return;
    }

    try {
      const list = await fetchCategories();
      setCategories(list);
      if (key) {
        writeCache(key, list).catch(() => undefined);
      }
    } catch (error) {
      if (!cached || cached.length === 0) {
        setCategoriesError(extractErrorMessage(error, '分类加载失败'));
      }
    } finally {
      setCategoriesLoading(false);
    }
  }, [online]);

  useEffect(() => {
    if (visible) {
      loadCategories().catch(() => undefined);
    }
  }, [visible, loadCategories]);

  const activeCategories = useMemo(
    () => categories.filter((item) => item.type === type),
    [categories, type],
  );

  // 切换收支类型后，若当前分类不属于该类型，自动选中第一个。
  useEffect(() => {
    if (
      activeCategories.length > 0 &&
      !activeCategories.some((item) => item.name === category)
    ) {
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

  const title = editingRule ? '编辑循环记账' : '新建循环记账';
  const freqPreview = describeFreq({ freq, start_date: dateStr });

  /** 频率 chip：两组（常规 / 工作日）共用，选中态互斥。 */
  const renderFreqChip = (key: RecurringFreq, label: string) => {
    const active = freq === key;
    return (
      <Pressable
        key={key}
        onPress={() => setFreq(key)}
        style={[
          styles.freqChip,
          active
            ? { backgroundColor: colors.chipSoftBg, borderColor: colors.primary }
            : [styles.freqChipIdle, { backgroundColor: colors.surface }],
        ]}
      >
        <Text
          numberOfLines={1}
          style={[
            styles.freqText,
            { color: active ? colors.chipSoftText : colors.textSecondary },
          ]}
        >
          {label}
        </Text>
      </Pressable>
    );
  };

  const handleOpenDatePicker = () => {
    setPickerDate(parseDateStr(dateStr));
    setShowDatePicker(true);
  };

  const handleDateChange = (event: DateTimePickerEvent, date?: Date) => {
    if (Platform.OS === 'android') {
      // Android：原生 Dialog 选择/取消后自动关闭，这里同步收起。
      setShowDatePicker(false);
      if (event.type === 'set' && date) {
        setDateStr(toDateString(date));
      }
      return;
    }
    // iOS：spinner 滚动时只更新暂存值，点「完成」后回填。
    if (date) {
      setPickerDate(date);
    }
  };

  const handleIosConfirm = () => {
    setDateStr(toDateString(pickerDate));
    setShowDatePicker(false);
  };

  const handleSave = async () => {
    if (submitting) {
      return;
    }
    if (!online) {
      setErrorMessage('离线状态无法保存，请联网后重试');
      return;
    }
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
      setErrorMessage('请选择有效的首次日期');
      return;
    }

    setErrorMessage('');
    setSubmitting(true);
    try {
      await onSubmit({
        amount: Number(amount.toFixed(2)),
        type,
        category,
        note: note.trim() || undefined,
        freq,
        start_date: dateStr,
      });
    } catch (error) {
      setErrorMessage(extractErrorMessage(error, '保存失败，请重试'));
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async () => {
    if (!editingRule || deleting) {
      return;
    }
    if (!online) {
      setConfirmDeleteVisible(false);
      setErrorMessage('离线状态无法删除，请联网后重试');
      return;
    }
    setDeleting(true);
    setErrorMessage('');
    try {
      await onDelete(editingRule);
      setConfirmDeleteVisible(false);
      onClose();
    } catch (error) {
      setConfirmDeleteVisible(false);
      setErrorMessage(extractErrorMessage(error, '删除失败'));
    } finally {
      setDeleting(false);
    }
  };

  return (
    <>
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
            behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          >
            <View
              style={[
                styles.sheet,
                skin.surfaces.sheet,
                {
                  paddingBottom: spacing.xl + Math.max(insets.bottom, spacing.lg),
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

              {!online ? (
                <View style={[styles.noticeBox, { backgroundColor: colors.surface }]}>
                  <Text style={[styles.noticeText, { color: colors.textSecondary }]}>
                    离线模式：循环规则需要联网才能保存或删除
                  </Text>
                </View>
              ) : null}

              <ScrollView
                style={styles.sheetScroll}
                keyboardShouldPersistTaps="handled"
                contentContainerStyle={styles.scrollContent}
              >
                {/* 收支切换 */}
                <View style={[styles.toggle, { backgroundColor: colors.surface }]}>
                  <Pressable style={styles.seg} onPress={() => setType('expense')}>
                    {type === 'expense' ? (
                      <GradientView style={styles.segActive}>
                        <Text style={[styles.segTextActive, { color: colors.onAccent }]}>
                          支出
                        </Text>
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
                        <Text style={[styles.segTextActive, { color: colors.onAccent }]}>
                          收入
                        </Text>
                      </GradientView>
                    ) : (
                      <Text style={[styles.segText, { color: colors.textSecondary }]}>
                        收入
                      </Text>
                    )}
                  </Pressable>
                </View>

                {/* 金额 */}
                <Text style={[styles.label, { color: colors.textSecondary }]}>
                  金额
                </Text>
                <View style={[styles.amountBox, skin.surfaces.input]}>
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
                <Text style={[styles.label, { color: colors.textSecondary }]}>
                  备注(可选)
                </Text>
                <View style={[styles.inputWrap, skin.surfaces.input]}>
                  <TextInput
                    style={[styles.noteInput, { color: colors.textPrimary }]}
                    value={note}
                    onChangeText={setNote}
                    placeholder="例如:房租"
                    placeholderTextColor={colors.textTertiary}
                    maxLength={255}
                  />
                </View>

                {/* 分类宫格 */}
                <Text style={[styles.label, { color: colors.textSecondary }]}>
                  分类
                </Text>
                {categoriesLoading && categories.length === 0 ? (
                  <View style={styles.categoriesState}>
                    <ActivityIndicator color={colors.primary} />
                  </View>
                ) : categoriesError ? (
                  <View style={styles.categoriesState}>
                    <Text style={[styles.categoriesError, { color: colors.expense }]}>
                      {categoriesError}
                    </Text>
                    <Pressable onPress={() => loadCategories().catch(() => undefined)}>
                      <Text style={[styles.retryText, { color: colors.primary }]}>
                        重试
                      </Text>
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
                              style={[styles.cat, skin.surfaces.input]}
                              onPress={() => setCategory(item.name)}
                            >
                              {/* 渐变只做背景层：图标/文字留在正常流里，
                                  否则独占一行的分类（如「旅游」）没有兄弟项撑高度，
                                  选中后会塌成一条细线（2.5.2 的坑）。 */}
                              {active ? (
                                <GradientView style={styles.catActiveFill} />
                              ) : null}
                              <Text style={styles.catEmoji}>{item.icon}</Text>
                              <Text
                                style={[
                                  styles.catName,
                                  {
                                    color: active
                                      ? colors.onAccent
                                      : colors.textPrimary,
                                  },
                                ]}
                              >
                                {item.name}
                              </Text>
                            </Pressable>
                          );
                        })}
                        {/* 末行不足 4 个时补占位，保证每个分类固定 1/4 宽度。 */}
                        {Array.from({ length: 4 - row.length }).map((_, index) => (
                          <View key={`spacer-${index}`} style={styles.catSpacer} />
                        ))}
                      </View>
                    ))}
                  </View>
                )}

                {/* 重复频率：常规 + 工作日类（工作日=周一至周五，不含法定节假日） */}
                <Text style={[styles.label, { color: colors.textSecondary }]}>
                  重复
                </Text>
                <View style={styles.freqRow}>
                  {FREQ_OPTIONS.map((option) => renderFreqChip(option.key, option.label))}
                </View>
                <View style={[styles.freqRow, styles.freqRowTight]}>
                  {WORKDAY_FREQ_OPTIONS.map((option) =>
                    renderFreqChip(option.key, option.label),
                  )}
                </View>
                <Text style={[styles.freqHint, { color: colors.textTertiary }]}>
                  工作日按周一至周五计（不含法定节假日）；「第 N 个工作日」的 N 取自首次日期
                </Text>

                {/* 首次日期：频率的具体日子由它锚定 */}
                <Text style={[styles.label, { color: colors.textSecondary }]}>
                  首次日期
                </Text>
                <Pressable
                  style={[styles.dateRow, skin.surfaces.input]}
                  onPress={handleOpenDatePicker}
                >
                  <Text style={[styles.dateText, { color: colors.textPrimary }]}>
                    {dateStr}
                  </Text>
                  <View style={styles.dateRight}>
                    <Text style={[styles.dateHint, { color: colors.primary }]}>
                      {freqPreview}
                    </Text>
                    <Text style={[styles.dateChevron, { color: colors.textTertiary }]}>
                      ›
                    </Text>
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
                  // Android：原生 Dialog 独立于 RN Modal 层级，无需 portal。
                  <DateTimePicker
                    value={pickerDate}
                    mode="date"
                    display="default"
                    onChange={handleDateChange}
                  />
                ) : null}

                <View
                  style={[
                    styles.explain,
                    { borderColor: colors.border, backgroundColor: colors.surface },
                  ]}
                >
                  <Text style={[styles.explainText, { color: colors.textTertiary }]}>
                    到期当天自动生成真实账单，可正常编辑或删除；暂停期间不生成，
                    删规则不删历史账单。
                  </Text>
                </View>

                {errorMessage ? (
                  <View style={[styles.errorBox, { backgroundColor: colors.surface }]}>
                    <Text style={[styles.errorText, { color: colors.expense }]}>
                      {errorMessage}
                    </Text>
                  </View>
                ) : null}

                <GradientButton
                  title={submitting ? '保存中…' : '保存'}
                  onPress={() => {
                    handleSave();
                  }}
                  disabled={submitting || !online}
                  style={styles.saveButton}
                />

                {editingRule ? (
                  <Pressable
                    onPress={() => {
                      if (!online) {
                        setErrorMessage('离线状态无法删除，请联网后重试');
                        return;
                      }
                      setConfirmDeleteVisible(true);
                    }}
                    disabled={deleting}
                    style={({ pressed }) => [
                      styles.deleteButton,
                      { backgroundColor: colors.surface },
                      pressed && styles.pressed,
                    ]}
                  >
                    <Text style={[styles.deleteText, { color: colors.expense }]}>
                      {deleting ? '删除中…' : '删除规则'}
                    </Text>
                  </Pressable>
                ) : null}
              </ScrollView>
            </View>
          </KeyboardAvoidingView>
        </View>
      </Modal>

      <ConfirmModal
        visible={confirmDeleteVisible}
        title="删除循环规则"
        message={`确定删除「${
          editingRule?.note?.trim() || editingRule?.category || ''
        }」吗？删除后不再自动生成，已生成的账单会保留。`}
        confirmText="删除"
        loading={deleting}
        onConfirm={() => {
          handleDelete();
        }}
        onCancel={() => setConfirmDeleteVisible(false)}
      />
    </>
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
    flex: 1,
    justifyContent: 'flex-end',
  },
  sheet: {
    borderTopLeftRadius: radius.xl + 4,
    borderTopRightRadius: radius.xl + 4,
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.sm,
    maxHeight: '92%',
    flexShrink: 1,
  },
  sheetScroll: {
    flexShrink: 1,
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
  noticeBox: {
    borderRadius: 10,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    marginBottom: spacing.md,
  },
  noticeText: {
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
  inputWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: radius.md,
    paddingHorizontal: spacing.lg,
    marginBottom: spacing.lg,
  },
  noteInput: {
    flex: 1,
    paddingVertical: spacing.md,
    fontSize: 14,
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
    borderRadius: 16,
  },
  catSpacer: {
    flex: 1,
  },
  catEmoji: {
    fontSize: 24,
  },
  catName: {
    fontSize: 12,
    fontWeight: '600',
  },
  freqRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginBottom: spacing.lg,
  },
  /** 第二行（工作日类）与上一行贴近，底部留给提示文案。 */
  freqRowTight: {
    marginTop: -spacing.sm,
    marginBottom: spacing.sm,
  },
  freqHint: {
    fontSize: 10.5,
    lineHeight: 15,
    marginBottom: spacing.lg,
  },
  freqChip: {
    flex: 1,
    alignItems: 'center',
    borderRadius: radius.md,
    borderWidth: 1.5,
    paddingVertical: spacing.sm,
    paddingHorizontal: 2,
  },
  freqChipIdle: {
    borderColor: 'transparent',
  },
  freqText: {
    fontSize: 13,
    fontWeight: '700',
  },
  dateRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderRadius: radius.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    marginBottom: spacing.md,
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
  dateChevron: {
    fontSize: 14,
    fontWeight: '700',
  },
  pickerBox: {
    borderRadius: radius.md,
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
  explain: {
    borderWidth: 1,
    borderStyle: 'dashed',
    borderRadius: 10,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    marginBottom: spacing.md,
  },
  explainText: {
    fontSize: 11,
    lineHeight: 16,
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
  pressed: {
    opacity: 0.7,
  },
});
