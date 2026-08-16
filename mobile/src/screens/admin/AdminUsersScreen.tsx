import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import React, { useCallback, useEffect, useState } from 'react';
import {
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { getAdminUsers } from '../../api/admin';
import { extractErrorMessage } from '../../api/client';
import EmptyView from '../../components/EmptyView';
import ErrorView from '../../components/ErrorView';
import LoadingView from '../../components/LoadingView';
import ScreenHeader from '../../components/ScreenHeader';
import UserAvatar from '../../components/UserAvatar';
import type { RootStackParamList } from '../../navigation/types';
import { radius, spacing, typography, useTheme } from '../../theme';
import type { AdminUser } from '../../types';
import { formatDateTime } from '../../utils/format';

type Props = NativeStackScreenProps<RootStackParamList, 'AdminUsers'>;

/**
 * 管理后台用户列表(FR-10,仅管理员可见)。
 *
 * 说明:后端无「封禁/设管理员」接口(管理员由环境变量决定),本页为只读用户列表。
 */
export default function AdminUsersScreen({ navigation }: Props) {
  const colors = useTheme();

  const [users, setUsers] = useState<AdminUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadUsers = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setUsers(await getAdminUsers());
    } catch (e) {
      setError(extractErrorMessage(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadUsers();
  }, [loadUsers]);

  return (
    <SafeAreaView
      style={[styles.safe, { backgroundColor: colors.background }]}
      edges={['top']}
    >
      <ScreenHeader title="管理后台" onBack={() => navigation.goBack()} />

      {loading ? (
        <LoadingView text="加载用户…" />
      ) : error ? (
        <ErrorView message={error} onRetry={() => void loadUsers()} />
      ) : users.length === 0 ? (
        <EmptyView emoji="🧑‍🤝‍🧑" title="暂无用户" />
      ) : (
        <ScrollView contentContainerStyle={styles.content}>
          <Text style={[styles.note, { color: colors.textTertiary }]}>
            说明:管理员与封禁状态由后端环境配置决定。
          </Text>
          {users.map((user) => (
            <View key={user.id} style={[styles.card, { backgroundColor: colors.card }]}>
              <UserAvatar avatar={user.avatar} size={44} />
              <View style={styles.userInfo}>
                <View style={styles.userNameRow}>
                  <Text style={[styles.userName, { color: colors.textPrimary }]}>
                    {user.nickname}
                  </Text>
                  {user.is_admin ? (
                    <View style={[styles.adminBadge, { backgroundColor: colors.surface }]}>
                      <Text style={[styles.adminBadgeText, { color: colors.primary }]}>
                        管理员
                      </Text>
                    </View>
                  ) : null}
                </View>
                <Text style={[styles.userMeta, { color: colors.textSecondary }]}>
                  @{user.username} · 注册于 {formatDateTime(user.created_at)}
                </Text>
              </View>
            </View>
          ))}
        </ScrollView>
      )}
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
    gap: spacing.md,
  },
  note: {
    ...typography.caption,
    lineHeight: 18,
  },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    borderRadius: radius.xl,
    padding: spacing.lg,
  },
  userInfo: {
    flex: 1,
    gap: 2,
  },
  userNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  userName: {
    ...typography.body,
    fontWeight: '600',
    flexShrink: 1,
  },
  adminBadge: {
    borderRadius: radius.fab,
    paddingHorizontal: spacing.sm,
    paddingVertical: 1,
  },
  adminBadgeText: {
    fontSize: 10,
    fontWeight: '600',
  },
  userMeta: {
    ...typography.caption,
  },
});
