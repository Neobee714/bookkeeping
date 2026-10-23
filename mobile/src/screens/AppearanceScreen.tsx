import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import React from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import ScreenHeader from '../components/ScreenHeader';
import type { RootStackParamList } from '../navigation/types';
import { useThemeStore } from '../store/themeStore';
import {
  SKINS,
  spacing,
  typography,
  useSkin,
  useTheme,
  type SkinDefinition,
  type ThemeMode,
} from '../theme';

type Props = NativeStackScreenProps<RootStackParamList, 'Appearance'>;

const MODE_OPTIONS: Array<{ key: ThemeMode; label: string }> = [
  { key: 'system', label: '跟随系统' },
  { key: 'light', label: '亮色' },
  { key: 'dark', label: '深色' },
];

/** 皮肤缩略图：用该皮肤自己的 token 画一个迷你首页。 */
function SkinPreview({ def, scheme }: { def: SkinDefinition; scheme: 'light' | 'dark' }) {
  const palette = scheme === 'dark' ? def.dark ?? def.light : def.light ?? def.dark;
  if (!palette) {
    return null;
  }
  const { colors, surfaces } = palette;
  const heroColors = palette.heroGradient;
  return (
    <View style={[styles.preview, { backgroundColor: colors.background }]}>
      <View
        style={[
          styles.previewHero,
          { backgroundColor: colors.card, borderRadius: 10 },
          heroColors ? null : surfaces.hero,
          heroColors ? { backgroundColor: heroColors[0] } : null,
        ]}
      >
        <View style={[styles.previewLine, { backgroundColor: 'rgba(255,255,255,0.85)' }]} />
        <View style={[styles.previewLineShort, { backgroundColor: 'rgba(255,255,255,0.6)' }]} />
      </View>
      <View style={[styles.previewRow, { backgroundColor: colors.card, borderRadius: 8 }]}>
        <View style={[styles.previewDot, { backgroundColor: colors.primary }]} />
        <View style={[styles.previewLine, { backgroundColor: colors.border }]} />
      </View>
      <View style={[styles.previewRow, { backgroundColor: colors.card, borderRadius: 8 }]}>
        <View style={[styles.previewDot, { backgroundColor: colors.expense }]} />
        <View style={[styles.previewLine, { backgroundColor: colors.border }]} />
      </View>
    </View>
  );
}

/**
 * 外观设置：四套主题 + 明暗模式。
 * 04 锁定亮色、06 锁定深色，这两套的模式选择置灰并给出说明。
 */
