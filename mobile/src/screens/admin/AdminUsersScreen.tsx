import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import React, { useCallback, useEffect, useState } from 'react';
import {
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { getAdminUsers, removeCircleMember } from '../../api/circles';
import { extractErrorMessage } from '../../api/client';
import ConfirmModal from '../../components/ConfirmModal';
import EmptyView from '../../components/EmptyView';
import ErrorView from '../../components/ErrorView';
import LoadingView from '../../components/LoadingView';
import ScreenHeader from '../../components/ScreenHeader';
import UserAvatar from '../../components/UserAvatar';
import type { RootStackParamList } from '../../navigation/types';
import { radius, spacing, typography, useTheme } from '../../theme';
import type { AdminUser, JoinedCircle } from '../../types';
import { formatDateTime } from '../../utils/format';

type Props = NativeStackScreenProps<RootStackParamList, 'AdminUsers'>;

type AdminUserRow = AdminUser & { joined_circle: JoinedCircle };

/**
 * 管理后台用户列表(FR-10,仅管理员可见)。
 *
 * 说明:后端无「封禁/设管理员」接口(管理员由环境变量 CIRCLE_CREATOR_USERNAME
 * 决定),当前可对用户执行的圈子管理操作仅为「移出圈子」
 * (DELETE /api/v1/circles/{circle_id}/members/{user_id})。
 */
export default function AdminUsersScreen({ navigation }: Props) {
  const colors = useTheme();

  const [users, setUsers] = useState<AdminUserRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [removeTarget, setRemoveTarget] = useState<AdminUserRow | null>(null);

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

  const confirmRemove = async () => {
    if (!removeTarget?.joined_circle) {
      return;
    }
    try {
      await removeCircleMember(removeTarget.joined_circle.id, removeTarget.id);
      setRemoveTarget(null);
      Alert.alert('已移出圈子');
      await loadUsers();
    } catch (e) {
      Alert.alert('操作失败', extractErrorMessage(e));
    }
  };

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
            说明:管理员与封禁状态由后端环境配置决定;当前可对已加入圈子的用户执行
            「移出圈子」。
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
                <Text style={[styles.userMeta, { color: colors.textSecondary }]}>
                  圈子:{user.joined_circle ? user.joined_circle.name : '未加入'}
                </Text>
              </View>
              {user.joined_circle ? (
                <Pressable
                  onPress={() => setRemoveTarget(user)}
                  style={[styles.removeButton, { backgroundColor: colors.surface }]}
                >
                  <Text style={[styles.removeButtonText, { color: colors.expense }]}>
                    移出圈子
                  </Text>
                </Pressable>
              ) : null}
            </View>
          ))}
        </ScrollView>
      )}

      <ConfirmModal
        visible={removeTarget !== null}
        title="移出圈子"
        message={
          removeTarget?.joined_circle
            ? `确定将 ${removeTarget.nickname} 移出圈子「${removeTarget.joined_circle.name}」吗?`
            : undefined
        }
        confirmText="移出"
        onConfirm={() => void confirmRemove()}
        onCancel={() => setRemoveTarget(null)}
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
  removeButton: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.md,
  },
  removeButtonText: {
    fontSize: 12,
    fontWeight: '600',
  },
});
