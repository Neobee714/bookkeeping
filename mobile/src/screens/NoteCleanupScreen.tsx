import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Alert,
  KeyboardAvoidingView,
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
  fetchNoteCandidates,
  reclassifyNote,
  undoNoteCleanup,
} from '../api/transactions';
import EmptyView from '../components/EmptyView';
import ErrorView from '../components/ErrorView';
import LoadingView from '../components/LoadingView';
import ScreenHeader from '../components/ScreenHeader';
import type { RootStackParamList } from '../navigation/types';
import { cacheKey, readCache, writeCache } from '../offline/cache';
import { isOnlineNow, subscribeNetwork } from '../offline/network';
import { useAuthStore } from '../store/authStore';
import { radius, spacing, typography, useSkin, useTheme } from '../theme';
import type {
  CleanupBatchInfo,
  NoteCandidate,
  NoteCandidateList,
  NoteSuggestion,
  ReclassifyPayload,
} from '../types';

type CleanupNavigation = NativeStackNavigationProp<RootStackParamList>;

/** 单条旧备注的整理草稿（内存态，不落盘）。 */
interface CleanupDraft {
  merchant: boolean;
  item: boolean;
  evaluation: boolean;
  merchantName: string;
  itemName: string;
}

const suggestLabel = (suggestion: NoteSuggestion): string | null => {
  switch (suggestion) {
    case 'merchant':
      return '像店名';
    case 'item':
      return '像菜品';
    case 'both':
      return '店 + 菜品';
    case 'evaluation':
      return '像评价';
    default:
      return null;
  }
};

const formatBatchTime = (value: string): string => {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return value.slice(0, 16).replace('T', ' ');
  }
  const hour = String(parsed.getHours()).padStart(2, '0');
  const minute = String(parsed.getMinutes()).padStart(2, '0');
  return `${parsed.getMonth() + 1}月${parsed.getDate()}日 ${hour}:${minute}`;
};

const emptyDraft = (note: string): CleanupDraft => ({
  merchant: false,
  item: false,
  evaluation: false,
  // 商家 / 菜品字段后端上限 50；旧备注可能更长，预填时先截断，用户可再改。
  merchantName: note.slice(0, 50),
  itemName: note.slice(0, 50),
});

const buildDrafts = (
  items: NoteCandidate[],
  previous?: Record<string, CleanupDraft>,
): Record<string, CleanupDraft> => {
  const next: Record<string, CleanupDraft> = {};
  items.forEach((candidate) => {
    next[candidate.note] =
      previous?.[candidate.note] ?? emptyDraft(candidate.note);
  });
  return next;
};

/**
 * 整理旧备注（ARCH 3.5）。
 *
 * 只处理 note_kind IS NULL 的历史备注：每条可选商家 / 吃了什么（可同选）/
 * 评价 / 跳过，保存时逐条串行调用 reclassify。离线只读，写操作禁用。
 */
