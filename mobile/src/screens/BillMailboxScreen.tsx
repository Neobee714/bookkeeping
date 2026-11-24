import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import React, { useCallback, useEffect, useState } from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import {
  deleteBillMailbox,
  fetchBillMailbox,
  saveBillMailbox,
  syncBillMailbox,
  testBillMailbox,
  type BillMailboxConfig,
  type BillMailboxPayload,
  type BillMailboxProvider,
} from '../api/billMailbox';
import { extractErrorMessage } from '../api/client';
import ConfirmModal from '../components/ConfirmModal';
import ErrorView from '../components/ErrorView';
import GradientButton from '../components/GradientButton';
import LoadingView from '../components/LoadingView';
import ScreenHeader from '../components/ScreenHeader';
import type { RootStackParamList } from '../navigation/types';
import { radius, spacing, typography, useSkin, useTheme } from '../theme';

type Props = NativeStackScreenProps<RootStackParamList, 'BillMailbox'>;

const PROVIDERS: Array<{ key: BillMailboxProvider; label: string }> = [
  { key: 'qq', label: 'QQ 邮箱' },
  { key: '163', label: '163 邮箱' },
];

const providerLabel = (provider?: BillMailboxProvider): string =>
  PROVIDERS.find((item) => item.key === provider)?.label ?? '—';