export default function AppearanceScreen({ navigation }: Props) {
  const colors = useTheme();
  const skin = useSkin();
  const skinId = useThemeStore((state) => state.skinId);
  const mode = useThemeStore((state) => state.mode);
  const setSkin = useThemeStore((state) => state.setSkin);
  const setMode = useThemeStore((state) => state.setMode);

  const locked = skin.mode !== 'both';
  const lockedHint =
    skin.mode === 'dark' ? '这套主题只提供深色' : '这套主题只提供亮色';

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: colors.background }]} edges={['top']}>
      <ScreenHeader title="外观" onBack={() => navigation.goBack()} />
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <Text style={[styles.sectionTitle, { color: colors.textSecondary }]}>主题</Text>
        <View style={styles.grid}>
          {SKINS.map((def) => {
            const selected = def.id === skinId;
            const previewScheme =
              def.mode === 'dark' ? 'dark' : def.mode === 'light' ? 'light' : skin.scheme;
            return (
              <Pressable
                key={def.id}
                onPress={() => setSkin(def.id).catch(() => undefined)}
                style={({ pressed }) => [
                  styles.card,
                  { backgroundColor: colors.card, borderColor: colors.border },
                  selected && { borderColor: colors.primary, borderWidth: 2 },
                  pressed && styles.pressed,
                ]}
              >
                <SkinPreview def={def} scheme={previewScheme} />
                <View style={styles.cardFooter}>
                  <Text style={[styles.cardTitle, { color: colors.textPrimary }]} numberOfLines={1}>
                    {def.name}
                  </Text>
                  {selected ? (
                    <View style={[styles.badge, { backgroundColor: colors.primary }]}>
                      <Text style={[styles.badgeText, { color: colors.onAccent }]}>当前</Text>
                    </View>
                  ) : null}
                </View>
                <Text
                  style={[styles.cardTagline, { color: colors.textTertiary }]}
                  numberOfLines={2}
                >
                  {def.tagline}
                </Text>
              </Pressable>
            );
          })}
        </View>

        <Text style={[styles.sectionTitle, { color: colors.textSecondary }]}>明暗</Text>
        <View style={[styles.modeRow, { backgroundColor: colors.surface }]}>
          {MODE_OPTIONS.map((option) => {
            const active = mode === option.key;
            return (
              <Pressable
                key={option.key}
                disabled={locked}
                onPress={() => setMode(option.key).catch(() => undefined)}
                style={[
                  styles.modeOption,
                  active && { backgroundColor: colors.card },
                  locked && styles.modeDisabled,
                ]}
              >
                <Text
                  style={[
                    styles.modeLabel,
                    { color: active ? colors.textPrimary : colors.textSecondary },
                    active && styles.modeLabelActive,
                  ]}
                >
                  {option.label}
                </Text>
              </Pressable>
            );
          })}
        </View>
        <Text style={[styles.hint, { color: colors.textTertiary }]}>
          {locked
            ? `${skin.name} ${lockedHint}，切换其他主题后可选择明暗。`
            : '跟随系统会随手机的深色模式自动切换；也可以固定为亮色或深色。'}
        </Text>

        <Text style={[styles.sectionTitle, { color: colors.textSecondary }]}>说明</Text>
        <Text style={[styles.hint, { color: colors.textTertiary }]}>
          主题只影响颜色、圆角、阴影和渐变，账单、统计、预算的数据与操作完全一致。
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  content: {
    padding: spacing.lg,
    paddingBottom: spacing.xxl,
    gap: spacing.md,
  },
  sectionTitle: {
    ...typography.caption,
    fontSize: 12,
    fontWeight: '600',
    letterSpacing: 1,
    marginTop: spacing.sm,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.md,
  },
  card: {
    width: '47.5%',
    flexGrow: 1,
    borderWidth: 1,
    borderRadius: 18,
    padding: spacing.sm + 2,
    gap: 6,
  },
  pressed: { opacity: 0.85 },
  preview: {
    height: 96,
    borderRadius: 12,
    padding: 8,
    gap: 5,
    overflow: 'hidden',
  },
  previewHero: {
    height: 34,
    padding: 6,
    justifyContent: 'center',
    gap: 4,
  },
  previewRow: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 6,
    gap: 5,
  },
  previewDot: { width: 8, height: 8, borderRadius: 4 },
  previewLine: { height: 4, borderRadius: 2, flex: 1, opacity: 0.55 },
  previewLineShort: { height: 4, width: '46%', borderRadius: 2, opacity: 0.4 },
  cardFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 4,
  },
  cardTitle: { ...typography.heading, fontSize: 14, flexShrink: 1 },
  badge: { borderRadius: 6, paddingHorizontal: 5, paddingVertical: 1 },
  badgeText: { fontSize: 10, fontWeight: '700' },
  cardTagline: { fontSize: 11, lineHeight: 15 },
  modeRow: {
    flexDirection: 'row',
    borderRadius: 14,
    padding: 3,
    gap: 2,
  },
  modeOption: {
    flex: 1,
    paddingVertical: 9,
    borderRadius: 11,
    alignItems: 'center',
  },
  modeDisabled: { opacity: 0.45 },
  modeLabel: { fontSize: 13, fontWeight: '500' },
  modeLabelActive: { fontWeight: '700' },
  hint: { fontSize: 12, lineHeight: 18 },
});
