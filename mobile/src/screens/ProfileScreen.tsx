import type { BottomTabScreenProps } from '@react-navigation/bottom-tabs';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import React, { useEffect, useState } from 'react';
import {
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { bindPartner, fetchMe, updateProfile } from '../api/auth';
import { extractErrorMessage } from '../api/client';
import ConfirmModal from '../components/ConfirmModal';
import GradientButton from '../components/GradientButton';
import GradientView from '../components/GradientView';
import InputModal from '../components/InputModal';
import UserAvatar from '../components/UserAvatar';
import type { MainTabParamList, RootStackParamList } from '../navigation/types';
import { useAuthStore } from '../store/authStore';
import { radius, spacing, typography, useTheme } from '../theme';
import { checkForUpdate } from '../updater/useUpdateCheck';

type Props = BottomTabScreenProps<MainTabParamList, 'Profile'>;

/** 我的:个人资料(FR-09)+ 分类/圈子/管理后台入口 + 退出登录。 */
export default function ProfileScreen({ navigation }: Props) {
  const colors = useTheme();
  const user = useAuthStore((s) => s.user);
  const updateUser = useAuthStore((s) => s.updateUser);
  const logout = useAuthStore((s) => s.logout);

  const [nicknameEditVisible, setNicknameEditVisible] = useState(false);
  const [nickname, setNickname] = useState('');
  const [savingNickname, setSavingNickname] = useState(false);

  const [bindVisible, setBindVisible] = useState(false);
  const [partnerCode, setPartnerCode] = useState('');
  const [binding, setBinding] = useState(false);

  const [logoutVisible, setLogoutVisible] = useState(false);

  // 进入个人页时刷新资料(昵称/头像/伴侣可能在别处变化)。
  useEffect(() => {
    void fetchMe()
      .then((me) => updateUser(me))
      .catch(() => {
        // 刷新失败沿用本地缓存,不阻塞页面
      });
  }, [updateUser]);

  const rootNav =
    navigation.getParent<NativeStackNavigationProp<RootStackParamList>>();

  const openEditNickname = () => {
    setNickname(user?.nickname ?? '');
    setNicknameEditVisible(true);
  };

  const saveNickname = async () => {
    const trimmed = nickname.trim();
    if (!trimmed) {
      Alert.alert('提示', '昵称不能为空');
      return;
    }
    setSavingNickname(true);
    try {
      const me = await updateProfile(trimmed);
      await updateUser(me);
      setNicknameEditVisible(false);
      Alert.alert('保存成功');
    } catch (error) {
      Alert.alert('保存失败', extractErrorMessage(error));
    } finally {
      setSavingNickname(false);
    }
  };

  const submitBind = async () => {
    const code = partnerCode.trim();
    if (!code) {
      Alert.alert('提示', '请输入伴侣绑定码');
      return;
    }
    setBinding(true);
    try {
      const me = await bindPartner(code);
      await updateUser(me);
      setBindVisible(false);
      setPartnerCode('');
      Alert.alert('绑定成功', `已与 ${me.partner?.nickname ?? '对方'} 绑定为伴侣`);
    } catch (error) {
      Alert.alert('绑定失败', extractErrorMessage(error));
    } finally {
      setBinding(false);
    }
  };

  const changeAvatar = () => {
    // TODO(FR-09): 接入图片选择器(react-native-image-picker)后,将图片转为
    // "data:image/...;base64,..." 字符串调 authApi.updateAvatar(总长 ≤200000)。
    Alert.alert('暂未支持', '更换头像需先接入图片选择器,敬请期待。');
  };

  const confirmLogout = async () => {
    setLogoutVisible(false);
    await logout();
  };

  const partnerText = user?.partner
    ? `${user.partner.nickname}(@${user.partner.username})`
    : '尚未绑定';

  return (
    <SafeAreaView
      style={[styles.safe, { backgroundColor: colors.background }]}
      edges={['top']}
    >
      <ScrollView contentContainerStyle={styles.content}>
        {/* 用户信息卡片 */}
        <GradientView style={styles.headerCard}>
          <UserAvatar avatar={user?.avatar} size={72} />
          <Text style={styles.headerNickname}>{user?.nickname ?? '未登录'}</Text>
          <Text style={styles.headerUsername}>@{user?.username}</Text>
          {user?.is_admin ? (
            <View style={styles.adminBadge}>
              <Text style={styles.adminBadgeText}>管理员</Text>
            </View>
          ) : null}
        </GradientView>

        {/* 资料信息 */}
        <View style={[styles.card, { backgroundColor: colors.card }]}>
          <InfoRow label="用户名" value={user ? `@${user.username}` : '—'} />
          <Divider colors={colors.border} />
          <InfoRow
            label="注册邀请码"
            value={user?.reg_invite_code ?? '—'}
            selectable
          />
          <Divider colors={colors.border} />
          <InfoRow label="伴侣" value={partnerText} />
          {user && !user.partner ? (
            <>
              <GradientButton
                title="绑定伴侣"
                onPress={() => setBindVisible(true)}
                style={styles.cardButton}
              />
              <Text style={[styles.hint, { color: colors.textTertiary }]}>
                输入对方的绑定码即可绑定,绑定码可从对方「我的」页面查看。
              </Text>
            </>
          ) : null}
        </View>

        {/* 资料设置 */}
        <View style={[styles.card, { backgroundColor: colors.card }]}>
          <EntryRow
            emoji="✏️"
            label="编辑昵称"
            onPress={openEditNickname}
          />
          <Divider colors={colors.border} />
          <EntryRow emoji="🖼️" label="更换头像" onPress={changeAvatar} />
        </View>

        {/* 功能入口 */}
        <View style={[styles.card, { backgroundColor: colors.card }]}>
          <EntryRow
            emoji="🔄"
            label="检查更新"
            onPress={() => void checkForUpdate('manual')}
          />
          <Divider colors={colors.border} />
          <EntryRow
            emoji="🗂️"
            label="分类管理"
            onPress={() => rootNav?.navigate('Category')}
          />
          <Divider colors={colors.border} />
          <EntryRow
            emoji="👥"
            label="双人圈子"
            onPress={() => rootNav?.navigate('CircleOverview')}
          />
          {user?.is_admin ? (
            <>
              <Divider colors={colors.border} />
              <EntryRow
                emoji="🛡️"
                label="管理后台"
                onPress={() => rootNav?.navigate('AdminUsers')}
              />
            </>
          ) : null}
        </View>

        {/* 退出登录 */}
        <Pressable
          onPress={() => setLogoutVisible(true)}
          style={[styles.logoutButton, { borderColor: colors.border }]}
        >
          <Text style={[styles.logoutText, { color: colors.expense }]}>
            退出登录
          </Text>
        </Pressable>
      </ScrollView>

      <InputModal
        visible={nicknameEditVisible}
        title="编辑昵称"
        fields={[
          {
            key: 'nickname',
            placeholder: '请输入昵称(1-16 字)',
            value: nickname,
            onChangeText: setNickname,
            maxLength: 16,
          },
        ]}
        confirmText="保存"
        loading={savingNickname}
        onConfirm={() => void saveNickname()}
        onCancel={() => setNicknameEditVisible(false)}
      />

      <InputModal
        visible={bindVisible}
        title="绑定伴侣"
        fields={[
          {
            key: 'code',
            placeholder: '输入对方绑定码(形如 XXXXXX-XXXXXX)',
            value: partnerCode,
            onChangeText: setPartnerCode,
            autoCapitalize: 'characters',
            maxLength: 64,
          },
        ]}
        confirmText="绑定"
        loading={binding}
        onConfirm={() => void submitBind()}
        onCancel={() => setBindVisible(false)}
      />

      <ConfirmModal
        visible={logoutVisible}
        title="退出登录"
        message="确定要退出当前账号吗?"
        confirmText="退出"
        onConfirm={() => void confirmLogout()}
        onCancel={() => setLogoutVisible(false)}
      />
    </SafeAreaView>
  );
}

function InfoRow({
  label,
  value,
  selectable = false,
}: {
  label: string;
  value: string;
  selectable?: boolean;
}) {
  const colors = useTheme();
  return (
    <View style={styles.infoRow}>
      <Text style={[styles.infoLabel, { color: colors.textSecondary }]}>
        {label}
      </Text>
      <Text
        selectable={selectable}
        numberOfLines={1}
        style={[styles.infoValue, { color: colors.textPrimary }]}
      >
        {value}
      </Text>
    </View>
  );
}

function EntryRow({
  emoji,
  label,
  onPress,
}: {
  emoji: string;
  label: string;
  onPress: () => void;
}) {
  const colors = useTheme();
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.entryRow, pressed && styles.pressed]}
    >
      <Text style={styles.entryEmoji}>{emoji}</Text>
      <Text style={[styles.entryLabel, { color: colors.textPrimary }]}>
        {label}
      </Text>
      <Text style={[styles.entryChevron, { color: colors.textTertiary }]}>
        ›
      </Text>
    </Pressable>
  );
}