/** ISO 时间 → 本地「YYYY-MM-DD HH:mm」；解析失败时原样展示。 */
function formatSyncTime(value?: string | null): string {
  if (!value) {
    return '尚未同步';
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  const pad = (input: number) => String(input).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(
    date.getDate(),
  )} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

const statusText = (status?: 'ok' | 'error' | null): string => {
  if (status === 'ok') {
    return '同步正常';
  }
  if (status === 'error') {
    return '同步失败';
  }
  return '尚未同步';
};

interface Notice {
  tone: 'success' | 'error';
  text: string;
}

/**
 * 账单邮箱（v0.25）：我的 → 账单邮箱。
 *
 * 配置 QQ / 163 的 IMAP 收信信息（授权码加密存后端），手动测试连接 / 同步，
 * 并展示最近一次同步结果。授权码永远不回显：留空表示不修改。
 */
export default function BillMailboxScreen({ navigation }: Props) {
  const colors = useTheme();
  const skin = useSkin();

  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [config, setConfig] = useState<BillMailboxConfig | null>(null);

  const [provider, setProvider] = useState<BillMailboxProvider>('qq');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [folder, setFolder] = useState('INBOX');
  const [enabled, setEnabled] = useState(true);
  const [advancedOpen, setAdvancedOpen] = useState(false);

  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [notice, setNotice] = useState<Notice | null>(null);

  const applyConfig = useCallback((next: BillMailboxConfig) => {
    setConfig(next);
    if (next.configured) {
      setProvider(next.provider ?? 'qq');
      setUsername(next.username ?? '');
      setFolder(next.folder ?? 'INBOX');
      setEnabled(next.enabled ?? true);
    }
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError('');
    try {
      applyConfig(await fetchBillMailbox());
    } catch (error) {
      setLoadError(
        extractErrorMessage(error, '邮箱配置加载失败，请稍后重试'),
      );
    } finally {
      setLoading(false);
    }
  }, [applyConfig]);

  useEffect(() => {
    load().catch(() => undefined);
  }, [load]);

  const configured = config?.configured === true;
  const busy = saving || testing || syncing || deleting;

  /** 组装保存 / 测试的请求体；授权码留空时整个字段省略。 */
  const buildPayload = (): BillMailboxPayload => {
    const trimmedPassword = password.trim();
    return {
      provider,
      username: username.trim(),
      ...(trimmedPassword ? { password: trimmedPassword } : {}),
      folder: folder.trim() || 'INBOX',
      enabled,
    };
  };

  const validate = (): string => {
    if (!username.trim()) {
      return '请填写邮箱地址';
    }
    if (!configured && !password.trim()) {
      return '请填写邮箱授权码';
    }
    return '';
  };

  const handleSave = async () => {
    const invalid = validate();
    if (invalid) {
      setNotice({ tone: 'error', text: invalid });
      return;
    }
    setSaving(true);
    setNotice(null);
    try {
      applyConfig(await saveBillMailbox(buildPayload()));
      setPassword('');
      setNotice({ tone: 'success', text: '已保存邮箱配置' });
    } catch (error) {
      setNotice({
        tone: 'error',
        text: extractErrorMessage(error, '保存失败，请稍后重试'),
      });
    } finally {
      setSaving(false);
    }
  };

  const handleTest = async () => {
    const invalid = validate();
    if (invalid) {
      setNotice({ tone: 'error', text: invalid });
      return;
    }
    setTesting(true);
    setNotice(null);
    try {
      await testBillMailbox(buildPayload());
      setNotice({
        tone: 'success',
        text: '连接成功，邮箱可以正常收信',
      });
    } catch (error) {
      setNotice({
        tone: 'error',
        text: extractErrorMessage(error, '连接失败，请检查邮箱地址与授权码'),
      });
    } finally {
      setTesting(false);
    }
  };

  const handleSync = async () => {
    setSyncing(true);
    setNotice(null);
    try {
      const result = await syncBillMailbox();
      const summary =
        result.summary ||
        `同步完成：收到 ${result.messages} 封，导入 ${result.imported} 笔，重复 ${result.duplicated} 笔，失败 ${result.failed} 封`;
      setNotice({ tone: result.ok ? 'success' : 'error', text: summary });
      setConfig((previous) =>
        previous
          ? {
              ...previous,
              last_sync_at: new Date().toISOString(),
              last_status: result.ok ? 'ok' : 'error',
              last_error: result.error ?? null,
              last_summary: result.summary || previous.last_summary,
            }
          : previous,
      );
      try {
        applyConfig(await fetchBillMailbox());
      } catch {
        // 刷新状态失败时保留上面的本地结果，不覆盖同步提示。
      }
    } catch (error) {
      setNotice({
        tone: 'error',
        text: extractErrorMessage(error, '同步失败，请稍后重试'),
      });
    } finally {
      setSyncing(false);
    }
  };

  const handleDelete = async () => {
    setDeleting(true);
    try {
      await deleteBillMailbox();
      setConfig({ configured: false, secret_stable: config?.secret_stable ?? true });
      setProvider('qq');
      setUsername('');
      setPassword('');
      setFolder('INBOX');
      setEnabled(true);
      setAdvancedOpen(false);
      setNotice({ tone: 'success', text: '已删除邮箱配置' });
    } catch (error) {
      setNotice({
        tone: 'error',
        text: extractErrorMessage(error, '删除失败，请稍后重试'),
      });
    } finally {
      setDeleting(false);
      setConfirmDelete(false);
    }
  };

  const renderStatusCard = () => {
    if (!configured) {
      return (
        <Text style={[styles.intro, { color: colors.textSecondary }]}>
          配置后，服务端会定时收取账单邮件并自动入账。微信账单仍需在微信里申请发送到该邮箱，附件才会被识别。
        </Text>
      );
    }
    return (
      <View style={[styles.card, skin.surfaces.card]}>
        <Text style={[styles.cardTitle, { color: colors.textPrimary }]}>
          邮箱状态
        </Text>
        <StatusRow label="邮箱" value={config?.username ?? '—'} />
        <StatusRow label="提供商" value={providerLabel(config?.provider)} />
        <StatusRow
          label="自动导入"
          value={config?.enabled ? '已启用' : '已停用'}
        />
        <StatusRow
          label="授权码"
          value={config?.has_password ? '已保存' : '未保存'}
        />
        <StatusRow
          label="最近同步"
          value={formatSyncTime(config?.last_sync_at)}
        />
        <StatusRow
          label="最近结果"
          value={config?.last_summary || statusText(config?.last_status)}
        />
        {config?.last_error ? (
          <View style={styles.errorRow}>
            <Text style={[styles.statusLabel, { color: colors.expense }]}>
              错误
            </Text>
            <Text
              testID="mailbox-last-error"
              style={[styles.errorValue, { color: colors.expense }]}
            >
              {config.last_error}
            </Text>
          </View>
        ) : null}
      </View>
    );
  };

  return (
    <SafeAreaView
      style={[styles.safe, { backgroundColor: colors.background }]}
      edges={['top', 'bottom']}
    >
      <ScreenHeader title="账单邮箱" onBack={() => navigation.goBack()} />

      {loading ? (
        <View style={styles.stateWrap}>
          <LoadingView text="加载邮箱配置…" />
        </View>
      ) : loadError ? (
        <View style={styles.stateWrap}>
          <ErrorView
            title="邮箱配置加载失败"
            message={loadError}
            onRetry={() => {
              load().catch(() => undefined);
            }}
          />
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {config?.secret_stable === false ? (
            <View
              testID="mailbox-secret-warning"
              style={[
                styles.warningBanner,
                {
                  backgroundColor: colors.chipSoftBg,
                  borderColor: colors.secondary,
                },
              ]}
            >
              <Text style={[styles.warningTitle, { color: colors.chipSoftText }]}>
                ⚠️ 授权码可能失效
              </Text>
              <Text style={[styles.warningText, { color: colors.chipSoftText }]}>
                服务器 SECRET_KEY 不稳定，重启后需重填授权码。
              </Text>
            </View>
          ) : null}

          {renderStatusCard()}

          <View style={[styles.card, skin.surfaces.card]}>
            <Text style={[styles.cardTitle, { color: colors.textPrimary }]}>
              收信配置
            </Text>

            <Text style={[styles.fieldLabel, { color: colors.textTertiary }]}>
              提供商
            </Text>
            <View style={styles.chipRow}>
              {PROVIDERS.map((item) => {
                const active = item.key === provider;
                return (
                  <Pressable
                    key={item.key}
                    testID={`mailbox-provider-${item.key}`}
                    onPress={() => setProvider(item.key)}
                    style={[
                      styles.chip,
                      {
                        borderColor: active ? colors.primary : colors.border,
                        backgroundColor: active
                          ? colors.chipSoftBg
                          : colors.surface,
                      },
                    ]}
                  >
                    <Text
                      style={[
                        styles.chipText,
                        { color: active ? colors.primary : colors.textSecondary },
                      ]}
                    >
                      {item.label}
                    </Text>
                  </Pressable>
                );
              })}
            </View>

            <Text style={[styles.fieldLabel, { color: colors.textTertiary }]}>
              邮箱地址
            </Text>
            <TextInput
              testID="mailbox-username"
              value={username}
              onChangeText={setUsername}
              placeholder="例如 name@qq.com"
              placeholderTextColor={colors.textTertiary}
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="email-address"
              style={[
                styles.input,
                { backgroundColor: colors.surface, color: colors.textPrimary },
              ]}
            />

            <Text style={[styles.fieldLabel, { color: colors.textTertiary }]}>
              授权码
            </Text>
            <TextInput
              testID="mailbox-password"
              value={password}
              onChangeText={setPassword}
              placeholder="授权码，不是登录密码"
              placeholderTextColor={colors.textTertiary}
              secureTextEntry
              autoCapitalize="none"
              autoCorrect={false}
              style={[
                styles.input,
                { backgroundColor: colors.surface, color: colors.textPrimary },
              ]}
            />
            <Text style={[styles.hint, { color: colors.textTertiary }]}>
              {configured
                ? '留空表示不修改已保存的授权码；填写新授权码会覆盖旧值。'
                : '请填写邮箱设置里生成的授权码，不是登录密码。'}
            </Text>

            <Pressable
              testID="mailbox-advanced"
              onPress={() => setAdvancedOpen((previous) => !previous)}
              style={styles.advancedRow}
            >
              <Text style={[styles.fieldLabel, { color: colors.textTertiary }]}>
                高级
              </Text>
              <Text
                style={[styles.advancedAction, { color: colors.textSecondary }]}
              >
                {advancedOpen ? '收起' : '文件夹 ›'}
              </Text>
            </Pressable>

            {advancedOpen ? (
              <>
                <Text
                  style={[styles.fieldLabel, { color: colors.textTertiary }]}
                >
                  文件夹
                </Text>
                <TextInput
                  testID="mailbox-folder"
                  value={folder}
                  onChangeText={setFolder}
                  placeholder="INBOX"
                  placeholderTextColor={colors.textTertiary}
                  autoCapitalize="characters"
                  autoCorrect={false}
                  style={[
                    styles.input,
                    {
                      backgroundColor: colors.surface,
                      color: colors.textPrimary,
                    },
                  ]}
                />
                <Text style={[styles.hint, { color: colors.textTertiary }]}>
                  默认 INBOX；如果收信规则把账单挪到了子文件夹，填子文件夹名。
                </Text>
              </>
            ) : null}

            <View style={styles.switchRow}>
              <View style={styles.switchMain}>
                <Text
                  style={[styles.switchLabel, { color: colors.textPrimary }]}
                >
                  启用自动导入
                </Text>
                <Text style={[styles.hint, { color: colors.textTertiary }]}>
                  关闭后定时任务不再收信，手动「立即同步」仍可用。
                </Text>
              </View>
              <Switch
                testID="mailbox-enabled"
                value={enabled}
                onValueChange={setEnabled}
                trackColor={{ false: colors.border, true: colors.primary }}
                ios_backgroundColor={colors.border}
              />
            </View>
          </View>

          <View style={styles.actions}>
            <GradientButton
              testID="mailbox-save"
              title={saving ? '保存中…' : '保存'}
              onPress={() => {
                handleSave().catch(() => undefined);
              }}
              disabled={busy}
            />

            <Pressable
              testID="mailbox-test"
              onPress={() => {
                handleTest().catch(() => undefined);
              }}
              disabled={busy}
              style={[
                styles.outlineButton,
                {
                  borderColor: colors.border,
                  backgroundColor: colors.surface,
                },
                busy && styles.disabled,
              ]}
            >
              <Text style={[styles.outlineText, { color: colors.textPrimary }]}>
                {testing ? '测试中…' : '测试连接'}
              </Text>
            </Pressable>

            {configured ? (
              <>
                <Pressable
                  testID="mailbox-sync"
                  onPress={() => {
                    handleSync().catch(() => undefined);
                  }}
                  disabled={busy}
                  style={[
                    styles.outlineButton,
                    {
                      borderColor: colors.border,
                      backgroundColor: colors.surface,
                    },
                    busy && styles.disabled,
                  ]}
                >
                  <Text
                    style={[styles.outlineText, { color: colors.textPrimary }]}
                  >
                    {syncing ? '同步中…' : '立即同步'}
                  </Text>
                </Pressable>

                <Pressable
                  testID="mailbox-delete"
                  onPress={() => setConfirmDelete(true)}
                  disabled={busy}
                  style={[styles.deleteButton, busy && styles.disabled]}
                >
                  <Text style={[styles.deleteText, { color: colors.expense }]}>
                    删除配置
                  </Text>
                </Pressable>
              </>
            ) : null}
          </View>

          {notice ? (
            <Text
              testID="mailbox-notice"
              style={[
                styles.notice,
                {
                  color:
                    notice.tone === 'success' ? colors.income : colors.expense,
                },
              ]}
            >
              {notice.text}
            </Text>
          ) : null}

          <Text style={[styles.footerHint, { color: colors.textTertiary }]}>
            QQ 邮箱 / 163 邮箱需先在网页版设置里开启 IMAP 服务并生成授权码；用登录密码会连接失败。
          </Text>
        </ScrollView>
      )}

      <ConfirmModal
        visible={confirmDelete}
        title="删除邮箱配置"
        message="删除后将停止自动收信，已保存的授权码也会一并删除。确定要删除吗？"
        confirmText="删除"
        loading={deleting}
        onConfirm={() => {
          handleDelete().catch(() => undefined);
        }}
        onCancel={() => {
          if (!deleting) {
            setConfirmDelete(false);
          }
        }}
      />
    </SafeAreaView>
  );
}

function StatusRow({ label, value }: { label: string; value: string }) {
  const colors = useTheme();
  return (
    <View style={styles.statusRow}>
      <Text style={[styles.statusLabel, { color: colors.textSecondary }]}>
        {label}
      </Text>
      <Text
        numberOfLines={2}
        style={[styles.statusValue, { color: colors.textPrimary }]}
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
  stateWrap: {
    flex: 1,
  },
  content: {
    padding: spacing.lg,
    paddingBottom: spacing.xxl,
    gap: spacing.md,
  },
  intro: {
    ...typography.caption,
    lineHeight: 18,
  },
  warningBanner: {
    borderWidth: 1,
    borderRadius: radius.lg,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    gap: 2,
  },
  warningTitle: {
    fontSize: 13,
    fontWeight: '700',
  },
  warningText: {
    fontSize: 12,
    lineHeight: 18,
  },
  card: {
    borderRadius: radius.xl,
    padding: spacing.lg,
    gap: spacing.sm,
  },
  cardTitle: {
    ...typography.heading,
    fontSize: 16,
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: spacing.md,
    paddingVertical: 2,
  },
  statusLabel: {
    ...typography.body,
  },
  statusValue: {
    ...typography.body,
    fontWeight: '600',
    flexShrink: 1,
    textAlign: 'right',
  },
  errorRow: {
    gap: 2,
    paddingTop: spacing.xs,
  },
  errorValue: {
    ...typography.caption,
    lineHeight: 18,
  },
  fieldLabel: {
    ...typography.caption,
    fontSize: 12,
    fontWeight: '600',
    letterSpacing: 0.4,
  },
  chipRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginBottom: spacing.xs,
  },
  chip: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderRadius: radius.fab,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
  },
  chipText: {
    fontSize: 14,
    fontWeight: '600',
  },
  input: {
    height: 46,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    fontSize: 15,
  },
  hint: {
    ...typography.caption,
    lineHeight: 17,
  },
  advancedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: spacing.xs,
    marginTop: spacing.xs,
  },
  advancedAction: {
    ...typography.caption,
    fontWeight: '600',
  },
  switchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingTop: spacing.sm,
  },
  switchMain: {
    flex: 1,
    gap: 2,
  },
  switchLabel: {
    ...typography.body,
    fontWeight: '600',
  },
  actions: {
    gap: spacing.sm,
    marginTop: spacing.xs,
  },
  outlineButton: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.lg,
    borderRadius: radius.xl,
    borderWidth: 1,
  },
  outlineText: {
    ...typography.button,
  },
  deleteButton: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.md,
  },
  deleteText: {
    ...typography.button,
  },
  disabled: {
    opacity: 0.45,
  },
  notice: {
    fontSize: 13,
    lineHeight: 19,
    paddingHorizontal: spacing.xs,
  },
  footerHint: {
    ...typography.caption,
    lineHeight: 17,
  },
});
