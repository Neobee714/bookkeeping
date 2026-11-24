import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import React, { useMemo, useState } from 'react';
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
import {
  commitImport,
  previewImport,
  type ImportCommitResult,
  type ImportCommitRow,
  type ImportLearnRule,
  type ImportPreview,
  type ImportPreviewRow,
} from '../api/imports';
import GradientButton from '../components/GradientButton';
import ScreenHeader from '../components/ScreenHeader';
import type { RootStackParamList } from '../navigation/types';
import { pickBillFile, type PickedBillFile } from '../native/BillPicker';
import { radius, spacing, typography, useSkin, useTheme } from '../theme';

type Props = NativeStackScreenProps<RootStackParamList, 'Import'>;

/** idle 选文件 → preview 核对 → done 结果。 */
type Phase = 'idle' | 'preview' | 'done';

/** 单行的本地编辑态：勾选、分类、是否记住商家规则。 */
interface RowDraft {
  checked: boolean;
  category: string;
  learn: boolean;
}

const formatMoney = (value: string | number): string => {
  const parsed = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(parsed)) {
    return String(value);
  }
  return parsed.toLocaleString('zh-CN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
};

const formatFileSize = (size: number): string => {
  if (size >= 1024 * 1024) {
    return `${(size / (1024 * 1024)).toFixed(1)} MB`;
  }
  if (size >= 1024) {
    return `${Math.max(1, Math.round(size / 1024))} KB`;
  }
  return `${size} B`;
};

/** 已入过账的行默认不勾选，避免重复导入。 */
const buildDrafts = (rows: ImportPreviewRow[]): Record<string, RowDraft> => {
  const next: Record<string, RowDraft> = {};
  rows.forEach((row) => {
    next[row.client_id] = {
      checked: !row.existing,
      category: row.category,
      learn: false,
    };
  });
  return next;
};

/**
 * 账单导入（v0.23）：
 * 选文件 → 服务端识别预览 → 勾选 / 改分类 / 记住商家规则 → 提交入账。
 * 预览不落库；重复账单由后端按 client_id 去重。
 */
