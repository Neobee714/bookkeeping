import React, { useEffect, useState } from 'react';
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { extractErrorMessage } from '../api/client';
import { DEFAULT_REPORT_SETTINGS } from '../api/reports';
import { radius, spacing, typography, useSkin, useTheme } from '../theme';
import type { ReportKind, ReportSettings, ReportSettingsPayload } from '../types';
import {
  describeCadence,
  describeCoverage,
  describeRule,
  formatHour,
  normalizeAnchorDay,
  normalizeHour,
  normalizeWeekday,
  REPORT_DAY_OPTIONS,
  REPORT_KIND_OPTIONS,
  reportHourOptions,
  WEEKDAY_OPTIONS,
} from '../utils/reportText';
import GradientButton from './GradientButton';
import SegmentedControl from './SegmentedControl';

interface Props {
  visible: boolean;
  /** 当前设置；null 时按契约默认值（月报 / 1 日 09:00 / 未启用）初始化。 */
  settings: ReportSettings | null;
  /** 离线时整层只读：保存 / 生成置灰并提示。 */
  online: boolean;
  /** 父组件正在保存。 */
  saving: boolean;
  /** 父组件正在生成。 */
  generating: boolean;
  onClose: () => void;
  /** 保存设置；抛错时在弹层内展示。成功后由父组件关闭弹层。 */
  onSave: (payload: ReportSettingsPayload) => Promise<void>;
  /** 立即生成上一期（按弹层当前选中的周期）；抛错时在弹层内展示。 */
  onGenerateNow: (kind: ReportKind) => Promise<void>;
}

/**
 * 财报生成设置弹层（FR-01 / FR-04）。
 *
 * 字段：周期四段 / 周报选星期几 / 其余选 1–28 日（单行横向 chip）/
 * 常用时点 / 自动生成开关。所有颜色取自 skin token，四套皮肤通用。
 */
