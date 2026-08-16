// 本屏幕由「分类管理」模块 Agent 实现,导航注册由主 Agent 统一协调
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
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
import { SafeAreaView } from 'react-native-safe-area-context';

import { extractErrorMessage } from '../api/client';
import {
  createCategory,
  fetchCategories,
  removeCategory,
  updateCategory,
  type CategoryItem,
} from '../api/categories';
import ConfirmModal from '../components/ConfirmModal';
import EmptyView from '../components/EmptyView';
import ErrorView from '../components/ErrorView';
import GradientButton from '../components/GradientButton';
import GradientView from '../components/GradientView';
import LoadingView from '../components/LoadingView';
import { radius, spacing, typography, useTheme } from '../theme';
import type { TransactionType } from '../types';

/**
 * 分类管理(FR-03)。
 *
 * 支出/收入两个分组展示(emoji 图标 + 名称 + 颜色点,默认分类标「默认」);
 * 底部渐变 FAB 新增分类;点击行内操作按钮编辑 / 删除;
 * 默认分类禁止编辑与删除(前端提示,后端兜底 400)。
 */

/** 预设色板(新增/编辑表单可选)。 */
const COLOR_PALETTE = [
  '#EF4444',
  '#F97316',
  '#F59E0B',
  '#84CC16',
  '#22C55E',
  '#14B8A6',
  '#06B6D4',
  '#3B82F6',
  '#6366F1',
  '#8B5CF6',
  '#EC4899',
  '#F43F5E',
] as const;

const TYPE_LABELS: Record<TransactionType, string> = {
  expense: '支出',
  income: '收入',
};

