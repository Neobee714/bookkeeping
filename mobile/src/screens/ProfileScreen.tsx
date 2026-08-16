import type { BottomTabScreenProps } from '@react-navigation/bottom-tabs';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import React, { useEffect, useState } from 'react';
import {
  Alert,
  Image,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { launchImageLibrary } from 'react-native-image-picker';
import { SafeAreaView } from 'react-native-safe-area-context';

import {
  bindPartner,
  changePassword,
  fetchMe,
  updateAvatar,
  updateProfile,
} from '../api/auth';
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

/** 后端头像限制:data URL 总长 ≤200000 字符(≈150KB base64)。 */
const AVATAR_MAX_CHARS = 200000;

/** 我的:个人资料(FR-10)+ 分类/管理后台入口 + 退出登录。 */
export default function ProfileScreen({ navigation }: Props) {
  const colors = useTheme();
  const user = useAuthStore((s) => s.user);
  const updateUser = useAuthStore((s) => s.updateUser);
  const logout = useAuthStore((s) => s.logout);

  const [nicknameEditVisible, setNicknameEditVisible] = useState(false);
  const [nickname, setNickname] = useState('');
  const [savingNickname, setSavingNickname] = useState(false);

  const [usernameEditVisible, setUsernameEditVisible] = useState(false);
  const [username, setUsername] = useState('');
  const [savingUsername, setSavingUsername] = useState(false);

  const [passwordEditVisible, setPasswordEditVisible] = useState(false);
  const [oldPassword, setOldPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [savingPassword, setSavingPassword] = useState(false);

  const [avatarPreviewVisible, setAvatarPreviewVisible] = useState(false);
  const [avatarPreviewUri, setAvatarPreviewUri] = useState('');
  const [avatarDataUrl, setAvatarDataUrl] = useState('');
  const [uploadingAvatar, setUploadingAvatar] = useState(false);

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
      const me = await updateProfile({ nickname: trimmed });
      await updateUser(me);
      setNicknameEditVisible(false);
      Alert.alert('保存成功');
    } catch (error) {
      Alert.alert('保存失败', extractErrorMessage(error));
    } finally {
      setSavingNickname(false);
    }
  };

  const openEditUsername = () => {
    setUsername(user?.username ?? '');
    setUsernameEditVisible(true);
  };

  const saveUsername = async () => {
    const trimmed = username.trim();
    if (!trimmed) {
      Alert.alert('提示', '用户名不能为空');
      return;
    }
    setSavingUsername(true);
    try {
      const me = await updateProfile({ username: trimmed });
      await updateUser(me);
      setUsernameEditVisible(false);
      Alert.alert('保存成功', '下次登录请使用新的用户名');
    } catch (error) {
      Alert.alert('保存失败', extractErrorMessage(error));
    } finally {
      setSavingUsername(false);
    }
  };

  const openEditPassword = () => {
    setOldPassword('');
    setNewPassword('');
    setPasswordEditVisible(true);
  };

  const savePassword = async () => {
    if (!oldPassword) {
      Alert.alert('提示', '请输入旧密码');
      return;
    }
    if (newPassword.length < 6) {
      Alert.alert('提示', '新密码至少 6 位');
      return;
    }
    setSavingPassword(true);
    try {
      const me = await changePassword(oldPassword, newPassword);
      await updateUser(me);
      setPasswordEditVisible(false);
      setOldPassword('');
      setNewPassword('');
      Alert.alert('密码修改成功', '下次登录请使用新密码');
    } catch (error) {
      Alert.alert('修改失败', extractErrorMessage(error));
    } finally {
      setSavingPassword(false);
    }
  };

  const pickAvatar = async () => {
    try {
      const result = await launchImageLibrary({
        mediaType: 'photo',
        includeBase64: true,
        maxWidth: 400,
        maxHeight: 400,
        quality: 0.8,
      });
      if (result.didCancel || !result.assets?.length) {
        return;
      }
      const asset = result.assets[0];
      if (!asset.base64) {
        Alert.alert('提示', '无法读取所选图片,请重新选择');
        return;
      }
      const mime =
        asset.type && asset.type.startsWith('image/') ? asset.type : 'image/jpeg';
      const dataUrl = `data:${mime};base64,${asset.base64}`;
      if (dataUrl.length > AVATAR_MAX_CHARS) {
        Alert.alert('图片过大', '请选择尺寸更小或更清晰的图片');
        return;
      }
      setAvatarDataUrl(dataUrl);
      setAvatarPreviewUri(asset.uri ?? dataUrl);
      setAvatarPreviewVisible(true);
    } catch (error) {
      Alert.alert('选择失败', extractErrorMessage(error, '无法打开相册,请稍后重试'));
    }
  };

  const confirmAvatar = async () => {
    setUploadingAvatar(true);
    try {
      const me = await updateAvatar(avatarDataUrl);
      await updateUser(me);
      setAvatarPreviewVisible(false);
      Alert.alert('头像更新成功');
    } catch (error) {
      Alert.alert('上传失败', extractErrorMessage(error));
    } finally {
      setUploadingAvatar(false);
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
          <EntryRow
            emoji="🆔"
            label="修改用户名"
            onPress={openEditUsername}
          />
          <Divider colors={colors.border} />
          <EntryRow
            emoji="🔑"
            label="修改密码"
            onPress={openEditPassword}
          />
          <Divider colors={colors.border} />
          <EntryRow emoji="🖼️" label="更换头像" onPress={() => void pickAvatar()} />
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
        visible={usernameEditVisible}
        title="修改用户名"
        fields={[
          {
            key: 'username',
            placeholder: '请输入用户名(3-50 字符)',
            value: username,
            onChangeText: setUsername,
            autoCapitalize: 'none',
            maxLength: 50,
          },
        ]}
        confirmText="保存"
        loading={savingUsername}
        onConfirm={() => void saveUsername()}
        onCancel={() => setUsernameEditVisible(false)}
      />

      <InputModal
        visible={passwordEditVisible}
        title="修改密码"
        fields={[
          {
            key: 'old_password',
            placeholder: '请输入旧密码',
            value: oldPassword,
            onChangeText: setOldPassword,
            secureTextEntry: true,
            autoCapitalize: 'none',
            maxLength: 128,
          },
          {
            key: 'new_password',
            placeholder: '请输入新密码(至少 6 位)',
            value: newPassword,
            onChangeText: setNewPassword,
            secureTextEntry: true,
            autoCapitalize: 'none',
            maxLength: 128,
          },
        ]}
        confirmText="确认修改"
        loading={savingPassword}
        onConfirm={() => void savePassword()}
        onCancel={() => setPasswordEditVisible(false)}
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

      {/* 更换头像:相册选图后先预览再上传 */}
      <Modal
        visible={avatarPreviewVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setAvatarPreviewVisible(false)}
      >
        <View style={[styles.overlay, { backgroundColor: colors.overlay }]}>
          <View style={[styles.avatarModalCard, { backgroundColor: colors.card }]}>
            <Text style={[styles.avatarModalTitle, { color: colors.textPrimary }]}>
              更换头像
            </Text>
            <Image
              source={{ uri: avatarPreviewUri }}
              style={styles.avatarPreview}
            />
            <Text style={[styles.avatarModalHint, { color: colors.textSecondary }]}>
              确认使用这张图片作为头像?
            </Text>
            <View style={styles.avatarModalActions}>
              <Pressable
                onPress={() => setAvatarPreviewVisible(false)}
                disabled={uploadingAvatar}
                style={[styles.cancelButton, { backgroundColor: colors.surface }]}
              >
                <Text
                  style={[styles.cancelText, { color: colors.textSecondary }]}
                >
                  取消
                </Text>
              </Pressable>
              <GradientButton
                title={uploadingAvatar ? '上传中…' : '确认更换'}
                onPress={() => void confirmAvatar()}
                disabled={uploadingAvatar}
                style={styles.confirmButton}
              />
            </View>
          </View>
        </View>
      </Modal>

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
  overlay: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.xl,
  },
  avatarModalCard: {
    width: '100%',
    maxWidth: 340,
    borderRadius: radius.xl,
    padding: spacing.xl,
    alignItems: 'center',
  },
  avatarModalTitle: {
    ...typography.heading,
    marginBottom: spacing.lg,
    alignSelf: 'flex-start',
  },
  avatarPreview: {
    width: 120,
    height: 120,
    borderRadius: 60,
    marginBottom: spacing.lg,
  },
  avatarModalHint: {
    ...typography.body,
    marginBottom: spacing.lg,
  },
  avatarModalActions: {
    flexDirection: 'row',
    gap: spacing.md,
    width: '100%',
  },
  cancelButton: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.lg,
    borderRadius: radius.xl,
  },
  cancelText: {
    ...typography.button,
  },
  confirmButton: {
    flex: 1,
  },
});