export default function ImportScreen({ navigation }: Props) {
  const colors = useTheme();
  const skin = useSkin();

  const [phase, setPhase] = useState<Phase>('idle');
  const [passwordOpen, setPasswordOpen] = useState(false);
  const [password, setPassword] = useState('');
  const [picking, setPicking] = useState(false);
  const [recognizing, setRecognizing] = useState(false);
  const [committing, setCommitting] = useState(false);
  const [file, setFile] = useState<PickedBillFile | null>(null);
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [drafts, setDrafts] = useState<Record<string, RowDraft>>({});
  const [result, setResult] = useState<ImportCommitResult | null>(null);
  const [error, setError] = useState('');

  // 分类选择弹层：editingId 非空即打开。
  const [editingId, setEditingId] = useState<string | null>(null);
  const [pendingCategory, setPendingCategory] = useState('');
  const [pendingLearn, setPendingLearn] = useState(false);

  const rows = useMemo(() => preview?.rows ?? [], [preview]);

  const selectedRows = useMemo(
    () => rows.filter((row) => drafts[row.client_id]?.checked),
    [rows, drafts],
  );

  const selectedTotal = useMemo(
    () =>
      selectedRows.reduce((sum, row) => sum + Number(row.amount || 0), 0),
    [selectedRows],
  );

  /** 只对勾选且勾了「记住」的行生成规则：有店铺按商家记，平台单按渠道记，同键后者覆盖前者。 */
  const learnRules = useMemo<ImportLearnRule[]>(() => {
    const map = new Map<string, ImportLearnRule>();
    rows.forEach((row) => {
      const draft = drafts[row.client_id];
      if (!draft?.checked || !draft.learn || !draft.category) {
        return;
      }
      const merchant = (row.merchant ?? '').trim();
      const channel = (row.channel ?? '').trim();
      if (merchant) {
        map.set(`merchant:${merchant}`, {
          merchant,
          category: draft.category,
        });
      } else if (channel) {
        map.set(`channel:${channel}`, {
          channel,
          category: draft.category,
        });
      }
    });
    return Array.from(map.values());
  }, [rows, drafts]);

  const categoryIcons = useMemo(() => {
    const map = new Map<string, string>();
    preview?.categories.expense.forEach((item) => map.set(item.name, item.icon));
    preview?.categories.income.forEach((item) => map.set(item.name, item.icon));
    return map;
  }, [preview]);

  const editingRow = rows.find((row) => row.client_id === editingId) ?? null;
  const categoryOptions = editingRow
    ? preview?.categories[editingRow.type] ?? []
    : [];

  const resetToIdle = () => {
    setPhase('idle');
    setFile(null);
    setPreview(null);
    setDrafts({});
    setResult(null);
    setError('');
    setCommitting(false);
  };

  const handleBack = () => {
    if (phase === 'preview') {
      resetToIdle();
      return;
    }
    navigation.goBack();
  };

  const handlePick = async () => {
    if (picking || recognizing) {
      return;
    }
    setError('');

    let picked: PickedBillFile | null = null;
    setPicking(true);
    try {
      picked = await pickBillFile();
    } catch (pickError) {
      const code = (pickError as { code?: string } | null)?.code;
      // 用户取消不算错误。
      if (code !== 'E_CANCELLED') {
        setError(
          extractErrorMessage(pickError, '无法打开文件选择器，请稍后重试'),
        );
      }
      return;
    } finally {
      setPicking(false);
    }

    setFile(picked);
    setRecognizing(true);
    try {
      const recognized = await previewImport(
        picked,
        password.trim() || undefined,
      );
      setPreview(recognized);
      setDrafts(buildDrafts(recognized.rows));
      setPhase('preview');
    } catch (previewError) {
      setError(
        extractErrorMessage(
          previewError,
          '账单识别失败，请确认文件是微信 / 支付宝的原始账单',
        ),
      );
    } finally {
      setRecognizing(false);
    }
  };

  const toggleRow = (clientId: string) => {
    setDrafts((previous) => {
      const draft = previous[clientId];
      if (!draft) {
        return previous;
      }
      return {
        ...previous,
        [clientId]: { ...draft, checked: !draft.checked },
      };
    });
  };

  const openCategoryPicker = (row: ImportPreviewRow) => {
    const draft = drafts[row.client_id];
    setEditingId(row.client_id);
    setPendingCategory(draft?.category ?? row.category);
    setPendingLearn(draft?.learn ?? false);
  };

  const closeCategoryPicker = () => {
    setEditingId(null);
    setPendingCategory('');
    setPendingLearn(false);
  };

  const confirmCategory = () => {
    if (!editingId || !pendingCategory) {
      return;
    }
    const clientId = editingId;
    setDrafts((previous) => {
      const draft = previous[clientId];
      if (!draft) {
        return previous;
      }
      return {
        ...previous,
        [clientId]: { ...draft, category: pendingCategory, learn: pendingLearn },
      };
    });
    closeCategoryPicker();
  };

  const handleCommit = async () => {
    if (!preview || committing || selectedRows.length === 0) {
      return;
    }
    const payloadRows: ImportCommitRow[] = selectedRows.map((row) => {
      const channel = (row.channel ?? '').trim();
      return {
        client_id: row.client_id,
        date: row.date,
        amount: row.amount,
        type: row.type,
        category: drafts[row.client_id]?.category ?? row.category,
        merchant: row.merchant,
        ...(channel ? { channel } : {}),
        note: row.note,
      };
    });

    setCommitting(true);
    setError('');
    try {
      const committed = await commitImport({
        source: preview.source,
        rows: payloadRows,
        learn: learnRules,
      });
      setResult(committed);
      setPhase('done');
    } catch (commitError) {
      setError(extractErrorMessage(commitError, '导入失败，请稍后重试'));
    } finally {
      setCommitting(false);
    }
  };

  const rangeText =
    preview?.summary.range && preview.summary.range.length === 2
      ? `${preview.summary.range[0]} ~ ${preview.summary.range[1]}`
      : '—';

  return (
    <SafeAreaView
      style={[styles.safe, { backgroundColor: colors.background }]}
      edges={['top', 'bottom']}
    >
      <ScreenHeader
        title="导入账单"
        onBack={handleBack}
        right={
          phase === 'preview' ? (
            <Pressable
              onPress={resetToIdle}
              hitSlop={8}
              testID="import-reselect"
              style={styles.headerActionWrap}
            >
              <Text style={[styles.headerAction, { color: colors.primary }]}>
                重选
              </Text>
            </Pressable>
          ) : undefined
        }
      />

      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'android' ? 'height' : 'padding'}
      >
        {phase === 'preview' && preview ? (
          <>
            <ScrollView
              style={styles.flex}
              contentContainerStyle={styles.content}
              showsVerticalScrollIndicator={false}
            >
              {/* 汇总卡 */}
              <View style={[styles.card, skin.surfaces.card]}>
                <View style={styles.summaryHead}>
                  <Text
                    style={[styles.summaryCount, { color: colors.textPrimary }]}
                  >
                    可导入 {preview.summary.importable} 笔
                  </Text>
                  <Text
                    style={[styles.summarySource, { color: colors.textTertiary }]}
                  >
                    {preview.source === 'wechat' ? '微信账单' : '支付宝账单'}
                  </Text>
                </View>

                <View style={styles.summaryStats}>
                  <SummaryRow
                    label="合计金额"
                    value={`¥${formatMoney(
                      Number(preview.summary.expense_amount || 0) +
                        Number(preview.summary.income_amount || 0),
                    )}`}
                  />
                  <SummaryRow
                    label="支出"
                    value={`¥${formatMoney(preview.summary.expense_amount)} · ${
                      preview.summary.expense_count
                    } 笔`}
                  />
                  <SummaryRow
                    label="收入"
                    value={`¥${formatMoney(preview.summary.income_amount)} · ${
                      preview.summary.income_count
                    } 笔`}
                  />
                  {preview.summary.transfer_count ? (
                    <SummaryRow
                      label="转账/提现"
                      value={`¥${formatMoney(
                        preview.summary.transfer_amount || '0',
                      )} · ${preview.summary.transfer_count} 笔`}
                    />
                  ) : null}
                  <SummaryRow label="时间范围" value={rangeText} />
                  {preview.summary.account ? (
                    <SummaryRow label="账单账户" value={preview.summary.account} />
                  ) : null}
                </View>

                {preview.summary.skipped > 0 ? (
                  <>
                    <Text
                      style={[styles.skipTitle, { color: colors.textTertiary }]}
                    >
                      已跳过 {preview.summary.skipped} 笔
                    </Text>
                    <View style={styles.reasonWrap}>
                      {preview.summary.skipped_reasons.map((item) => (
                        <View
                          key={item.reason}
                          style={[
                            styles.reasonChip,
                            { backgroundColor: colors.chipSoftBg },
                          ]}
                        >
                          <Text
                            style={[
                              styles.reasonText,
                              { color: colors.chipSoftText },
                            ]}
                          >
                            {`${item.reason} · ${item.count} 笔 ¥${formatMoney(
                              item.amount,
                            )}`}
                          </Text>
                        </View>
                      ))}
                    </View>
                  </>
                ) : null}

                <Text style={[styles.cardHint, { color: colors.textTertiary }]}>
                  带「已导入」的账单默认不勾选；点分类可以改，改完可记住这个商家 / 平台。
                </Text>
              </View>

              {error ? (
                <View
                  style={[styles.errorBox, { backgroundColor: colors.surface }]}
                >
                  <Text style={[styles.errorText, { color: colors.expense }]}>
                    {error}
                  </Text>
                </View>
              ) : null}

              {/* 逐行核对 */}
              {rows.map((row) => {
                const draft = drafts[row.client_id];
                const checked = draft?.checked ?? false;
                const category = draft?.category ?? row.category;
                const icon = categoryIcons.get(category) ?? '🏷️';
                const channelValue = (row.channel ?? '').trim();
                return (
                  <Pressable
                    key={row.client_id}
                    testID={`import-row-${row.client_id}`}
                    onPress={() => toggleRow(row.client_id)}
                    style={[styles.rowCard, skin.surfaces.card]}
                  >
                    <View
                      style={[
                        styles.checkbox,
                        checked
                          ? {
                              backgroundColor: colors.primary,
                              borderColor: colors.primary,
                            }
                          : { borderColor: colors.border, backgroundColor: colors.card },
                      ]}
                    >
                      {checked ? (
                        <Text
                          style={[styles.checkMark, { color: colors.onAccent }]}
                        >
                          ✓
                        </Text>
                      ) : null}
                    </View>

                    <View style={styles.rowBody}>
                      <View style={styles.rowTop}>
                        <Text
                          numberOfLines={1}
                          style={[
                            styles.rowMerchant,
                            { color: colors.textPrimary },
                            checked ? undefined : styles.dimmed,
                          ]}
                        >
                          {row.merchant || channelValue || '未注明商家'}
                        </Text>
                        <Text
                          style={[
                            styles.rowAmount,
                            {
                              color:
                                row.type === 'income'
                                  ? colors.income
                                  : colors.textPrimary,
                            },
                            checked ? undefined : styles.dimmed,
                          ]}
                        >
                          {row.type === 'income' ? '+' : '-'}¥
                          {formatMoney(row.amount)}
                        </Text>
                      </View>

                      <View style={styles.rowMeta}>
                        <Text
                          style={[
                            styles.rowDate,
                            { color: colors.textTertiary },
                          ]}
                        >
                          {row.date}
                        </Text>

                        {channelValue ? (
                          <View
                            testID={`channel-chip-${row.client_id}`}
                            style={[
                              styles.channelChip,
                              { backgroundColor: colors.chipSoftBg },
                            ]}
                          >
                            <Text
                              numberOfLines={1}
                              ellipsizeMode="tail"
                              style={[
                                styles.channelChipText,
                                { color: colors.chipSoftText },
                              ]}
                            >
                              {`📱 ${channelValue}`}
                            </Text>
                          </View>
                        ) : null}

                        <Pressable
                          testID={`category-chip-${row.client_id}`}
                          onPress={(event) => {
                            event.stopPropagation();
                            openCategoryPicker(row);
                          }}
                          style={[
                            styles.categoryChip,
                            { backgroundColor: colors.chipSoftBg },
                          ]}
                        >
                          <Text
                            style={[
                              styles.categoryText,
                              { color: colors.chipSoftText },
                            ]}
                          >
                            {`${icon} ${category || '未分类'} ›`}
                          </Text>
                        </Pressable>

                        {row.existing ? (
                          <View
                            style={[
                              styles.badge,
                              { backgroundColor: colors.surface },
                            ]}
                          >
                            <Text
                              style={[
                                styles.badgeText,
                                { color: colors.textTertiary },
                              ]}
                            >
                              已导入
                            </Text>
                          </View>
                        ) : null}

                        {draft?.learn ? (
                          <Text
                            style={[styles.learnedTag, { color: colors.primary }]}
                          >
                            记住
                          </Text>
                        ) : null}
                      </View>

                      {row.note ? (
                        <Text
                          numberOfLines={1}
                          style={[styles.rowNote, { color: colors.textTertiary }]}
                        >
                          {row.note}
                        </Text>
                      ) : null}
                    </View>
                  </Pressable>
                );
              })}
            </ScrollView>

            {/* 底部确认 */}
            <View
              style={[
                styles.footer,
                {
                  backgroundColor: colors.background,
                  borderTopColor: colors.border,
                },
              ]}
            >
              <Pressable
                testID="import-commit"
                onPress={() => {
                  handleCommit().catch(() => undefined);
                }}
                disabled={committing || selectedRows.length === 0}
                style={({ pressed }) => [
                  styles.primaryButton,
                  {
                    backgroundColor: colors.primary,
                    opacity:
                      committing || selectedRows.length === 0
                        ? 0.45
                        : pressed
                          ? 0.8
                          : 1,
                  },
                ]}
              >
                <Text style={[styles.primaryText, { color: colors.onAccent }]}>
                  {committing
                    ? '正在导入…'
                    : `确认导入 ${selectedRows.length} 笔`}
                </Text>
                <Text style={[styles.primaryHint, { color: colors.onAccent }]}>
                  {`合计 ¥${formatMoney(selectedTotal)}${
                    learnRules.length > 0
                      ? ` · 记住 ${learnRules.length} 条分类规则`
                      : ''
                  }`}
                </Text>
              </Pressable>
            </View>
          </>
        ) : phase === 'done' && result ? (
          <ScrollView
            contentContainerStyle={styles.content}
            showsVerticalScrollIndicator={false}
          >
            <View style={styles.doneHead}>
              <Text style={styles.doneEmoji}>🎉</Text>
              <Text style={[styles.doneTitle, { color: colors.textPrimary }]}>
                导入完成
              </Text>
              <Text style={[styles.doneText, { color: colors.textSecondary }]}>
                账单已按原日期入账，图表和预算会同步更新。
              </Text>
            </View>

            <View style={[styles.card, skin.surfaces.card]}>
              <ResultRow
                label="成功导入"
                value={`${result.imported} 笔`}
                strong
              />
              <View
                style={[styles.divider, { backgroundColor: colors.border }]}
              />
              <ResultRow label="重复跳过" value={`${result.duplicated} 笔`} />
              <View
                style={[styles.divider, { backgroundColor: colors.border }]}
              />
              <ResultRow
                label="记住商家分类"
                value={`${result.learned} 条`}
              />
              {result.invalid > 0 ? (
                <>
                  <View
                    style={[styles.divider, { backgroundColor: colors.border }]}
                  />
                  <ResultRow label="无法识别" value={`${result.invalid} 笔`} />
                </>
              ) : null}
            </View>

            <GradientButton
              testID="import-done"
              title="完成"
              onPress={() => navigation.goBack()}
            />
            <Pressable
              testID="import-again"
              onPress={resetToIdle}
              style={styles.againButton}
            >
              <Text style={[styles.againText, { color: colors.primary }]}>
                再导入一份
              </Text>
            </Pressable>
          </ScrollView>
        ) : (
          <ScrollView
            contentContainerStyle={styles.content}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
          >
            <View style={[styles.heroCard, skin.surfaces.card]}>
              <Text style={styles.heroEmoji}>📥</Text>
              <Text style={[styles.heroTitle, { color: colors.textPrimary }]}>
                把账单一次搬进来
              </Text>
              <Text style={[styles.heroText, { color: colors.textSecondary }]}>
                支持微信支付账单与支付宝账单，zip / xlsx / csv 都可以。先预览核对，确认后再入账，重复的会自动跳过。
              </Text>
            </View>

            <View style={[styles.card, skin.surfaces.card]}>
              <Pressable
                testID="import-password-toggle"
                onPress={() => setPasswordOpen((open) => !open)}
                style={styles.passwordToggle}
              >
                <Text
                  style={[
                    styles.passwordToggleText,
                    { color: colors.textSecondary },
                  ]}
                >
                  zip 密码{password ? '（已填写）' : '（可选）'}
                </Text>
                <Text
                  style={[styles.passwordChevron, { color: colors.textTertiary }]}
                >
                  {passwordOpen ? '收起' : '展开'}
                </Text>
              </Pressable>

              {passwordOpen ? (
                <TextInput
                  testID="import-password-input"
                  style={[
                    styles.input,
                    skin.surfaces.input,
                    { color: colors.textPrimary },
                  ]}
                  value={password}
                  onChangeText={setPassword}
                  placeholder="没有密码就留空"
                  placeholderTextColor={colors.textTertiary}
                  secureTextEntry
                  autoCapitalize="none"
                  autoCorrect={false}
                  maxLength={64}
                />
              ) : null}

              <Text style={[styles.hint, { color: colors.textTertiary }]}>
                微信账单可留空，服务端自动处理。
              </Text>
            </View>

            {file ? (
              <View style={[styles.fileRow, { borderColor: colors.border }]}>
                <Text style={styles.fileEmoji}>📄</Text>
                <View style={styles.fileInfo}>
                  <Text
                    numberOfLines={1}
                    style={[styles.fileName, { color: colors.textPrimary }]}
                  >
                    {file.name}
                  </Text>
                  <Text style={[styles.fileMeta, { color: colors.textTertiary }]}>
                    {formatFileSize(file.size)}
                  </Text>
                </View>
              </View>
            ) : null}

            {error ? (
              <View
                style={[styles.errorBox, { backgroundColor: colors.surface }]}
              >
                <Text style={[styles.errorText, { color: colors.expense }]}>
                  {error}
                </Text>
              </View>
            ) : null}

            <GradientButton
              testID="import-pick"
              title={
                recognizing
                  ? '正在识别账单…'
                  : picking
                    ? '正在打开…'
                    : '选择账单文件'
              }
              onPress={() => {
                handlePick().catch(() => undefined);
              }}
              disabled={picking || recognizing}
            />
            <Text style={[styles.footHint, { color: colors.textTertiary }]}>
              识别在服务器完成，预览阶段不会写入任何账单。
            </Text>
          </ScrollView>
        )}
      </KeyboardAvoidingView>

      {/* 分类选择弹层 */}
      <Modal
        visible={editingRow !== null}
        transparent
        animationType="fade"
        onRequestClose={closeCategoryPicker}
      >
        <View style={[styles.overlay, { backgroundColor: colors.overlay }]}>
          <View style={[styles.modalCard, skin.surfaces.card]}>
            <Text style={[styles.modalTitle, { color: colors.textPrimary }]}>
              选择分类
            </Text>
            <Text
              numberOfLines={1}
              style={[styles.modalSubtitle, { color: colors.textSecondary }]}
            >
              {editingRow?.merchant ||
                editingRow?.channel ||
                '这笔账单'}
            </Text>

            <ScrollView
              style={styles.categoryList}
              contentContainerStyle={styles.categoryListContent}
              showsVerticalScrollIndicator={false}
            >
              {categoryOptions.map((option) => {
                const active = option.name === pendingCategory;
                return (
                  <Pressable
                    key={option.name}
                    testID={`category-option-${option.name}`}
                    onPress={() => setPendingCategory(option.name)}
                    style={[
                      styles.categoryOption,
                      active
                        ? {
                            borderColor: colors.primary,
                            backgroundColor: colors.chipSoftBg,
                          }
                        : { borderColor: colors.border },
                    ]}
                  >
                    <Text style={styles.categoryOptionIcon}>{option.icon}</Text>
                    <Text
                      style={[
                        styles.categoryOptionText,
                        {
                          color: active ? colors.primary : colors.textPrimary,
                        },
                      ]}
                    >
                      {option.name}
                    </Text>
                    {active ? (
                      <Text
                        style={[styles.categoryCheck, { color: colors.primary }]}
                      >
                        ✓
                      </Text>
                    ) : null}
                  </Pressable>
                );
              })}
            </ScrollView>

            <Pressable
              testID="import-learn-toggle"
              onPress={() => setPendingLearn((value) => !value)}
              style={styles.learnRow}
            >
              <View
                style={[
                  styles.checkboxSmall,
                  pendingLearn
                    ? {
                        backgroundColor: colors.primary,
                        borderColor: colors.primary,
                      }
                    : { borderColor: colors.border, backgroundColor: colors.card },
                ]}
              >
                {pendingLearn ? (
                  <Text
                    style={[styles.checkMarkSmall, { color: colors.onAccent }]}
                  >
                    ✓
                  </Text>
                ) : null}
              </View>
              <Text style={[styles.learnText, { color: colors.textSecondary }]}>
                以后这个商家都用这个分类
              </Text>
            </Pressable>
            <Text style={[styles.learnHint, { color: colors.textTertiary }]}>
              {`勾选后会记住「${
                editingRow?.merchant || editingRow?.channel || '这个商家'
              }」，下次导入自动套用`}
            </Text>

            <View style={styles.modalActions}>
              <Pressable
                onPress={closeCategoryPicker}
                style={[styles.cancelButton, { backgroundColor: colors.surface }]}
              >
                <Text style={[styles.cancelText, { color: colors.textSecondary }]}>
                  取消
                </Text>
              </Pressable>
              <Pressable
                testID="import-learn-confirm"
                onPress={confirmCategory}
                disabled={!pendingCategory}
                style={[
                  styles.confirmButton,
                  { backgroundColor: colors.primary },
                  pendingCategory ? undefined : styles.disabled,
                ]}
              >
                <Text style={[styles.confirmText, { color: colors.onAccent }]}>
                  确定
                </Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

function SummaryRow({ label, value }: { label: string; value: string }) {
  const colors = useTheme();
  return (
    <View style={styles.summaryRow}>
      <Text style={[styles.summaryLabel, { color: colors.textTertiary }]}>
        {label}
      </Text>
      <Text
        numberOfLines={1}
        style={[styles.summaryValue, { color: colors.textPrimary }]}
      >
        {value}
      </Text>
    </View>
  );
}

function ResultRow({
  label,
  value,
  strong = false,
}: {
  label: string;
  value: string;
  strong?: boolean;
}) {
  const colors = useTheme();
  return (
    <View style={styles.resultRow}>
      <Text style={[styles.resultLabel, { color: colors.textSecondary }]}>
        {label}
      </Text>
      <Text
        style={[
          styles.resultValue,
          { color: strong ? colors.primary : colors.textPrimary },
        ]}
      >
        {value}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
  },
  flex: {
    flex: 1,
  },
  content: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: spacing.xxl,
    gap: spacing.md,
  },
  headerActionWrap: {
    paddingVertical: spacing.xs,
  },
  headerAction: {
    ...typography.body,
    fontWeight: '600',
  },
  heroCard: {
    alignItems: 'center',
    borderRadius: radius.xl,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.xl,
    gap: spacing.sm,
  },
  heroEmoji: {
    fontSize: 40,
  },
  heroTitle: {
    ...typography.heading,
  },
  heroText: {
    ...typography.caption,
    lineHeight: 19,
    textAlign: 'center',
  },
  card: {
    borderRadius: radius.xl,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  cardHint: {
    ...typography.caption,
    lineHeight: 17,
    marginTop: spacing.sm,
  },
  passwordToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: spacing.xs,
  },
  passwordToggleText: {
    ...typography.body,
    fontWeight: '500',
  },
  passwordChevron: {
    ...typography.caption,
  },
  input: {
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    marginTop: spacing.sm,
    fontSize: 15,
  },
  hint: {
    ...typography.caption,
    marginTop: spacing.sm,
  },
  fileRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: radius.lg,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  fileEmoji: {
    fontSize: 22,
  },
  fileInfo: {
    flex: 1,
    gap: 2,
  },
  fileName: {
    ...typography.body,
    fontWeight: '600',
  },
  fileMeta: {
    ...typography.caption,
  },
  errorBox: {
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  errorText: {
    ...typography.caption,
    lineHeight: 18,
  },
  footHint: {
    ...typography.caption,
    textAlign: 'center',
  },
  summaryHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  summaryCount: {
    ...typography.amount,
  },
  summarySource: {
    ...typography.caption,
  },
  summaryStats: {
    marginTop: spacing.sm,
    gap: spacing.xs,
  },
  summaryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
  },
  summaryLabel: {
    ...typography.caption,
  },
  summaryValue: {
    ...typography.caption,
    fontWeight: '600',
    flexShrink: 1,
  },
  skipTitle: {
    ...typography.caption,
    marginTop: spacing.md,
  },
  reasonWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
    marginTop: spacing.xs,
  },
  reasonChip: {
    borderRadius: radius.sm,
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
  },
  reasonText: {
    fontSize: 10.5,
    fontWeight: '600',
  },
  rowCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.md,
    borderRadius: radius.lg,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
  },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 1,
  },
  checkMark: {
    fontSize: 13,
    fontWeight: '700',
  },
  rowBody: {
    flex: 1,
    gap: spacing.xs,
  },
  rowTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  rowMerchant: {
    ...typography.body,
    fontWeight: '600',
    flexShrink: 1,
  },
  dimmed: {
    opacity: 0.55,
  },
  rowAmount: {
    ...typography.body,
    fontWeight: '700',
    flexShrink: 0,
  },
  rowMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: spacing.xs,
  },
  rowDate: {
    ...typography.caption,
  },
  categoryChip: {
    borderRadius: radius.sm,
    paddingHorizontal: spacing.sm,
    paddingVertical: 3,
  },
  /** 平台 chip：与分类 chip 同节奏，超宽省略。 */
  channelChip: {
    maxWidth: 120,
    borderRadius: radius.sm,
    paddingHorizontal: spacing.sm,
    paddingVertical: 3,
  },
  channelChipText: {
    fontSize: 11,
    fontWeight: '600',
  },
  categoryText: {
    fontSize: 11,
    fontWeight: '600',
  },
  badge: {
    borderRadius: radius.sm,
    paddingHorizontal: spacing.sm,
    paddingVertical: 3,
  },
  badgeText: {
    fontSize: 10,
    fontWeight: '600',
  },
  learnedTag: {
    fontSize: 10,
    fontWeight: '700',
  },
  rowNote: {
    ...typography.caption,
  },
  footer: {
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
  },
  primaryButton: {
    borderRadius: radius.md,
    paddingVertical: 11,
    alignItems: 'center',
  },
  primaryText: {
    fontSize: 15,
    fontWeight: '800',
  },
  primaryHint: {
    fontSize: 10,
    marginTop: 2,
    opacity: 0.85,
  },
  doneHead: {
    alignItems: 'center',
    paddingVertical: spacing.xl,
    gap: spacing.sm,
  },
  doneEmoji: {
    fontSize: 44,
  },
  doneTitle: {
    ...typography.title,
  },
  doneText: {
    ...typography.caption,
    lineHeight: 18,
    textAlign: 'center',
  },
  resultRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: spacing.md,
    gap: spacing.md,
  },
  resultLabel: {
    ...typography.body,
  },
  resultValue: {
    ...typography.body,
    fontWeight: '700',
  },
  divider: {
    height: StyleSheet.hairlineWidth,
  },
  againButton: {
    alignItems: 'center',
    paddingVertical: spacing.sm,
  },
  againText: {
    ...typography.body,
    fontWeight: '600',
  },
  overlay: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.xl,
  },
  modalCard: {
    width: '100%',
    maxWidth: 360,
    maxHeight: '80%',
    borderRadius: radius.xl,
    padding: spacing.xl,
  },
  modalTitle: {
    ...typography.heading,
  },
  modalSubtitle: {
    ...typography.caption,
    marginTop: 2,
  },
  categoryList: {
    marginTop: spacing.md,
    maxHeight: 280,
  },
  categoryListContent: {
    gap: spacing.xs,
  },
  categoryOption: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    borderWidth: 1,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  categoryOptionIcon: {
    fontSize: 18,
  },
  categoryOptionText: {
    flex: 1,
    ...typography.body,
    fontWeight: '600',
  },
  categoryCheck: {
    fontSize: 14,
    fontWeight: '700',
  },
  learnRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginTop: spacing.lg,
  },
  checkboxSmall: {
    width: 18,
    height: 18,
    borderRadius: 9,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkMarkSmall: {
    fontSize: 11,
    fontWeight: '700',
  },
  learnText: {
    ...typography.body,
    flexShrink: 1,
  },
  learnHint: {
    ...typography.caption,
    lineHeight: 16,
    marginTop: spacing.xs,
    marginLeft: 26,
  },
  modalActions: {
    flexDirection: 'row',
    gap: spacing.md,
    marginTop: spacing.lg,
  },
  cancelButton: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.md,
    borderRadius: radius.lg,
  },
  cancelText: {
    ...typography.button,
  },
  confirmButton: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.md,
    borderRadius: radius.lg,
  },
  confirmText: {
    ...typography.button,
  },
  disabled: {
    opacity: 0.45,
  },
});