/** 分类管理(FR-03)。 */
export default function CategoryScreen() {
  const colors = useTheme();

  const [categories, setCategories] = useState<CategoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [formVisible, setFormVisible] = useState(false);
  const [editing, setEditing] = useState<CategoryItem | null>(null);
  const [name, setName] = useState('');
  const [icon, setIcon] = useState('🍜');
  const [color, setColor] = useState<string>(COLOR_PALETTE[0]);
  const [type, setType] = useState<TransactionType>('expense');
  const [formError, setFormError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const [deleting, setDeleting] = useState<CategoryItem | null>(null);
  const [deletingId, setDeletingId] = useState<number | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setCategories(await fetchCategories());
    } catch (err) {
      setError(extractErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const expenseCategories = useMemo(
    () => categories.filter((item) => item.type === 'expense'),
    [categories],
  );
  const incomeCategories = useMemo(
    () => categories.filter((item) => item.type === 'income'),
    [categories],
  );

  const openCreate = () => {
    setEditing(null);
    setName('');
    setIcon('🍜');
    setColor(COLOR_PALETTE[0]);
    setType('expense');
    setFormError('');
    setFormVisible(true);
  };

  const openEdit = (item: CategoryItem) => {
    if (item.is_default) {
      Alert.alert('提示', '默认分类不可修改');
      return;
    }
    setEditing(item);
    setName(item.name);
    setIcon(item.icon);
    setColor(item.color);
    // 后端 type 恒为 income / expense,此处收窄为联合类型。
    setType(item.type as TransactionType);
    setFormError('');
    setFormVisible(true);
  };

  const closeForm = () => {
    setFormVisible(false);
    setEditing(null);
    setFormError('');
  };

  const handleSave = async () => {
    const trimmedName = name.trim();
    const trimmedIcon = icon.trim();
    if (!trimmedName) {
      setFormError('请输入分类名称');
      return;
    }
    if (!trimmedIcon) {
      setFormError('请输入分类图标(emoji)');
      return;
    }

    setSubmitting(true);
    setFormError('');
    try {
      if (editing) {
        await updateCategory(editing.id, {
          name: trimmedName,
          icon: trimmedIcon,
          color,
        });
      } else {
        await createCategory({
          name: trimmedName,
          icon: trimmedIcon,
          color,
          type,
        });
      }
      closeForm();
      await load();
    } catch (err) {
      setFormError(extractErrorMessage(err));
    } finally {
      setSubmitting(false);
    }
  };

  const handleDeleteTap = (item: CategoryItem) => {
    if (item.is_default) {
      Alert.alert('提示', '默认分类不可删除');
      return;
    }
    setDeleting(item);
  };

  const handleDeleteConfirm = async () => {
    if (!deleting) {
      return;
    }
    setDeletingId(deleting.id);
    try {
      await removeCategory(deleting.id);
      setDeleting(null);
      await load();
    } catch (err) {
      Alert.alert('删除失败', extractErrorMessage(err));
      setDeleting(null);
    } finally {
      setDeletingId(null);
    }
  };

  const renderSection = (title: string, items: CategoryItem[]) => (
    <View style={styles.section}>
      <Text style={[styles.sectionTitle, { color: colors.textSecondary }]}>
        {title}({items.length})
      </Text>
      <View style={[styles.card, { backgroundColor: colors.card }]}>
        {items.length === 0 ? (
          <Text style={[styles.emptyText, { color: colors.textTertiary }]}>
            暂无分类
          </Text>
        ) : (
          items.map((item, index) => (
            <View
              key={item.id}
              style={[
                styles.row,
                index < items.length - 1 && {
                  borderBottomWidth: StyleSheet.hairlineWidth,
                  borderBottomColor: colors.border,
                },
              ]}
            >
              <View style={[styles.iconBox, { backgroundColor: `${item.color}26` }]}>
                <Text style={styles.iconText}>{item.icon}</Text>
              </View>
              <View style={styles.rowMain}>
                <Text
                  style={[styles.name, { color: colors.textPrimary }]}
                  numberOfLines={1}
                >
                  {item.name}
                </Text>
                {item.is_default ? (
                  <View style={[styles.defaultBadge, { backgroundColor: colors.surface }]}>
                    <Text style={[styles.defaultBadgeText, { color: colors.textTertiary }]}>
                      默认
                    </Text>
                  </View>
                ) : null}
              </View>
              <View style={[styles.colorDot, { backgroundColor: item.color }]} />
              <Pressable
                onPress={() => openEdit(item)}
                hitSlop={8}
                style={[styles.actionButton, { backgroundColor: colors.surface }]}
              >
                <Text style={styles.actionText}>✏️</Text>
              </Pressable>
              <Pressable
                onPress={() => handleDeleteTap(item)}
                disabled={deletingId === item.id}
                hitSlop={8}
                style={[
                  styles.actionButton,
                  { backgroundColor: `${colors.expense}1A` },
                ]}
              >
                <Text style={styles.actionText}>
                  {deletingId === item.id ? '⏳' : '🗑️'}
                </Text>
              </Pressable>
            </View>
          ))
        )}
      </View>
    </View>
  );

  return (
    <SafeAreaView
      style={[styles.safe, { backgroundColor: colors.background }]}
      edges={['top']}
    >
      <View style={styles.header}>
        <Text style={[styles.title, { color: colors.textPrimary }]}>分类管理</Text>
      </View>

      {loading ? (
        <LoadingView />
      ) : error ? (
        <ErrorView message={error} onRetry={() => void load()} />
      ) : categories.length === 0 ? (
        <EmptyView
          emoji="🗂️"
          title="暂无分类"
          description="点击右下角 + 新增分类"
        />
      ) : (
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.scrollContent}
        >
          {renderSection('支出', expenseCategories)}
          {renderSection('收入', incomeCategories)}
        </ScrollView>
      )}

      <Pressable onPress={openCreate} style={styles.fab} hitSlop={8}>
        <GradientView style={styles.fabGradient}>
          <Text style={styles.fabText}>+</Text>
        </GradientView>
      </Pressable>

      <ConfirmModal
        visible={deleting !== null}
        title="删除分类"
        message={deleting ? `确定删除分类「${deleting.name}」吗?` : ''}
        confirmText="删除"
        onConfirm={() => void handleDeleteConfirm()}
        onCancel={() => setDeleting(null)}
      />

      <Modal
        visible={formVisible}
        transparent
        animationType="slide"
        onRequestClose={closeForm}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={styles.modalRoot}
        >
          <Pressable
            style={[styles.backdrop, { backgroundColor: colors.overlay }]}
            onPress={closeForm}
          />
          <View style={[styles.sheet, { backgroundColor: colors.card }]}>
            <View style={[styles.sheetHandle, { backgroundColor: colors.border }]} />
            <Text style={[styles.sheetTitle, { color: colors.textPrimary }]}>
              {editing ? '编辑分类' : '新增分类'}
            </Text>

            <Text style={[styles.label, { color: colors.textTertiary }]}>名称</Text>
            <TextInput
              value={name}
              onChangeText={setName}
              maxLength={10}
              placeholder="分类名称"
              placeholderTextColor={colors.textTertiary}
              style={[
                styles.input,
                { backgroundColor: colors.surface, color: colors.textPrimary },
              ]}
            />

            <Text style={[styles.label, { color: colors.textTertiary }]}>
              图标(emoji)
            </Text>
            <TextInput
              value={icon}
              onChangeText={setIcon}
              maxLength={8}
              placeholder="如 🍜"
              placeholderTextColor={colors.textTertiary}
              style={[
                styles.input,
                { backgroundColor: colors.surface, color: colors.textPrimary },
              ]}
            />

            <Text style={[styles.label, { color: colors.textTertiary }]}>颜色</Text>
            <View style={styles.palette}>
              {COLOR_PALETTE.map((swatch) => {
                const selected = swatch === color;
                return (
                  <Pressable
                    key={swatch}
                    onPress={() => setColor(swatch)}
                    style={[
                      styles.swatchOuter,
                      selected && { borderColor: colors.primary },
                    ]}
                  >
                    <View style={[styles.swatchInner, { backgroundColor: swatch }]} />
                  </Pressable>
                );
              })}
            </View>

            <Text style={[styles.label, { color: colors.textTertiary }]}>类型</Text>
            <View style={[styles.segment, { backgroundColor: colors.surface }]}>
              {(Object.keys(TYPE_LABELS) as TransactionType[]).map((item) => {
                const active = item === type;
                return (
                  <Pressable
                    key={item}
                    disabled={!!editing}
                    onPress={() => setType(item)}
                    style={styles.segmentItem}
                  >
                    {active ? (
                      <GradientView style={styles.segmentActive}>
                        <Text style={styles.segmentActiveText}>
                          {TYPE_LABELS[item]}
                        </Text>
                      </GradientView>
                    ) : (
                      <Text
                        style={[
                          styles.segmentInactiveText,
                          { color: colors.textSecondary },
                        ]}
                      >
                        {TYPE_LABELS[item]}
                      </Text>
                    )}
                  </Pressable>
                );
              })}
            </View>
            {editing ? (
              <Text style={[styles.typeHint, { color: colors.textTertiary }]}>
                分类类型不可修改
              </Text>
            ) : null}

            {formError ? (
              <Text style={[styles.formError, { color: colors.expense }]}>
                {formError}
              </Text>
            ) : null}

            <GradientButton
              title={submitting ? '保存中…' : '保存'}
              disabled={submitting}
              onPress={() => void handleSave()}
              style={styles.saveButton}
            />
            <Pressable
              onPress={closeForm}
              style={[styles.cancelButton, { backgroundColor: colors.surface }]}
            >
              <Text style={[styles.cancelText, { color: colors.textSecondary }]}>
                取消
              </Text>
            </Pressable>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
  },
  header: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: spacing.md,
  },
  title: {
    ...typography.title,
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: spacing.lg,
    paddingBottom: 96,
    gap: spacing.lg,
  },
  section: {
    gap: spacing.sm,
  },
  sectionTitle: {
    ...typography.caption,
    fontWeight: '600',
    paddingLeft: spacing.xs,
  },
  card: {
    borderRadius: radius.lg,
    paddingHorizontal: spacing.lg,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.md,
  },
  iconBox: {
    width: 36,
    height: 36,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconText: {
    fontSize: 18,
  },
  rowMain: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  name: {
    ...typography.body,
    fontWeight: '500',
    flexShrink: 1,
  },
  defaultBadge: {
    borderRadius: radius.fab,
    paddingHorizontal: spacing.sm,
    paddingVertical: 1,
  },
  defaultBadgeText: {
    fontSize: 10,
  },
  colorDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
  },
  actionButton: {
    width: 30,
    height: 30,
    borderRadius: radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionText: {
    fontSize: 14,
  },
  emptyText: {
    ...typography.caption,
    textAlign: 'center',
    paddingVertical: spacing.xl,
  },
  fab: {
    position: 'absolute',
    right: spacing.xl,
    bottom: spacing.xl,
    borderRadius: radius.fab,
  },
  fabGradient: {
    width: 60,
    height: 60,
    borderRadius: radius.fab,
    alignItems: 'center',
    justifyContent: 'center',
  },
  fabText: {
    color: '#FFFFFF',
    fontSize: 30,
    fontWeight: '600',
    lineHeight: 34,
  },
  modalRoot: {
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
  sheet: {
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.md,
    paddingBottom: spacing.xxl,
  },
  sheetHandle: {
    alignSelf: 'center',
    width: 40,
    height: 4,
    borderRadius: 2,
    marginBottom: spacing.lg,
  },
  sheetTitle: {
    ...typography.heading,
    marginBottom: spacing.lg,
  },
  label: {
    ...typography.caption,
    marginBottom: spacing.xs,
  },
  input: {
    height: 44,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    fontSize: 15,
    marginBottom: spacing.lg,
  },
  palette: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.md,
    marginBottom: spacing.lg,
  },
  swatchOuter: {
    width: 38,
    height: 38,
    borderRadius: 19,
    borderWidth: 2,
    borderColor: 'transparent',
    alignItems: 'center',
    justifyContent: 'center',
  },
  swatchInner: {
    width: 30,
    height: 30,
    borderRadius: 15,
  },
  segment: {
    flexDirection: 'row',
    borderRadius: radius.lg,
    padding: 3,
    marginBottom: spacing.sm,
  },
  segmentItem: {
    flex: 1,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  segmentActive: {
    width: '100%',
    height: '100%',
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  segmentActiveText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '600',
  },
  segmentInactiveText: {
    fontSize: 14,
  },
  typeHint: {
    ...typography.caption,
    marginBottom: spacing.md,
  },
  formError: {
    fontSize: 13,
    marginBottom: spacing.md,
  },
  saveButton: {
    marginTop: spacing.sm,
  },
  cancelButton: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.lg,
    borderRadius: radius.xl,
    marginTop: spacing.md,
  },
  cancelText: {
    ...typography.button,
  },
});
