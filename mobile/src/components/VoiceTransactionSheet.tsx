import React, { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Linking,
  Modal,
  PermissionsAndroid,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import type { CategoryItem } from '../api/categories';
import GradientView from './GradientView';
import { radius, spacing, typography, useSkin, useTheme } from '../theme';
import {
  cancelVoiceListening,
  isVoiceSupported,
  startVoiceListening,
  stopVoiceListening,
  subscribeVoiceEvents,
} from '../voice';
import { parseVoiceTransaction, type VoiceDraft } from '../voice/parseTransaction';

type Phase = 'requesting' | 'listening' | 'processing' | 'parsing' | 'error';

interface Props {
  visible: boolean;
  categories: CategoryItem[];
  onClose: () => void;
  onDraft: (draft: VoiceDraft) => void;
}

/**
 * 首页「长按 + 号」打开的语音记账弹层。
 *
 * 流程：请求麦克风权限 → 系统语音识别（实时显示部分转写）→ 本地规则解析 →
 * 把草稿交给首页打开「记一笔」确认页。语音只负责填表，最终入账仍走手动确认。
 */
export default function VoiceTransactionSheet({
  visible,
  categories,
  onClose,
  onDraft,
}: Props) {
  const colors = useTheme();
  const skin = useSkin();
  const insets = useSafeAreaInsets();

  const [phase, setPhase] = useState<Phase>('requesting');
  const [partial, setPartial] = useState('');
  const [transcript, setTranscript] = useState('');
  const [error, setError] = useState('');
  const [permissionDenied, setPermissionDenied] = useState(false);
  const [attempt, setAttempt] = useState(0);

  const runIdRef = useRef(0);
  const onDraftRef = useRef(onDraft);
  const onCloseRef = useRef(onClose);
  const categoriesRef = useRef(categories);

  useEffect(() => {
    onDraftRef.current = onDraft;
    onCloseRef.current = onClose;
    categoriesRef.current = categories;
  }, [onDraft, onClose, categories]);

  useEffect(() => {
    return subscribeVoiceEvents({
      onPartial: (text) => setPartial(text),
    });
  }, []);

  useEffect(() => {
    if (!visible) {
      cancelVoiceListening();
      return;
    }

    const runId = runIdRef.current + 1;
    runIdRef.current = runId;
    setPhase('requesting');
    setPartial('');
    setTranscript('');
    setError('');
    setPermissionDenied(false);

    const run = async () => {
      if (!isVoiceSupported) {
        setError(
          Platform.OS === 'ios'
            ? 'iOS 语音记账暂未开放，请先手动记账'
            : '当前设备不支持系统语音识别，请手动记账',
        );
        setPhase('error');
        return;
      }

      try {
        const permission = await PermissionsAndroid.request(
          PermissionsAndroid.PERMISSIONS.RECORD_AUDIO,
        );
        if (runIdRef.current !== runId) {
          return;
        }
        if (permission !== PermissionsAndroid.RESULTS.GRANTED) {
          setPermissionDenied(
            permission === PermissionsAndroid.RESULTS.NEVER_ASK_AGAIN,
          );
          setError(
            permission === PermissionsAndroid.RESULTS.NEVER_ASK_AGAIN
              ? '麦克风权限被拒绝，请到系统设置里允许「拾光」录音'
              : '需要麦克风权限才能语音记账',
          );
          setPhase('error');
          return;
        }

        setPhase('listening');
        const text = await startVoiceListening('zh-CN');
        if (runIdRef.current !== runId) {
          return;
        }
        setTranscript(text);
        setPhase('parsing');

        const result = parseVoiceTransaction(text, {
          today: new Date(),
          categories: categoriesRef.current,
        });
        if (runIdRef.current !== runId) {
          return;
        }
        if (result.draft) {
          onDraftRef.current(result.draft);
          onCloseRef.current();
        } else {
          setError(result.question ?? '没有听懂，请再说一次');
          setPhase('error');
        }
      } catch (e) {
        if (runIdRef.current !== runId) {
          return;
        }
        const message =
          e instanceof Error && e.message ? e.message : '语音识别失败，请重试';
        setError(message);
        setPhase('error');
      }
    };

    void run();

    return () => {
      runIdRef.current += 1;
      cancelVoiceListening();
    };
  }, [visible, attempt]);

  const handleStop = () => {
    setPhase('processing');
    stopVoiceListening();
  };

  const handleRetry = () => {
    setAttempt((current) => current + 1);
  };

  const handleClose = () => {
    cancelVoiceListening();
    onCloseRef.current();
  };

  const statusText =
    phase === 'requesting'
      ? '正在准备麦克风…'
      : phase === 'listening'
        ? partial || '我在听，请说…'
        : phase === 'processing'
          ? '正在识别…'
          : phase === 'parsing'
            ? '正在整理成账单…'
            : error;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={handleClose}
    >
      <View style={[styles.overlay, { backgroundColor: colors.overlay }]}>
        <Pressable style={styles.backdrop} onPress={handleClose} />
        <View
          style={[
            styles.sheet,
            skin.surfaces.sheet,
            { paddingBottom: spacing.xl + Math.max(insets.bottom, 16) },
          ]}
        >
          <View style={styles.head}>
            <View>
              <Text style={[styles.title, { color: colors.textPrimary }]}>
                语音记账
              </Text>
              <Text style={[styles.hint, { color: colors.textTertiary }]}>
                说一句，比如：昨天打车 35
              </Text>
            </View>
            <Pressable onPress={handleClose} style={styles.closeButton}>
              <Text style={[styles.closeText, { color: colors.textSecondary }]}>
                取消
              </Text>
            </Pressable>
          </View>

          <View style={styles.micWrap}>
            <GradientView style={styles.micCircle}>
              <Text style={styles.micEmoji}>🎤</Text>
            </GradientView>
            <View style={styles.statusRow}>
              {phase === 'requesting' ||
              phase === 'processing' ||
              phase === 'parsing' ? (
                <ActivityIndicator size="small" color={colors.primary} />
              ) : null}
              <Text
                style={[
                  styles.status,
                  {
                    color:
                      phase === 'error' ? colors.expense : colors.textSecondary,
                  },
                ]}
              >
                {statusText}
              </Text>
            </View>
            {transcript ? (
              <Text style={[styles.transcript, { color: colors.textPrimary }]}>
                “{transcript}”
              </Text>
            ) : null}
          </View>

          <View style={styles.actions}>
            {phase === 'listening' ? (
              <Pressable
                onPress={handleStop}
                style={[styles.primaryButton, { backgroundColor: colors.primary }]}
              >
                <Text style={[styles.primaryText, { color: colors.onAccent }]}>
                  说完了
                </Text>
              </Pressable>
            ) : null}

            {phase === 'error' ? (
              <>
                {permissionDenied ? (
                  <Pressable
                    onPress={() => void Linking.openSettings()}
                    style={[styles.secondaryButton, { borderColor: colors.border }]}
                  >
                    <Text style={[styles.secondaryText, { color: colors.primary }]}>
                      去设置
                    </Text>
                  </Pressable>
                ) : null}
                <Pressable
                  onPress={handleRetry}
                  style={[
                    styles.primaryButton,
                    { backgroundColor: colors.primary },
                  ]}
                >
                  <Text style={[styles.primaryText, { color: colors.onAccent }]}>
                    重说
                  </Text>
                </Pressable>
              </>
            ) : null}

            {phase === 'requesting' ||
            phase === 'processing' ||
            phase === 'parsing' ? (
              <Text style={[styles.waitText, { color: colors.textTertiary }]}>
                {phase === 'parsing' ? '马上打开确认页…' : '请稍候…'}
              </Text>
            ) : null}
          </View>
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
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.lg,
    gap: spacing.lg,
  },
  head: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
  },
  title: {
    ...typography.heading,
  },
  hint: {
    ...typography.caption,
    marginTop: spacing.xs,
  },
  closeButton: {
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
  },
  closeText: {
    fontSize: 13,
  },
  micWrap: {
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.md,
  },
  micCircle: {
    width: 84,
    height: 84,
    borderRadius: 42,
    alignItems: 'center',
    justifyContent: 'center',
  },
  micEmoji: {
    fontSize: 34,
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
  },
  status: {
    fontSize: 14,
    textAlign: 'center',
  },
  transcript: {
    fontSize: 16,
    lineHeight: 24,
    textAlign: 'center',
    paddingHorizontal: spacing.lg,
  },
  actions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    alignItems: 'center',
    gap: spacing.md,
  },
  primaryButton: {
    minWidth: 120,
    borderRadius: radius.fab,
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.md,
    alignItems: 'center',
  },
  primaryText: {
    fontSize: 15,
    fontWeight: '700',
  },
  secondaryButton: {
    minWidth: 96,
    borderRadius: radius.fab,
    borderWidth: 1,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    alignItems: 'center',
  },
  secondaryText: {
    fontSize: 14,
    fontWeight: '600',
  },
  waitText: {
    fontSize: 13,
  },
});