export default function NoteCleanupScreen() {
  const colors = useTheme();
  const skin = useSkin();
  const navigation = useNavigation<CleanupNavigation>();
  const userId = useAuthStore((state) => state.user?.id ?? null);

  const [data, setData] = useState<NoteCandidateList | null>(null);
  const [drafts, setDrafts] = useState<Record<string, CleanupDraft>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);
  const [fromCache, setFromCache] = useState(false);
  const [online, setOnline] = useState(isOnlineNow());
  const [reloadTick, setReloadTick] = useState(0);
  const [saving, setSaving] = useState(false);
  const [progress, setProgress] = useState(0);
  const [saveError, setSaveError] = useState('');
  const [lastCleanup, setLastCleanup] = useState<CleanupBatchInfo | null>(null);
  const [undoing, setUndoing] = useState(false);

  useEffect(() => subscribeNetwork(setOnline), []);

  const load = useCallback(async () => {
    const key = userId ? cacheKey(userId, 'noteCandidates') : null;
    setLoading(true);
    setError(null);
    setSaveError('');

    const cached = key ? await readCache<NoteCandidateList>(key) : null;
    if (cached) {
      setData(cached);
      setDrafts((previous) => buildDrafts(cached.items, previous));
      setLastCleanup(cached.last_cleanup ?? null);
      setFromCache(true);
    }

    if (!isOnlineNow()) {
      if (!cached) {
        setError(new Error('离线模式：还没有整理候选缓存，请联网后重试'));
      }
      setLoading(false);
      return;
    }

    try {
      const fresh = await fetchNoteCandidates(50);
      setData(fresh);
      setDrafts((previous) => buildDrafts(fresh.items, previous));
      setLastCleanup(fresh.last_cleanup ?? null);
      setFromCache(false);
      if (key) {
        writeCache(key, fresh).catch(() => undefined);
      }
    } catch (loadError) {
      if (!cached) {
        setData(null);
        setError(loadError);
      }
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    load().catch(() => undefined);
  }, [load, reloadTick]);

  const candidates = useMemo(() => data?.items ?? [], [data]);

  /** 返回的候选里包含的账单总数（后端 total 是去重后的备注个数）。 */
  const totalBills = useMemo(
    () => candidates.reduce((sum, candidate) => sum + candidate.count, 0),
    [candidates],
  );

  const selectedPayloads = useMemo<ReclassifyPayload[]>(() => {
    return candidates.flatMap((candidate): ReclassifyPayload[] => {
      const draft = drafts[candidate.note];
      if (!draft) {
        return [];
      }
      const merchantName = (draft.merchantName.trim() || candidate.note).slice(
        0,
        50,
      );
      const itemName = (draft.itemName.trim() || candidate.note).slice(0, 50);
      if (draft.evaluation) {
        return [{ note: candidate.note, action: 'evaluation' as const }];
      }
      if (draft.merchant && draft.item) {
        return [
          {
            note: candidate.note,
            action: 'both' as const,
            merchant: merchantName,
            item: itemName,
          },
        ];
      }
      if (draft.merchant) {
        return [
          {
            note: candidate.note,
            action: 'merchant' as const,
            merchant: merchantName,
          },
        ];
      }
      if (draft.item) {
        return [
          {
            note: candidate.note,
            action: 'item' as const,
            item: itemName,
          },
        ];
      }
      return [];
    });
  }, [candidates, drafts]);

  const selectedCount = selectedPayloads.length;

  const toggleKind = (
    note: string,
    kind: 'merchant' | 'item' | 'evaluation' | 'skip',
  ) => {
    setDrafts((previous) => {
      const draft = previous[note] ?? emptyDraft(note);
      if (kind === 'skip') {
        return {
          ...previous,
          [note]: { ...draft, merchant: false, item: false, evaluation: false },
        };
      }
      if (kind === 'evaluation') {
        const evaluation = !draft.evaluation;
        return {
          ...previous,
          [note]: {
            ...draft,
            evaluation,
            merchant: false,
            item: false,
          },
        };
      }
      return {
        ...previous,
        [note]: {
          ...draft,
          [kind]: !draft[kind],
          evaluation: false,
        },
      };
    });
  };

  const updateField = (
    note: string,
    field: 'merchantName' | 'itemName',
    value: string,
  ) => {
    setDrafts((previous) => {
      const draft = previous[note] ?? emptyDraft(note);
      return { ...previous, [note]: { ...draft, [field]: value } };
    });
  };

  const handleSave = async () => {
    if (!online || saving || selectedCount === 0) {
      return;
    }
    setSaving(true);
    setProgress(0);
    setSaveError('');
    // 同一次保存共用一个 batch_key，后端才能整批撤销。
    const batchKey = `cleanup-${userId ?? 'anon'}-${Date.now()}-${Math.random()
      .toString(36)
      .slice(2, 8)}`;
    try {
      for (let index = 0; index < selectedPayloads.length; index += 1) {
        await reclassifyNote({
          ...selectedPayloads[index],
          batch_key: batchKey,
        });
        setProgress(index + 1);
      }
      // 返回后 StatsScreen 重新获得焦点会自动刷新（包括商家 / 菜品排行），
      // 并在商家 / 菜品档显示「上次整理 · 可撤销」。
      navigation.goBack();
    } catch (saveFailure) {
      setSaveError(extractErrorMessage(saveFailure, '保存失败，请重试'));
    } finally {
      setSaving(false);
    }
  };

  const handleUndo = async () => {
    if (!lastCleanup || undoing || !online) {
      return;
    }
    setUndoing(true);
    try {
      const result = await undoNoteCleanup(lastCleanup.batch_id);
      setLastCleanup(null);
      await load().catch(() => undefined);
      Alert.alert(
        '已撤销',
        result.skipped
          ? `已恢复 ${result.restored} 条；${result.skipped} 条因整理后又被编辑，已跳过。`
          : `已恢复 ${result.restored} 条账单。`,
      );
    } catch (undoError) {
      Alert.alert(
        '撤销失败',
        extractErrorMessage(undoError, '请稍后重试'),
      );
    } finally {
      setUndoing(false);
    }
  };

  const confirmUndo = () => {
    if (!lastCleanup) {
      return;
    }
    Alert.alert(
      '撤销上次整理？',
      `会把上次整理的 ${lastCleanup.affected_count} 条账单恢复到整理前的商家 / 菜品 / 备注；整理后又被编辑过的账单会跳过。`,
      [
        { text: '取消', style: 'cancel' },
        {
          text: '撤销',
          style: 'destructive',
          onPress: () => {
            handleUndo().catch(() => undefined);
          },
        },
      ],
    );
  };

  const title = '整理旧备注';

  return (
    <SafeAreaView
      style={[styles.safe, { backgroundColor: colors.background }]}
      edges={['top', 'bottom']}
    >
      <ScreenHeader title={title} onBack={() => navigation.goBack()} />

      {loading && !data ? (
        <View style={styles.stateWrap}>
          <LoadingView text="加载旧备注…" />
        </View>
      ) : error && !data ? (
        <View style={styles.stateWrap}>
          <ErrorView
            title="旧备注加载失败"
            message={extractErrorMessage(error, '请稍后重试')}
            onRetry={() => setReloadTick((value) => value + 1)}
          />
        </View>
      ) : (
        <>
          <KeyboardAvoidingView
            style={styles.flex}
            behavior={Platform.OS === 'android' ? 'height' : 'padding'}
          >
          <ScrollView
            style={styles.scroll}
            contentContainerStyle={styles.content}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
          >
            {!online ? (
              <View
                style={[styles.offlineBanner, { backgroundColor: colors.surface }]}
              >
                <Text
                  style={[styles.offlineText, { color: colors.textSecondary }]}
                >
                  离线模式：可以查看候选，整理需要联网
                </Text>
              </View>
            ) : null}

            {fromCache && online ? (
              <Text style={[styles.cacheHint, { color: colors.textSecondary }]}>
                网络不可用，显示上次缓存
              </Text>
            ) : null}

            {lastCleanup ? (
              <View
                style={[
                  styles.undoBanner,
                  {
                    backgroundColor: colors.surface,
                    borderColor: colors.border,
                  },
                ]}
              >
                <View style={styles.undoTextWrap}>
                  <Text
                    style={[styles.undoTitle, { color: colors.textPrimary }]}
                    numberOfLines={2}
                  >
                    上次整理 · {formatBatchTime(lastCleanup.created_at)} ·{' '}
                    {lastCleanup.affected_count} 条
                  </Text>
                  <Text
                    style={[styles.undoHint, { color: colors.textTertiary }]}
                  >
                    选错了可以一键恢复；整理后改过的账单会跳过。
                  </Text>
                </View>
                <Pressable
                  onPress={confirmUndo}
                  disabled={!online || undoing}
                  style={[
                    styles.undoButton,
                    { borderColor: colors.primary },
                    (!online || undoing) && styles.disabled,
                  ]}
                >
                  <Text
                    style={[styles.undoButtonText, { color: colors.primary }]}
                  >
                    {undoing ? '撤销中…' : '撤销'}
                  </Text>
                </Pressable>
              </View>
            ) : null}

            <View style={[styles.intro, skin.surfaces.card]}>
              <Text style={[styles.introText, { color: colors.textSecondary }]}>
                共{' '}
                <Text style={[styles.introStrong, { color: colors.textPrimary }]}>
                  {totalBills} 条
                </Text>{' '}
                旧备注，去重后{' '}
                <Text style={[styles.introStrong, { color: colors.textPrimary }]}>
                  {data?.total ?? 0} 个
                </Text>
                。整理只影响统计，不改金额和日期。
              </Text>
              {candidates.length < (data?.total ?? 0) ? (
                <Text style={[styles.introHint, { color: colors.textTertiary }]}>
                  当前展示前 {candidates.length} 个，保存后可再次进入继续整理。
                </Text>
              ) : null}
              <Text style={[styles.introHint, { color: colors.textTertiary }]}>
                商家和「吃了什么」可以同时选；选「评价」则只保留备注，不进入排行。
              </Text>
            </View>

            {candidates.length === 0 ? (
              <View style={styles.emptyWrap}>
                <EmptyView
                  emoji="🧹"
                  title="没有需要整理的旧备注"
                  description="之后新记的账单会直接按商家 / 菜品 / 评价保存"
                />
              </View>
            ) : (
              candidates.map((candidate) => {
                const draft = drafts[candidate.note] ?? emptyDraft(candidate.note);
                const suggestion = suggestLabel(candidate.suggestion);
                const isSkip =
                  !draft.merchant && !draft.item && !draft.evaluation;
                return (
                  <View
                    key={candidate.note}
                    style={[styles.itemCard, skin.surfaces.card]}
                  >
                    <View style={styles.itemHead}>
                      <View style={styles.itemNameWrap}>
                        <Text
                          style={[styles.itemName, { color: colors.textPrimary }]}
                          numberOfLines={1}
                          ellipsizeMode="tail"
                        >
                          {candidate.note}
                        </Text>
                        {suggestion ? (
                          <View
                            style={[
                              styles.suggestBadge,
                              { backgroundColor: colors.chipSoftBg },
                            ]}
                          >
                            <Text
                              style={[
                                styles.suggestText,
                                { color: colors.chipSoftText },
                              ]}
                            >
                              {suggestion}
                            </Text>
                          </View>
                        ) : null}
                      </View>
                      <Text
                        style={[styles.itemMeta, { color: colors.textTertiary }]}
                      >
                        {candidate.count} 笔 · ¥
                        {candidate.total_amount.toLocaleString('zh-CN', {
                          maximumFractionDigits: 2,
                        })}
                      </Text>
                    </View>

                    <View style={styles.choiceRow}>
                      {(
                        [
                          ['merchant', '商家'],
                          ['item', '吃了什么'],
                          ['evaluation', '评价'],
                          ['skip', '跳过'],
                        ] as const
                      ).map(([kind, label]) => {
                        const active =
                          kind === 'skip' ? false : draft[kind] === true;
                        return (
                          <Pressable
                            key={kind}
                            onPress={() => toggleKind(candidate.note, kind)}
                            style={[
                              styles.choice,
                              {
                                backgroundColor: active
                                  ? colors.chipSoftBg
                                  : colors.surface,
                              },
                              active
                                ? { borderColor: colors.primary }
                                : styles.choiceBorderIdle,
                            ]}
                          >
                            <Text
                              style={[
                                styles.choiceText,
                                {
                                  color: active
                                    ? colors.primary
                                    : colors.textSecondary,
                                },
                              ]}
                            >
                              {label}
                            </Text>
                          </Pressable>
                        );
                      })}
                    </View>

                    {draft.merchant ? (
                      <View style={styles.fieldRow}>
                        <Text
                          style={[styles.fieldLabel, { color: colors.textTertiary }]}
                        >
                          商家
                        </Text>
                        <TextInput
                          style={[
                            styles.fieldInput,
                            skin.surfaces.input,
                            { color: colors.textPrimary },
                          ]}
                          value={draft.merchantName}
                          onChangeText={(value) =>
                            updateField(candidate.note, 'merchantName', value)
                          }
                          placeholder={candidate.note}
                          placeholderTextColor={colors.textTertiary}
                          maxLength={50}
                        />
                      </View>
                    ) : null}

                    {draft.item ? (
                      <View style={styles.fieldRow}>
                        <Text
                          style={[styles.fieldLabel, { color: colors.textTertiary }]}
                        >
                          吃了什么
                        </Text>
                        <TextInput
                          style={[
                            styles.fieldInput,
                            skin.surfaces.input,
                            { color: colors.textPrimary },
                          ]}
                          value={draft.itemName}
                          onChangeText={(value) =>
                            updateField(candidate.note, 'itemName', value)
                          }
                          placeholder={candidate.note}
                          placeholderTextColor={colors.textTertiary}
                          maxLength={50}
                        />
                      </View>
                    ) : null}

                    <Text
                      style={[styles.itemTip, { color: colors.textTertiary }]}
                    >
                      {isSkip
                        ? '本次不处理这条，账单原样保留'
                        : draft.evaluation
                          ? '保留为评价，不进入商家 / 菜品排行'
                          : draft.merchant && draft.item
                            ? `一笔拆成商家「${
                                draft.merchantName.trim() || candidate.note
                              }」+ 菜品「${
                                draft.itemName.trim() || candidate.note
                              }」`
                            : draft.merchant
                              ? `应用到 ${candidate.count} 笔同名账单`
                              : '保持为菜品，进入「爱吃的」排行'}
                    </Text>
                  </View>
                );
              })
            )}

            {saveError ? (
              <View style={[styles.errorBox, { backgroundColor: colors.surface }]}>
                <Text style={[styles.errorText, { color: colors.expense }]}>
                  {saveError}
                </Text>
              </View>
            ) : null}
          </ScrollView>

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
              onPress={() => {
                handleSave().catch(() => undefined);
              }}
              disabled={!online || saving || selectedCount === 0}
              style={({ pressed }) => [
                styles.saveButton,
                {
                  backgroundColor: colors.primary,
                  opacity:
                    !online || saving || selectedCount === 0
                      ? 0.45
                      : pressed
                        ? 0.8
                        : 1,
                },
              ]}
            >
              <Text style={[styles.saveText, { color: colors.onAccent }]}>
                {saving
                  ? `正在保存 ${progress}/${selectedCount}…`
                  : `保存整理结果（${selectedCount}）`}
              </Text>
              <Text style={[styles.saveHint, { color: colors.onAccent }]}>
                应用到所有同名账单，不改金额和日期
              </Text>
            </Pressable>
          </View>
          </KeyboardAvoidingView>
        </>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
  },
  flex: {
    flex: 1,
  },
  scroll: {
    flex: 1,
  },
  stateWrap: {
    flex: 1,
    minHeight: 320,
  },
  content: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: spacing.xl,
    gap: spacing.sm,
  },
  offlineBanner: {
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  offlineText: {
    fontSize: 12,
  },
  cacheHint: {
    ...typography.caption,
    textAlign: 'center',
  },
  undoBanner: {
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginBottom: spacing.xs,
  },
  undoTextWrap: {
    flex: 1,
    gap: 2,
  },
  undoTitle: {
    fontSize: 12,
    fontWeight: '700',
    lineHeight: 17,
  },
  undoHint: {
    fontSize: 10,
    lineHeight: 14,
  },
  undoButton: {
    borderRadius: radius.sm,
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 6,
    flexShrink: 0,
  },
  undoButtonText: {
    fontSize: 11,
    fontWeight: '800',
  },
  disabled: {
    opacity: 0.45,
  },
  intro: {
    borderRadius: radius.lg,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    marginBottom: spacing.xs,
  },
  introText: {
    fontSize: 12,
    lineHeight: 18,
  },
  introStrong: {
    fontWeight: '700',
  },
  introHint: {
    fontSize: 10.5,
    lineHeight: 16,
    marginTop: spacing.xs,
  },
  emptyWrap: {
    minHeight: 260,
  },
  itemCard: {
    borderRadius: radius.lg,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  itemHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  itemNameWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    flexShrink: 1,
  },
  itemName: {
    fontSize: 13.5,
    fontWeight: '800',
    flexShrink: 1,
  },
  suggestBadge: {
    borderRadius: 999,
    paddingHorizontal: 6,
    paddingVertical: 1.5,
    flexShrink: 0,
  },
  suggestText: {
    fontSize: 8.5,
    fontWeight: '700',
  },
  itemMeta: {
    fontSize: 9.5,
    flexShrink: 0,
  },
  choiceRow: {
    flexDirection: 'row',
    gap: 5,
    marginTop: spacing.sm,
  },
  choice: {
    flex: 1,
    alignItems: 'center',
    borderRadius: radius.sm,
    borderWidth: 1,
    paddingVertical: 5,
  },
  choiceText: {
    fontSize: 10,
    fontWeight: '700',
  },
  choiceBorderIdle: {
    borderColor: 'transparent',
  },
  fieldRow: {
    marginTop: spacing.sm,
    gap: 3,
  },
  fieldLabel: {
    fontSize: 9,
  },
  fieldInput: {
    borderRadius: radius.sm,
    paddingHorizontal: spacing.sm,
    paddingVertical: 6,
    fontSize: 12,
  },
  itemTip: {
    fontSize: 9,
    lineHeight: 14,
    marginTop: 6,
  },
  errorBox: {
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  errorText: {
    fontSize: 12,
  },
  footer: {
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
    paddingBottom: spacing.sm,
  },
  saveButton: {
    borderRadius: radius.md,
    paddingVertical: 10,
    alignItems: 'center',
  },
  saveText: {
    fontSize: 14,
    fontWeight: '800',
  },
  saveHint: {
    fontSize: 9,
    marginTop: 2,
    opacity: 0.82,
  },
});
