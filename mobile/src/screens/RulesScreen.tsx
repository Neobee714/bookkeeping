import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { fetchCategories } from '../api/categories';
import { extractErrorMessage } from '../api/client';
import {
  deleteImportRule,
  fetchImportRules,
  updateImportRule,
  type ImportRule,
} from '../api/imports';
import ConfirmModal from '../components/ConfirmModal';
import EmptyView from '../components/EmptyView';
import ErrorView from '../components/ErrorView';
import LoadingView from '../components/LoadingView';
import ScreenHeader from '../components/ScreenHeader';
import type { RootStackParamList } from '../navigation/types';
import { radius, spacing, typography, useSkin, useTheme } from '../theme';

type Props = NativeStackScreenProps<RootStackParamList, 'Rules'>;

/**
 * 分类规则（v0.24）：我的 → 分类规则。
 *
 * 列出导入时学过的商家 / 平台规则；点分类 chip 改分类（PATCH），
 * 右侧删除（先确认）。所有失败都降级成行内空态 / Alert，不崩页面。
 */
export default function RulesScreen({ navigation }: Props) {
  const colors = useTheme();
  const skin = useSkin();

  const [rules, setRules] = useState<ImportRule[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [categories, setCategories] = useState<string[]>([]);

  const [editing, setEditing] = useState<ImportRule | null>(null);
  const [pendingCategory, setPendingCategory] = useState('');
  const [saving, setSaving] = useState(false);

  const [deleting, setDeleting] = useState<ImportRule | null>(null);
  const [removing, setRemoving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError('');
    try {
      setRules(await fetchImportRules());
    } catch (error) {
      setLoadError(extractErrorMessage(error, '规则加载失败，请稍后重试'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load().catch(() => undefined);
  }, [load]);

  /** 分类清单只用于选择器；失败静默，仍可保留当前分类。 */
  const loadCategories = useCallback(async () => {
    try {
      const list = await fetchCategories();
      setCategories(list.map((item) => item.name));
    } catch {
      // 选择器降级为「当前分类」一项，不阻塞页面。
    }
  }, []);

  useEffect(() => {
    loadCategories().catch(() => undefined);
  }, [loadCategories]);

  const openCategoryPicker = (rule: ImportRule) => {
    setEditing(rule);
    setPendingCategory(rule.category);
    if (categories.length === 0) {
      loadCategories().catch(() => undefined);
    }
  };

  const closeCategoryPicker = () => {
    setEditing(null);
    setPendingCategory('');
  };

  /** 选择器选项：分类清单 + 兜底当前分类（分类接口失败时至少可选回原值）。 */
  const categoryOptions = useMemo(() => {
    const names = [...categories];
    if (editing && !names.includes(editing.category)) {
      names.unshift(editing.category);
    }
    return names;
  }, [categories, editing]);

  const confirmCategory = async () => {
    if (!editing || !pendingCategory || saving) {
      return;
    }
    if (pendingCategory === editing.category) {
      closeCategoryPicker();
      return;
    }
    const target = editing;
    setSaving(true);
    try {
      const updated = await updateImportRule(target.id, pendingCategory);
      setRules((previous) =>
        previous.map((rule) =>
          rule.id === target.id ? { ...rule, ...updated } : rule,
        ),
      );
      closeCategoryPicker();
    } catch (error) {
      Alert.alert('修改失败', extractErrorMessage(error, '分类修改失败，请稍后重试'));
    } finally {
      setSaving(false);
    }
  };

  const confirmDelete = async () => {
    if (!deleting || removing) {
      return;
    }
    const target = deleting;
    setRemoving(true);
    try {
      await deleteImportRule(target.id);
      setRules((previous) => previous.filter((rule) => rule.id !== target.id));
      setDeleting(null);
    } catch (error) {
      setDeleting(null);
      Alert.alert('删除失败', extractErrorMessage(error, '规则删除失败，请稍后重试'));
    } finally {
      setRemoving(false);
    }
  };

  return (
    <SafeAreaView
      style={[styles.safe, { backgroundColor: colors.background }]}
      edges={['top', 'bottom']}
    >
      <ScreenHeader title="分类规则" onBack={() => navigation.goBack()} />

      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        <Text style={[styles.intro, { color: colors.textSecondary }]}>
          导入账单时勾选「以后这个商家都用这个分类」会生成规则，下次导入自动套用。改分类只影响之后的导入，不改已入账的账单。
        </Text>

        {loading ? (
          <View style={styles.stateWrap}>
            <LoadingView text="加载规则…" />
          </View>
        ) : loadError ? (
          <View style={styles.stateWrap}>
            <ErrorView
              title="规则加载失败"
              message={loadError}
              onRetry={() => {
                load().catch(() => undefined);
              }}
            />
          </View>
        ) : rules.length === 0 ? (
          <View style={styles.stateWrap}>
            <EmptyView
              emoji="🧠"
              title="还没有记住的规则"
              description="导入账单时勾选「以后这个商家都用这个分类」就会生成"
            />
          </View>
        ) : (
          rules.map((rule) => (
            <View
              key={rule.id}
              testID={`rule-row-${rule.id}`}
              style={[styles.row, skin.surfaces.card]}
            >
              <View style={styles.rowMain}>
                <Text
                  numberOfLines={1}
                  ellipsizeMode="tail"
                  style={[styles.ruleName, { color: colors.textPrimary }]}
                >
                  {rule.merchant}
                </Text>
                <Text style={[styles.ruleMeta, { color: colors.textTertiary }]}>
                  {`命中 ${rule.hits} 次`}
                </Text>
              </View>

              <Pressable
                testID={`rule-category-${rule.id}`}
                onPress={() => openCategoryPicker(rule)}
                hitSlop={6}
                style={[
                  styles.categoryChip,
                  { backgroundColor: colors.chipSoftBg },
                ]}
              >
                <Text
                  numberOfLines={1}
                  style={[styles.categoryText, { color: colors.chipSoftText }]}
                >
                  {`${rule.category} ›`}
                </Text>
              </Pressable>

              <Pressable
                testID={`rule-delete-${rule.id}`}
                onPress={() => setDeleting(rule)}
                hitSlop={8}
                style={styles.deleteButton}
              >
                <Text style={[styles.deleteText, { color: colors.expense }]}>
                  删除
                </Text>
              </Pressable>
            </View>
          ))
        )}
      </ScrollView>

      {/* 改分类 */}
      <Modal
        visible={editing !== null}
        transparent
        animationType="fade"
        onRequestClose={closeCategoryPicker}
      >
        <View style={[styles.overlay, { backgroundColor: colors.overlay }]}>
          <View style={[styles.modalCard, skin.surfaces.card]}>
            <Text style={[styles.modalTitle, { color: colors.textPrimary }]}>
              改分类
            </Text>
            <Text
              numberOfLines={1}
              style={[styles.modalSubtitle, { color: colors.textSecondary }]}
            >
              {editing?.merchant ?? ''}
            </Text>

            <ScrollView
              style={styles.categoryList}
              contentContainerStyle={styles.categoryListContent}
              showsVerticalScrollIndicator={false}
            >
              {categoryOptions.map((name) => {
                const active = name === pendingCategory;
                return (
                  <Pressable
                    key={name}
                    testID={`rule-category-option-${name}`}
                    onPress={() => setPendingCategory(name)}
                    style={[
                      styles.categoryOption,
                      {
                        borderColor: active ? colors.primary : colors.border,
                        backgroundColor: active
                          ? colors.chipSoftBg
                          : colors.card,
                      },
                    ]}
                  >
                    <Text
                      style={[
                        styles.categoryOptionText,
                        { color: active ? colors.primary : colors.textPrimary },
                      ]}
                    >
                      {name}
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

            {categories.length === 0 ? (
              <Text style={[styles.modalHint, { color: colors.textTertiary }]}>
                分类清单加载失败，暂时只能保留当前分类。
              </Text>
            ) : null}

            <View style={styles.modalActions}>
              <Pressable
                onPress={closeCategoryPicker}
                disabled={saving}
                style={[styles.cancelButton, { backgroundColor: colors.surface }]}
              >
                <Text style={[styles.cancelText, { color: colors.textSecondary }]}>
                  取消
                </Text>
              </Pressable>
              <Pressable
                testID="rule-category-confirm"
                onPress={() => {
                  confirmCategory().catch(() => undefined);
                }}
                disabled={saving || !pendingCategory}
                style={[
                  styles.confirmButton,
                  { backgroundColor: colors.primary },
                  saving || !pendingCategory ? styles.disabled : undefined,
                ]}
              >
                <Text style={[styles.confirmText, { color: colors.onAccent }]}>
                  {saving ? '保存中…' : '保存'}
                </Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      <ConfirmModal
        visible={deleting !== null}
        title="删除分类规则"
        message={
          deleting
            ? `确定删除「${deleting.merchant}」的分类规则吗？删除后下次导入不再自动套用。`
            : undefined
        }
        confirmText="删除"
        loading={removing}
        onConfirm={() => {
          confirmDelete().catch(() => undefined);
        }}
        onCancel={() => {
          if (!removing) {
            setDeleting(null);
          }
        }}
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
    paddingBottom: spacing.xxl,
    gap: spacing.sm,
  },
  intro: {
    ...typography.caption,
    lineHeight: 18,
    marginBottom: spacing.xs,
  },
  stateWrap: {
    minHeight: 320,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    borderRadius: radius.lg,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
  },
  rowMain: {
    flex: 1,
    minWidth: 0,
  },
  ruleName: {
    ...typography.body,
    fontWeight: '600',
  },
  ruleMeta: {
    fontSize: 11,
    marginTop: 2,
  },
  categoryChip: {
    flexShrink: 0,
    maxWidth: 110,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  categoryText: {
    fontSize: 11,
    fontWeight: '600',
  },
  deleteButton: {
    flexShrink: 0,
    paddingHorizontal: spacing.xs,
    paddingVertical: 2,
  },
  deleteText: {
    fontSize: 12,
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
    justifyContent: 'space-between',
    gap: spacing.sm,
    borderWidth: 1,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  categoryOptionText: {
    flexShrink: 1,
    ...typography.body,
    fontWeight: '600',
  },
  categoryCheck: {
    fontSize: 14,
    fontWeight: '700',
  },
  modalHint: {
    ...typography.caption,
    marginTop: spacing.sm,
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
