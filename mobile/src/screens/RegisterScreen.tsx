import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import React, { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import * as authApi from '../api/auth';
import { extractErrorMessage } from '../api/client';
import AuthLayout from '../components/AuthLayout';
import type { RootStackParamList } from '../navigation/types';
import { gradient, spacing, typography } from '../theme';

type Props = NativeStackScreenProps<RootStackParamList, 'Register'>;

/**
 * 注册页(FR-01)。
 * 后端注册只返回 user、不签发 token,因此成功后跳回登录页(与 Web 行为对齐)。
 */
export default function RegisterScreen({ navigation }: Props) {
  const [username, setUsername] = useState('');
  const [nickname, setNickname] = useState('');
  const [password, setPassword] = useState('');
  const [regInviteCode, setRegInviteCode] = useState('');
  const [partnerCode, setPartnerCode] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [successMessage, setSuccessMessage] = useState('');

  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(
    () => () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
      }
    },
    [],
  );

  const handleRegister = async () => {
    if (submitting) {
      return;
    }
    const name = username.trim();
    const nick = nickname.trim();
    const code = regInviteCode.trim();
    const partner = partnerCode.trim();

    if (name.length < 3) {
      setErrorMessage('用户名至少 3 个字符');
      return;
    }
    if (!nick || nick.length > 50) {
      setErrorMessage('昵称需为 1-50 个字符');
      return;
    }
    if (password.length < 6) {
      setErrorMessage('密码至少 6 位');
      return;
    }
    if (!code || code.length > 32) {
      setErrorMessage('请输入注册邀请码(1-32 字符)');
      return;
    }

    setSubmitting(true);
    setErrorMessage('');
    setSuccessMessage('');
    try {
      await authApi.register({
        username: name,
        nickname: nick,
        password,
        reg_invite_code: code,
        partner_code: partner || undefined,
      });
      setSuccessMessage('注册成功,正在前往登录…');
      timerRef.current = setTimeout(() => {
        navigation.navigate('Login');
      }, 800);
    } catch (error) {
      setErrorMessage(extractErrorMessage(error, '注册失败,请重试'));
    } finally {
      setSubmitting(false);
    }
  };

  const disabled = submitting || successMessage.length > 0;

  return (
    <AuthLayout
      emoji="📝"
      title="创建账号"
      subtitle="填写信息后即可开始记账"
    >
      <Field
        icon="👤"
        placeholder="用户名(至少 3 个字符)"
        value={username}
        onChangeText={setUsername}
        editable={!disabled}
        autoCapitalize="none"
      />
      <Field
        icon="🏷️"
        placeholder="昵称"
        value={nickname}
        onChangeText={setNickname}
        editable={!disabled}
      />
      <Field
        icon="🔒"
        placeholder="密码(至少 6 位)"
        value={password}
        onChangeText={setPassword}
        editable={!disabled}
        secureTextEntry
      />
      <Field
        icon="🎟️"
        placeholder="注册邀请码(必填)"
        value={regInviteCode}
        onChangeText={setRegInviteCode}
        editable={!disabled}
        autoCapitalize="characters"
      />

      <View style={styles.sectionDivider}>
        <Text style={styles.sectionTitle}>伴侣绑定(可选)</Text>
        <Text style={styles.sectionHint}>注册后也可在「我的」页面再绑定</Text>
      </View>

      <Field
        icon="💞"
        placeholder="伴侣绑定码(可留空)"
        value={partnerCode}
        onChangeText={setPartnerCode}
        editable={!disabled}
        autoCapitalize="characters"
      />

      {errorMessage ? (
        <View style={styles.errorBox}>
          <Text style={styles.errorText}>{errorMessage}</Text>
        </View>
      ) : null}
      {successMessage ? (
        <View style={styles.successBox}>
          <Text style={styles.successText}>{successMessage}</Text>
        </View>
      ) : null}

      <Pressable
        disabled={disabled}
        onPress={() => void handleRegister()}
        style={({ pressed }) => [
          styles.submitButton,
          pressed && styles.submitPressed,
          disabled && styles.submitDisabled,
        ]}
      >
        {submitting ? (
          <ActivityIndicator color={gradient.start} />
        ) : (
          <Text style={styles.submitText}>注 册</Text>
        )}
      </Pressable>

      <Pressable
        onPress={() => navigation.goBack()}
        disabled={disabled}
        style={styles.linkWrap}
      >
        <Text style={styles.linkText}>
          已有账号?<Text style={styles.linkStrong}>返回登录</Text>
        </Text>
      </Pressable>
    </AuthLayout>
  );
}

interface FieldProps {
  icon: string;
  placeholder: string;
  value: string;
  onChangeText: (text: string) => void;
  secureTextEntry?: boolean;
  autoCapitalize?: 'none' | 'sentences' | 'words' | 'characters';
  editable?: boolean;
}

function Field({
  icon,
  placeholder,
  value,
  onChangeText,
  secureTextEntry = false,
  autoCapitalize = 'none',
  editable = true,
}: FieldProps) {
  return (
    <View style={styles.field}>
      <Text style={styles.fieldIcon}>{icon}</Text>
      <TextInput
        style={styles.input}
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor="rgba(255, 255, 255, 0.68)"
        secureTextEntry={secureTextEntry}
        autoCapitalize={autoCapitalize}
        autoCorrect={false}
        editable={editable}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  field: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: 'rgba(255, 255, 255, 0.22)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.38)',
    borderRadius: 16,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.lg,
  },
  fieldIcon: {
    fontSize: 16,
  },
  input: {
    flex: 1,
    color: '#FFFFFF',
    fontSize: 15,
    padding: 0,
  },
  sectionDivider: {
    borderTopWidth: 1,
    borderTopColor: 'rgba(255, 255, 255, 0.3)',
    borderStyle: 'dashed',
    paddingTop: spacing.lg,
    gap: spacing.xs,
  },
  sectionTitle: {
    fontSize: 12,
    fontWeight: '600',
    color: 'rgba(255, 255, 255, 0.92)',
  },
  sectionHint: {
    fontSize: 12,
    color: 'rgba(255, 255, 255, 0.6)',
  },
  errorBox: {
    backgroundColor: 'rgba(255, 255, 255, 0.15)',
    borderRadius: 12,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  errorText: {
    color: '#FFE4EC',
    fontSize: 13,
  },
  successBox: {
    backgroundColor: 'rgba(255, 255, 255, 0.15)',
    borderRadius: 12,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  successText: {
    color: '#D8FFE4',
    fontSize: 13,
  },
  submitButton: {
    marginTop: spacing.xs,
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    paddingVertical: spacing.lg,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: gradient.start,
    shadowOpacity: 0.35,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 8 },
    elevation: 8,
  },
  submitPressed: {
    opacity: 0.88,
  },
  submitDisabled: {
    opacity: 0.7,
  },
  submitText: {
    ...typography.button,
    color: gradient.start,
    fontWeight: '700',
    letterSpacing: 6,
  },
  linkWrap: {
    alignItems: 'center',
  },
  linkText: {
    fontSize: 14,
    color: 'rgba(255, 255, 255, 0.85)',
  },
  linkStrong: {
    color: '#FFFFFF',
    fontWeight: '700',
    textDecorationLine: 'underline',
  },
});