function Divider({ colors }: { colors: string }) {
  return <View style={[styles.divider, { backgroundColor: colors }]} />;
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
  headerCard: {
    alignItems: 'center',
    paddingVertical: spacing.xl,
    borderRadius: radius.xl,
    gap: spacing.sm,
  },
  headerNickname: {
    ...typography.title,
    color: '#FFFFFF',
    marginTop: spacing.xs,
  },
  headerUsername: {
    ...typography.body,
    color: 'rgba(255, 255, 255, 0.85)',
  },
  adminBadge: {
    backgroundColor: 'rgba(255, 255, 255, 0.25)',
    borderRadius: radius.fab,
    paddingHorizontal: spacing.md,
    paddingVertical: 2,
  },
  adminBadgeText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '600',
  },
  card: {
    borderRadius: radius.xl,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: spacing.md,
    gap: spacing.md,
  },
  infoLabel: {
    ...typography.body,
  },
  infoValue: {
    ...typography.body,
    fontWeight: '600',
    flexShrink: 1,
  },
  cardButton: {
    marginTop: spacing.sm,
  },
  hint: {
    ...typography.caption,
    marginTop: spacing.md,
  },
  entryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.md,
    gap: spacing.md,
  },
  pressed: {
    opacity: 0.6,
  },
  entryEmoji: {
    fontSize: 18,
  },
  entryLabel: {
    flex: 1,
    ...typography.body,
    fontWeight: '500',
  },
  entryChevron: {
    fontSize: 22,
    fontWeight: '600',
  },
  divider: {
    height: StyleSheet.hairlineWidth,
  },
  logoutButton: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.lg,
    borderWidth: 1,
    borderRadius: radius.xl,
    marginTop: spacing.sm,
  },
  logoutText: {
    ...typography.button,
  },
});