export default function ReportSettingsSheet({
  visible,
  settings,
  online,
  saving,
  generating,
  onClose,
  onSave,
  onGenerateNow,
}: Props) {
  const colors = useTheme();
  const skin = useSkin();
  const insets = useSafeAreaInsets();

  const [kind, setKind] = useState<ReportKind>('monthly');
  const [weekday, setWeekday] = useState(1);
  const [day, setDay] = useState(1);
  const [hour, setHour] = useState(9);
  const [enabled, setEnabled] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  // 每次打开都按当前设置重置草稿，避免上次未保存的改动残留。
  useEffect(() => {
    if (!visible) {
      return;
    }
    const base = settings ?? DEFAULT_REPORT_SETTINGS;
    setKind(base.kind);
    setWeekday(normalizeWeekday(base.anchor_weekday));
    setDay(normalizeAnchorDay(base.anchor_day));
    setHour(normalizeHour(base.anchor_hour));
    setEnabled(base.enabled);
    setErrorMessage('');
  }, [visible, settings]);

  const draft = {
    kind,
    anchor_weekday: weekday,
    anchor_day: day,
    anchor_hour: hour,
  };

  const handleSave = async () => {
    if (saving) {
      return;
    }
    if (!online) {
      setErrorMessage('离线状态无法保存，请联网后重试');
      return;
    }
    setErrorMessage('');
    try {
      await onSave({
        kind,
        // 契约：weekly 必须给 1–7；其余存 1（anchor_weekday 置空）。
        anchor_weekday: kind === 'weekly' ? weekday : null,
        anchor_day: kind === 'weekly' ? 1 : day,
        anchor_hour: hour,
        enabled,
      });
    } catch (error) {
      setErrorMessage(extractErrorMessage(error, '保存失败，请稍后重试'));
    }
  };

  const handleGenerate = async () => {
    if (generating) {
      return;
    }
    if (!online) {
      setErrorMessage('离线状态无法生成，请联网后重试');
      return;
    }
    setErrorMessage('');
    try {
      await onGenerateNow(kind);
    } catch (error) {
      setErrorMessage(extractErrorMessage(error, '生成失败，请稍后重试'));
    }
  };

  /** 选中态：chipSoftBg 底 + primary 描边；未选中：surface 底 + border 描边。 */
  const renderChip = (
    key: string,
    label: string,
    selected: boolean,
    onPress: () => void,
    extraStyle?: StyleProp<ViewStyle>,
  ) => (
    <Pressable
      key={key}
      onPress={onPress}
      disabled={!online}
      style={[
        styles.chip,
        extraStyle,
        {
          backgroundColor: selected ? colors.chipSoftBg : colors.surface,
          borderColor: selected ? colors.primary : colors.border,
        },
        !online && styles.disabled,
      ]}
    >
      <Text
        style={[
          styles.chipText,
          { color: selected ? colors.chipSoftText : colors.textSecondary },
        ]}
      >
        {label}
      </Text>
    </Pressable>
  );

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <View style={[styles.overlay, { backgroundColor: colors.overlay }]}>
        <Pressable style={styles.backdrop} onPress={onClose} />
        <View
          style={[
            styles.sheet,
            skin.surfaces.sheet,
            {
              paddingBottom: spacing.xl + Math.max(insets.bottom, spacing.md),
            },
          ]}
        >
          <View style={[styles.handle, { backgroundColor: colors.border }]} />
          <View style={styles.head}>
            <Text style={[styles.title, { color: colors.textPrimary }]}>
              生成设置
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
            style={styles.scroll}
            contentContainerStyle={styles.scrollContent}
            showsVerticalScrollIndicator={false}
          >
            {!online ? (
              <View
                style={[styles.notice, { backgroundColor: colors.surface }]}
              >
                <Text style={[styles.noticeText, { color: colors.textSecondary }]}>
                  离线模式：设置与生成需要联网，这里只能查看
                </Text>
              </View>
            ) : null}

            <View
              pointerEvents={online ? 'auto' : 'none'}
              style={!online ? styles.disabled : undefined}
            >
              <SegmentedControl
                options={REPORT_KIND_OPTIONS.map((option) => ({
                  key: option.key,
                  label: option.label,
                }))}
                value={kind}
                onChange={(key) => setKind(key as ReportKind)}
              />
            </View>

            <View style={styles.labelRow}>
              <Text style={[styles.label, { color: colors.textSecondary }]}>
                什么时候生成
              </Text>
              <Text style={[styles.labelHint, { color: colors.textTertiary }]}>
                {kind === 'weekly' ? '每周一次 · 选星期几' : '1–28 日 · 左右滑动'}
              </Text>
            </View>

            {kind === 'weekly' ? (
              <View style={styles.weekRow}>
                {WEEKDAY_OPTIONS.map((option) =>
                  renderChip(
                    `weekday-${option.value}`,
                    option.short,
                    weekday === option.value,
                    () => setWeekday(option.value),
                    styles.chipFlex,
                  ),
                )}
              </View>
            ) : (
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.dayRow}
              >
                {REPORT_DAY_OPTIONS.map((value) =>
                  renderChip(
                    `day-${value}`,
                    String(value),
                    day === value,
                    () => setDay(value),
                    styles.dayChip,
                  ),
                )}
              </ScrollView>
            )}

            <View style={styles.labelRow}>
              <Text style={[styles.label, { color: colors.textSecondary }]}>
                生成时点
              </Text>
              <Text style={[styles.labelHint, { color: colors.textTertiary }]}>
                常用时段
              </Text>
            </View>
            <View style={styles.hourRow}>
              {reportHourOptions(hour).map((value) =>
                renderChip(
                  `hour-${value}`,
                  formatHour(value),
                  hour === value,
                  () => setHour(value),
                  styles.hourChip,
                ),
              )}
            </View>

            <View style={[styles.preview, skin.surfaces.input]}>
              <Text style={[styles.previewMain, { color: colors.textPrimary }]}>
                {describeCadence(draft)}
              </Text>
              <Text style={[styles.previewSub, { color: colors.textTertiary }]}>
                {describeCoverage(kind)}
              </Text>
            </View>

            <View style={styles.switchRow}>
              <View style={styles.switchMain}>
                <Text style={[styles.switchTitle, { color: colors.textPrimary }]}>
                  自动生成
                </Text>
                <Text style={[styles.switchSub, { color: colors.textTertiary }]}>
                  关闭后保留历史报告，不再生成新报告
                </Text>
              </View>
              <Switch
                value={enabled}
                onValueChange={setEnabled}
                disabled={!online}
                trackColor={{ false: colors.border, true: colors.primary }}
                ios_backgroundColor={colors.border}
              />
            </View>

            <View style={[styles.explain, { borderColor: colors.border }]}>
              <Text style={[styles.explainText, { color: colors.textTertiary }]}>
                {describeRule(kind)}
              </Text>
            </View>

            {errorMessage ? (
              <Text style={[styles.error, { color: colors.expense }]}>
                {errorMessage}
              </Text>
            ) : null}

            <GradientButton
              title={saving ? '保存中…' : '保存'}
              onPress={handleSave}
              disabled={!online || saving}
              style={styles.saveButton}
            />

            <Pressable
              onPress={handleGenerate}
              disabled={!online || generating}
              style={({ pressed }) => [
                styles.ghost,
                pressed && styles.pressed,
                (!online || generating) && styles.disabled,
              ]}
            >
              <Text style={[styles.ghostText, { color: colors.primary }]}>
                {generating ? '生成中…' : '立即生成上一期看看'}
              </Text>
            </Pressable>
          </ScrollView>
        </View>
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
  sheet: {
    borderTopLeftRadius: radius.xl + 4,
    borderTopRightRadius: radius.xl + 4,
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.sm,
    maxHeight: '92%',
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
    marginBottom: spacing.lg,
  },
  title: {
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
  scroll: {
    flexShrink: 1,
  },
  scrollContent: {
    paddingBottom: spacing.sm,
  },
  notice: {
    borderRadius: 10,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    marginBottom: spacing.md,
  },
  noticeText: {
    fontSize: 12,
    lineHeight: 17,
  },
  labelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: spacing.lg,
    marginBottom: spacing.sm,
  },
  label: {
    fontSize: 12.5,
  },
  labelHint: {
    fontSize: 10,
  },
  weekRow: {
    flexDirection: 'row',
    gap: 6,
  },
  dayRow: {
    flexDirection: 'row',
    gap: 6,
    paddingRight: spacing.sm,
  },
  hourRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  chip: {
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 10,
    borderWidth: 1.5,
    paddingVertical: 8,
    paddingHorizontal: spacing.xs,
  },
  chipFlex: {
    flex: 1,
  },
  hourChip: {
    flexGrow: 1,
    flexBasis: 46,
  },
  dayChip: {
    width: 36,
    paddingHorizontal: 0,
  },
  chipText: {
    fontSize: 12.5,
    fontWeight: '700',
  },
  preview: {
    gap: 2,
    borderRadius: 12,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    marginTop: spacing.lg,
  },
  previewMain: {
    fontSize: 12.5,
    fontWeight: '700',
  },
  previewSub: {
    fontSize: 10.5,
  },
  switchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    marginTop: spacing.lg,
  },
  switchMain: {
    flex: 1,
    minWidth: 0,
  },
  switchTitle: {
    fontSize: 12.5,
    fontWeight: '700',
  },
  switchSub: {
    fontSize: 10.5,
    marginTop: 2,
  },
  explain: {
    borderWidth: 1,
    borderStyle: 'dashed',
    borderRadius: 10,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    marginTop: spacing.lg,
  },
  explainText: {
    fontSize: 10.5,
    lineHeight: 16,
  },
  error: {
    fontSize: 12,
    marginTop: spacing.md,
  },
  saveButton: {
    marginTop: spacing.lg,
  },
  ghost: {
    alignItems: 'center',
    paddingVertical: spacing.md,
    marginTop: spacing.xs,
  },
  ghostText: {
    fontSize: 12.5,
    fontWeight: '700',
  },
  pressed: {
    opacity: 0.7,
  },
  disabled: {
    opacity: 0.5,
  },
});
