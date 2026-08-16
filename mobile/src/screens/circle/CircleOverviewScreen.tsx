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

import {
  applyCreateCircle,
  createCircle,
  createCircleInvite,
  deleteMyApplication,
  getCircleInvite,
  getMyApplication,
  joinCircle,
  leaveCircle,
  listCircles,
} from '../../api/circles';
import { extractErrorMessage } from '../../api/client';
import ConfirmModal from '../../components/ConfirmModal';
import EmptyView from '../../components/EmptyView';
import ErrorView from '../../components/ErrorView';
import GradientButton from '../../components/GradientButton';
import InputModal from '../../components/InputModal';
import LoadingView from '../../components/LoadingView';
import ScreenHeader from '../../components/ScreenHeader';
import UserAvatar from '../../components/UserAvatar';
import type { RootStackParamList } from '../../navigation/types';
import { useAuthStore } from '../../store/authStore';
import { radius, spacing, typography, useTheme } from '../../theme';
import type { Circle, CircleApplication, CircleInviteCode } from '../../types';

type Props = NativeStackScreenProps<RootStackParamList, 'CircleOverview'>;

/** 双人圈子概览(FR-08):我的圈子(成员/邀请码)、创建/申请创建、加入、退出。 */
export default function CircleOverviewScreen({ navigation }: Props) {
  const colors = useTheme();
  const user = useAuthStore((s) => s.user);

  const [circles, setCircles] = useState<Circle[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [invites, setInvites] = useState<Record<number, CircleInviteCode | null>>(
    {},
  );
  const [inviteLoading, setInviteLoading] = useState<number | null>(null);

  const [createVisible, setCreateVisible] = useState(false);
  const [createName, setCreateName] = useState('');
  const [createDescription, setCreateDescription] = useState('');
  const [creating, setCreating] = useState(false);

  const [applyVisible, setApplyVisible] = useState(false);
  const [applyName, setApplyName] = useState('');
  const [applyDescription, setApplyDescription] = useState('');
  const [applyMessage, setApplyMessage] = useState('');
  const [applying, setApplying] = useState(false);

  const [joinVisible, setJoinVisible] = useState(false);
  const [joinCode, setJoinCode] = useState('');
  const [joining, setJoining] = useState(false);

  const [myApplication, setMyApplication] = useState<CircleApplication | null>(
    null,
  );

  const [leaveTarget, setLeaveTarget] = useState<Circle | null>(null);

  const loadCircles = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setCircles(await listCircles());
    } catch (e) {
      setError(extractErrorMessage(e));
    } finally {
      setLoading(false);
    }
  }, []);

  const loadMyApplication = useCallback(async () => {
    if (user?.is_admin) {
      return;
    }
    try {
      setMyApplication(await getMyApplication());
    } catch {
      // 申请状态加载失败不阻塞主流程
    }
  }, [user?.is_admin]);

  useEffect(() => {
    void loadCircles();
    void loadMyApplication();
  }, [loadCircles, loadMyApplication]);

  const toggleExpand = async (circle: Circle) => {
    if (expandedId === circle.id) {
      setExpandedId(null);
      return;
    }
    setExpandedId(circle.id);
    if (!circle.is_creator || circle.id in invites) {
      return;
    }
    setInviteLoading(circle.id);
    try {
      const invite = await getCircleInvite(circle.id);
      setInvites((prev) => ({ ...prev, [circle.id]: invite }));
    } catch (e) {
      Alert.alert('获取邀请码失败', extractErrorMessage(e));
    } finally {
      setInviteLoading(null);
    }
  };

  const generateInvite = async (circleId: number) => {
    setInviteLoading(circleId);
    try {
      const invite = await createCircleInvite(circleId);
      setInvites((prev) => ({ ...prev, [circleId]: invite }));
    } catch (e) {
      Alert.alert('生成失败', extractErrorMessage(e));
    } finally {
      setInviteLoading(null);
    }
  };

  const submitCreate = async () => {
    const name = createName.trim();
    if (!name) {
      Alert.alert('提示', '圈子名称不能为空');
      return;
    }
    setCreating(true);
    try {
      const circle = await createCircle({
        name,
        description: createDescription.trim() || null,
      });
      // 后端说明:管理员直建圈子不会自动成为成员,需生成邀请码并加入后才出现在列表中
      const invite = await createCircleInvite(circle.id);
      await joinCircle(invite.code);
      setCreateVisible(false);
      setCreateName('');
      setCreateDescription('');
      Alert.alert('创建成功', `圈子「${circle.name}」已创建并加入。`);
      await loadCircles();
    } catch (e) {
      Alert.alert('创建失败', extractErrorMessage(e));
    } finally {
      setCreating(false);
    }
  };

  const submitApply = async () => {
    const name = applyName.trim();
    if (!name) {
      Alert.alert('提示', '圈子名称不能为空');
      return;
    }
    setApplying(true);
    try {
      await applyCreateCircle({
        circle_name: name,
        circle_description: applyDescription.trim() || null,
        message: applyMessage.trim() || null,
      });
      setApplyVisible(false);
      setApplyName('');
      setApplyDescription('');
      setApplyMessage('');
      await loadMyApplication();
      Alert.alert('申请已提交', '请等待管理员审核。');
    } catch (e) {
      Alert.alert('提交失败', extractErrorMessage(e));
    } finally {
      setApplying(false);
    }
  };

  const withdrawApplication = async () => {
    try {
      await deleteMyApplication();
      setMyApplication(null);
      Alert.alert('已撤回');
    } catch (e) {
      Alert.alert('撤回失败', extractErrorMessage(e));
    }
  };

  const submitJoin = async () => {
    const code = joinCode.trim();
    if (!code) {
      Alert.alert('提示', '请输入邀请码');
      return;
    }
    setJoining(true);
    try {
      const circle = await joinCircle(code);
      setJoinVisible(false);
      setJoinCode('');
      Alert.alert('加入成功', `已加入圈子「${circle.name}」。`);
      await loadCircles();
    } catch (e) {
      Alert.alert('加入失败', extractErrorMessage(e));
    } finally {
      setJoining(false);
    }
  };

  const confirmLeave = async () => {
    if (!leaveTarget) {
      return;
    }
    try {
      await leaveCircle(leaveTarget.id);
      setLeaveTarget(null);
      setExpandedId(null);
      await loadCircles();
    } catch (e) {
      Alert.alert('退出失败', extractErrorMessage(e));
    }
  };

  const applicationStatusText =
    myApplication?.status === 'pending'
      ? '审核中'
      : myApplication?.status === 'approved'
        ? '已通过'
        : '已拒绝';

  return (
    <SafeAreaView
      style={[styles.safe, { backgroundColor: colors.background }]}
      edges={['top']}
    >
      <ScreenHeader title="双人圈子" onBack={() => navigation.goBack()} />

      {loading ? (
        <LoadingView text="加载圈子…" />
      ) : error ? (
        <ErrorView message={error} onRetry={() => void loadCircles()} />
      ) : (
        <ScrollView contentContainerStyle={styles.content}>
          {/* 顶部操作 */}
          <View style={styles.actionRow}>
            <GradientButton
              title={user?.is_admin ? '创建圈子' : '申请创建圈子'}
              onPress={() =>
                user?.is_admin ? setCreateVisible(true) : setApplyVisible(true)
              }
              style={styles.actionPrimary}
            />
            <Pressable
              onPress={() => setJoinVisible(true)}
              style={[
                styles.actionSecondary,
                {
                  backgroundColor: colors.card,
                  borderColor: colors.border,
                },
              ]}
            >
              <Text style={[styles.actionSecondaryText, { color: colors.primary }]}>
                加入圈子
              </Text>
            </Pressable>
          </View>

          {/* 非管理员:创建申请状态 */}
          {!user?.is_admin && myApplication ? (
            <View style={[styles.card, { backgroundColor: colors.card }]}>
              <Text style={[styles.cardTitle, { color: colors.textPrimary }]}>
                创建申请
              </Text>
              <Text style={[styles.cardSubtitle, { color: colors.textSecondary }]}>
                圈子:{myApplication.circle_name} · 状态:{applicationStatusText}
              </Text>
              {myApplication.status === 'pending' ? (
                <Pressable
                  onPress={() => void withdrawApplication()}
                  style={styles.withdrawButton}
                >
                  <Text style={[styles.withdrawText, { color: colors.expense }]}>
                    撤回申请
                  </Text>
                </Pressable>
              ) : null}
            </View>
          ) : null}

          {/* 我的圈子 */}
          {circles.length === 0 ? (
            <EmptyView
              emoji="👥"
              title="还没有圈子"
              description="创建或加入一个圈子,和 TA 一起分享动态吧"
            />
          ) : (
            circles.map((circle) => (
              <CircleCard
                key={circle.id}
                circle={circle}
                expanded={expandedId === circle.id}
                invite={invites[circle.id] ?? null}
                inviteLoading={inviteLoading === circle.id}
                onPress={() => void toggleExpand(circle)}
                onGenerateInvite={() => void generateInvite(circle.id)}
                onOpenPosts={() =>
                  navigation.navigate('CirclePosts', {
                    circleId: circle.id,
                    circleName: circle.name,
                  })
                }
                onLeave={() => setLeaveTarget(circle)}
              />
            ))
          )}
        </ScrollView>
      )}

      <InputModal
        visible={createVisible}
        title="创建圈子"
        fields={[
          {
            key: 'name',
            placeholder: '圈子名称(1-30 字)',
            value: createName,
            onChangeText: setCreateName,
            maxLength: 30,
          },
          {
            key: 'description',
            placeholder: '圈子简介(选填,≤100 字)',
            value: createDescription,
            onChangeText: setCreateDescription,
            maxLength: 100,
            multiline: true,
          },
        ]}
        confirmText="创建"
        loading={creating}
        onConfirm={() => void submitCreate()}
        onCancel={() => setCreateVisible(false)}
      />

      <InputModal
        visible={applyVisible}
        title="申请创建圈子"
        fields={[
          {
            key: 'name',
            placeholder: '圈子名称(1-30 字)',
            value: applyName,
            onChangeText: setApplyName,
            maxLength: 30,
          },
          {
            key: 'description',
            placeholder: '圈子简介(选填,≤100 字)',
            value: applyDescription,
            onChangeText: setApplyDescription,
            maxLength: 100,
            multiline: true,
          },
          {
            key: 'message',
            placeholder: '给管理员的留言(选填,≤100 字)',
            value: applyMessage,
            onChangeText: setApplyMessage,
            maxLength: 100,
            multiline: true,
          },
        ]}
        confirmText="提交申请"
        loading={applying}
        onConfirm={() => void submitApply()}
        onCancel={() => setApplyVisible(false)}
      />

      <InputModal
        visible={joinVisible}
        title="加入圈子"
        fields={[
          {
            key: 'code',
            placeholder: '输入 8 位邀请码',
            value: joinCode,
            onChangeText: setJoinCode,
            autoCapitalize: 'characters',
            maxLength: 8,
          },
        ]}
        confirmText="加入"
        loading={joining}
        onConfirm={() => void submitJoin()}
        onCancel={() => setJoinVisible(false)}
      />

      <ConfirmModal
        visible={leaveTarget !== null}
        title="退出圈子"
        message={
          leaveTarget
            ? `确定退出圈子「${leaveTarget.name}」吗?圈主退出时若圈内还有其他成员将无法退出。`
            : undefined
        }
        confirmText="退出"
        onConfirm={() => void confirmLeave()}
        onCancel={() => setLeaveTarget(null)}
      />
    </SafeAreaView>
  );
}

