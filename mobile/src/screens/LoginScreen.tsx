import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import React, { useState } from 'react';
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
import { useAuthStore } from '../store/authStore';
import { gradient, spacing, typography } from '../theme';

type Props = NativeStackScreenProps<RootStackParamList, 'Login'>;

/** 登录页(FR-01):用户名 + 密码,调真实 API,成功后写入登录态自动进入主界面。 */
export default function LoginScreen({ navigation }: Props) {
  const login = useAuthStore((s) => s.login);

  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  const handleLogin = async () => {
    if (submitting) {
      return;
    }
    const name = username.trim();
    if (!name) {
      setErrorMessage('请输入用户名');
      return;
    }
    if (!password) {
      setErrorMessage('请输入密码');
      return;
    }

    setSubmitting(true);
    setErrorMessage('');
    try {
      const data = await authApi.login(name, password);
      await login({
        accessToken: data.access_token,
        refreshToken: data.refresh_token,
        user: data.user,
      });
      // 登录态写入后 RootGate 会自动切换到主 Tab,无需手动导航
    } catch (error) {
      setErrorMessage(extractErrorMessage(error, '登录失败,请重试'));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <AuthLayout
      emoji="🧾"
      title="时光"
      subtitle="登录后与 TA 一起管好每一笔"
    >
      <View style={styles.field}>
        <Text style={styles.fieldIcon}>👤</Text>
        <TextInput
          style={styles.input}
          value={username}
          onChangeText={setUsername}
          placeholder="请输入用户名"
          placeholderTextColor="rgba(255, 255, 255, 0.68)"
          autoCapitalize="none"
          autoCorrect={false}
          returnKeyType="next"
          editable={!submitting}
        />
      </View>

      <View style={styles.field}>
        <Text style={styles.fieldIcon}>🔒</Text>
        <TextInput
          style={styles.input}
          value={password}
          onChangeText={setPassword}
          placeholder="请输入密码"
          placeholderTextColor="rgba(255, 255, 255, 0.68)"
          secureTextEntry
          returnKeyType="done"
          onSubmitEditing={() => void handleLogin()}
          editable={!submitting}
        />
      </View>

      {errorMessage ? (
        <View style={styles.errorBox}>
          <Text style={styles.errorText}>{errorMessage}</Text>
        </View>
      ) : null}

      <Pressable
        disabled={submitting}
        onPress={() => void handleLogin()}
        style={({ pressed }) => [
          styles.submitButton,
          pressed && styles.submitPressed,
          submitting && styles.submitDisabled,
        ]}
      >
        {submitting ? (
          <ActivityIndicator color={gradient.start} />
        ) : (
          <Text style={styles.submitText}>登 录</Text>
        )}
      </Pressable>

      <Pressable
        onPress={() => navigation.navigate('Register')}
        disabled={submitting}
        style={styles.linkWrap}
      >
        <Text style={styles.linkText}>
          还没有账号?<Text style={styles.linkStrong}>去注册</Text>
        </Text>
      </Pressable>
    </AuthLayout>
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