interface CircleCardProps {
  circle: Circle;
  expanded: boolean;
  invite: CircleInviteCode | null;
  inviteLoading: boolean;
  onPress: () => void;
  onGenerateInvite: () => void;
  onOpenPosts: () => void;
  onLeave: () => void;
}

function CircleCard({
  circle,
  expanded,
  invite,
  inviteLoading,
  onPress,
  onGenerateInvite,
  onOpenPosts,
  onLeave,
}: CircleCardProps) {
  const colors = useTheme();
  return (
    <View style={[styles.card, { backgroundColor: colors.card }]}>
      <Pressable
        onPress={onPress}
        style={({ pressed }) => [styles.cardHeader, pressed && styles.pressed]}
      >
        <View style={styles.cardHeaderText}>
          <Text style={[styles.cardTitle, { color: colors.textPrimary }]}>
            {circle.name}
          </Text>
          <Text
            style={[styles.cardSubtitle, { color: colors.textSecondary }]}
            numberOfLines={1}
          >
            {circle.description || '暂无简介'} · {circle.member_count} 位成员
            {circle.is_creator ? ' · 你是圈主' : ''}
          </Text>
        </View>
        <Text style={[styles.chevron, { color: colors.textTertiary }]}>
          {expanded ? '▴' : '▾'}
        </Text>
      </Pressable>

      {expanded ? (
        <View style={styles.expanded}>
          <Text style={[styles.sectionLabel, { color: colors.textSecondary }]}>
            成员
          </Text>
          <View style={styles.memberRow}>
            {circle.members.length === 0 ? (
              <Text style={[styles.caption, { color: colors.textTertiary }]}>
                暂无成员
              </Text>
            ) : (
              circle.members.map((member) => (
                <View key={member.id} style={styles.member}>
                  <UserAvatar avatar={member.user.avatar} size={40} />
                  <Text
                    style={[styles.memberName, { color: colors.textSecondary }]}
                    numberOfLines={1}
                  >
                    {member.user.nickname}
                  </Text>
                </View>
              ))
            )}
          </View>

          {circle.is_creator ? (
            <>
              <Text style={[styles.sectionLabel, { color: colors.textSecondary }]}>
                邀请码
              </Text>
              {inviteLoading ? (
                <Text style={[styles.caption, { color: colors.textTertiary }]}>
                  加载中…
                </Text>
              ) : invite ? (
                <Text
                  selectable
                  style={[styles.inviteCode, { color: colors.primary }]}
                >
                  {invite.code}
                </Text>
              ) : (
                <GradientButton
                  title="生成邀请码"
                  onPress={onGenerateInvite}
                  style={styles.smallButton}
                />
              )}
            </>
          ) : null}

          <View style={styles.cardActions}>
            <Pressable
              onPress={onOpenPosts}
              style={[styles.inlineButton, { backgroundColor: colors.surface }]}
            >
              <Text style={[styles.inlineButtonText, { color: colors.primary }]}>
                圈子动态
              </Text>
            </Pressable>
            <Pressable
              onPress={onLeave}
              style={[styles.inlineButton, { backgroundColor: colors.surface }]}
            >
              <Text style={[styles.inlineButtonText, { color: colors.expense }]}>
                退出圈子
              </Text>
            </Pressable>
          </View>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
  },
  content: {
    padding: spacing.lg,
    paddingBottom: spacing.xxl,
    gap: spacing.lg,
  },
  actionRow: {
    flexDirection: 'row',
    gap: spacing.md,
  },
  actionPrimary: {
    flex: 1,
  },
  actionSecondary: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.xl,
    borderWidth: 1,
    paddingVertical: spacing.lg,
    paddingHorizontal: spacing.xl,
  },
  actionSecondaryText: {
    ...typography.button,
  },
  card: {
    borderRadius: radius.xl,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  pressed: {
    opacity: 0.6,
  },
  cardHeaderText: {
    flex: 1,
    gap: spacing.xs,
  },
  cardTitle: {
    ...typography.heading,
  },
  cardSubtitle: {
    ...typography.caption,
  },
  chevron: {
    fontSize: 18,
    fontWeight: '600',
  },
  expanded: {
    marginTop: spacing.md,
    gap: spacing.sm,
  },
  sectionLabel: {
    ...typography.caption,
    fontWeight: '600',
  },
  memberRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.md,
    marginBottom: spacing.xs,
  },
  member: {
    alignItems: 'center',
    width: 56,
    gap: 2,
  },
  memberName: {
    ...typography.caption,
    fontSize: 11,
  },
  inviteCode: {
    ...typography.heading,
    letterSpacing: 2,
  },
  caption: {
    ...typography.caption,
  },
  smallButton: {
    alignSelf: 'flex-start',
  },
  cardActions: {
    flexDirection: 'row',
    gap: spacing.md,
    marginTop: spacing.sm,
  },
  inlineButton: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.md,
    borderRadius: radius.md,
  },
  inlineButtonText: {
    fontSize: 14,
    fontWeight: '600',
  },
  withdrawButton: {
    alignSelf: 'flex-start',
    marginTop: spacing.sm,
  },
  withdrawText: {
    fontSize: 14,
    fontWeight: '600',
  },
});
