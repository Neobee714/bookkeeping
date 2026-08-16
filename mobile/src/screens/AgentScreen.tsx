import AsyncStorage from '@react-native-async-storage/async-storage';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { extractErrorMessage } from '../api/client';
import { sendAgentMessage } from '../api/agent';
import GradientView from '../components/GradientView';
import { useAuthStore } from '../store/authStore';
import { radius, spacing, typography, useTheme, type ThemeColors } from '../theme';
import type { AgentChatRole, AgentToolCallSummary } from '../types';

/**
 * 流金:AI 记账助手(FR-07)。
 *
 * 对话式记账:用户气泡为渐变底白字,AI 气泡为白卡片;
 * 本地维护历史上下文(每次最多携带最近 20 条),按用户持久化到 AsyncStorage;
 * AI 回复中若包含记账确认(如「已为您记一笔」)或调用过 create_transaction 工具,
 * 则渲染记账成功确认卡片;tool_calls 以标签形式展示。
 */
interface ChatMessage {
  id: string;
  role: AgentChatRole;
  content: string;
  toolCalls?: AgentToolCallSummary[];
}

const MAX_HISTORY_MESSAGES = 20;
const STORAGE_KEY_PREFIX = 'bookkeeping.agent.messages.v1';

const EXAMPLES = [
  '记一笔早餐 18 元',
  '总结我最近六个月的开销',
  '列出最近三个月餐饮超过 100 的账单',
];

/** 工具名 → 展示文案。 */
const TOOL_LABELS: Record<string, string> = {
  summarize_expenses: '汇总开销',
  category_breakdown: '分类分析',
  search_transactions: '查询账单',
  top_expenses: '大额支出',
  compare_expenses: '对比周期',
  create_transaction: '记一笔',
};

/** 工具 target → 展示文案。 */
const TARGET_LABELS: Record<string, string> = {
  self: '我的',
  partner: '伴侣',
  both: '双方',
};

/** AI 回复中常见的记账确认表述。 */
const CONFIRM_PATTERN = /已为您记一笔|已记录|记账成功|已添加|已记下|已入账/;

const getStorageKey = (userId: number | undefined): string | null =>
  userId ? `${STORAGE_KEY_PREFIX}.${userId}` : null;

const isChatMessage = (value: unknown): value is ChatMessage => {
  if (!value || typeof value !== 'object') {
    return false;
  }
  const candidate = value as Partial<ChatMessage>;
  return (
    (candidate.role === 'user' || candidate.role === 'assistant') &&
    typeof candidate.content === 'string'
  );
};

const isBookkeepingConfirm = (
  reply: string,
  toolCalls?: AgentToolCallSummary[],
): boolean =>
  !!toolCalls?.some((call) => call.name === 'create_transaction') ||
  CONFIRM_PATTERN.test(reply);

const formatToolCall = (call: AgentToolCallSummary): string => {
  const label = TOOL_LABELS[call.name] ?? call.name;
  const target = call.target ? TARGET_LABELS[call.target] : null;
  return target ? `${label} · ${target}` : label;
};

const nextId = (): string => `msg-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

/** 单条消息气泡(用户 = 渐变底白字;AI = 白卡片,可含确认卡片与工具标签)。 */
function MessageBubble({
  message,
  colors,
}: {
  message: ChatMessage;
  colors: ThemeColors;
}) {
  if (message.role === 'user') {
    return (
      <View style={styles.rowEnd}>
        <GradientView style={styles.userBubble}>
          <Text style={styles.userText}>{message.content}</Text>
        </GradientView>
      </View>
    );
  }

  const isConfirm = isBookkeepingConfirm(message.content, message.toolCalls);
  return (
    <View style={styles.rowStart}>
      <View
        style={[
          styles.aiBubble,
          { backgroundColor: colors.card, borderColor: colors.border },
          isConfirm && { borderColor: colors.primary },
        ]}
      >
        {isConfirm ? (
          <View style={[styles.confirmBadge, { backgroundColor: colors.primary }]}>
            <Text style={styles.confirmBadgeText}>✅ 记账成功</Text>
          </View>
        ) : null}
        <Text style={[styles.aiText, { color: colors.textPrimary }]}>
          {message.content}
        </Text>
        {message.toolCalls && message.toolCalls.length > 0 ? (
          <View style={styles.toolWrap}>
            {message.toolCalls.map((call, index) => (
              <View
                key={`${call.name}-${index}`}
                style={[styles.toolTag, { backgroundColor: colors.surface }]}
              >
                <Text style={[styles.toolTagText, { color: colors.textSecondary }]}>
                  {formatToolCall(call)}
                </Text>
              </View>
            ))}
          </View>
        ) : null}
      </View>
    </View>
  );
}

/** 流金:AI 记账助手(FR-07)。 */
export default function AgentScreen() {
  const colors = useTheme();
  const userId = useAuthStore((s) => s.user?.id);

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const listRef = useRef<FlatList<ChatMessage>>(null);

  const storageKey = useMemo(() => getStorageKey(userId), [userId]);

  // 进入页面/切换用户时从本地恢复历史。
  useEffect(() => {
    let cancelled = false;
    const key = getStorageKey(userId);
    if (!key) {
      setMessages([]);
      return;
    }
    AsyncStorage.getItem(key)
      .then((raw) => {
        if (cancelled || !raw) {
          return;
        }
        try {
          const parsed: unknown = JSON.parse(raw);
          if (Array.isArray(parsed)) {
            setMessages(parsed.filter(isChatMessage));
          }
        } catch {
          // 忽略损坏的本地数据
        }
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [userId]);

  // 历史按用户持久化。
  useEffect(() => {
    if (!storageKey) {
      return;
    }
    AsyncStorage.setItem(storageKey, JSON.stringify(messages)).catch(() => {});
  }, [messages, storageKey]);

  const scrollToEnd = () => listRef.current?.scrollToEnd({ animated: true });
  useEffect(() => {
    scrollToEnd();
  }, [messages, loading, error]);

  const canSend = input.trim().length > 0 && !loading;

  const sendMessage = async (text: string) => {
    const trimmed = text.trim();
    if (!trimmed || loading) {
      return;
    }

    const history = messages
      .slice(-MAX_HISTORY_MESSAGES)
      .map(({ role, content }) => ({ role, content }));

    setMessages((current) => [
      ...current,
      { id: nextId(), role: 'user', content: trimmed },
    ]);
    setInput('');
    setError('');
    setLoading(true);

    try {
      const response = await sendAgentMessage(trimmed, history);
      setMessages((current) => [
        ...current,
        {
          id: nextId(),
          role: 'assistant',
          content: response.reply,
          toolCalls: response.tool_calls,
        },
      ]);
    } catch (err) {
      setError(extractErrorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView
      style={[styles.safe, { backgroundColor: colors.background }]}
      edges={['top']}
    >
      <View style={styles.header}>
        <Text style={[styles.title, { color: colors.textPrimary }]}>流金</Text>
        <Text style={[styles.subtitle, { color: colors.textTertiary }]}>
          AI 记账助手
        </Text>
      </View>

      <FlatList
        ref={listRef}
        data={messages}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => <MessageBubble message={item} colors={colors} />}
        contentContainerStyle={styles.listContent}
        keyboardShouldPersistTaps="handled"
        onContentSizeChange={scrollToEnd}
        ListEmptyComponent={
          !loading && !error ? (
            <View style={styles.emptyWrap}>
              <Text style={styles.emptyEmoji}>✨</Text>
              <Text style={[styles.emptyTitle, { color: colors.textSecondary }]}>
                让 AI 帮你记账、查账、总结
              </Text>
              <Text style={[styles.emptyHint, { color: colors.textTertiary }]}>
                试试说:记一笔早餐 18 元
              </Text>
              <View style={styles.exampleWrap}>
                {EXAMPLES.map((example) => (
                  <Pressable
                    key={example}
                    disabled={loading}
                    onPress={() => void sendMessage(example)}
                    style={[styles.exampleChip, { backgroundColor: colors.surface }]}
                  >
                    <Text style={[styles.exampleText, { color: colors.primary }]}>
                      {example}
                    </Text>
                  </Pressable>
                ))}
              </View>
            </View>
          ) : undefined
        }
        ListFooterComponent={
          <>
            {loading ? (
              <View style={styles.rowStart}>
                <View style={[styles.aiBubble, { backgroundColor: colors.card }]}>
                  <ActivityIndicator size="small" color={colors.primary} />
                  <Text style={[styles.aiText, { color: colors.textSecondary }]}>
                    正在分析账单…
                  </Text>
                </View>
              </View>
            ) : null}
            {error ? (
              <View style={styles.rowStart}>
                <View style={[styles.aiBubble, { backgroundColor: colors.card }]}>
                  <Text style={[styles.errorText, { color: colors.expense }]}>
                    {error}
                  </Text>
                </View>
              </View>
            ) : null}
          </>
        }
      />

      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <View
          style={[
            styles.inputBar,
            { backgroundColor: colors.card, borderTopColor: colors.border },
          ]}
        >
          <TextInput
            value={input}
            onChangeText={setInput}
            editable={!loading}
            multiline
            maxLength={4000}
            placeholder="问问最近的开销…"
            placeholderTextColor={colors.textTertiary}
            style={[
              styles.input,
              { backgroundColor: colors.surface, color: colors.textPrimary },
            ]}
          />
          <Pressable
            disabled={!canSend}
            onPress={() => void sendMessage(input)}
            style={styles.sendWrap}
          >
            <GradientView style={[styles.sendButton, !canSend && styles.sendDisabled]}>
              <Text style={styles.sendText}>➤</Text>
            </GradientView>
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: spacing.md,
  },
  title: {
    ...typography.title,
  },
  subtitle: {
    ...typography.caption,
  },
  listContent: {
    flexGrow: 1,
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.lg,
  },
  rowStart: {
    flexDirection: 'row',
    justifyContent: 'flex-start',
    marginVertical: spacing.xs,
  },
  rowEnd: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    marginVertical: spacing.xs,
  },
  userBubble: {
    maxWidth: '82%',
    borderRadius: radius.lg,
    paddingVertical: spacing.sm + 2,
    paddingHorizontal: spacing.lg,
  },
  userText: {
    color: '#FFFFFF',
    fontSize: 15,
    lineHeight: 22,
  },
  aiBubble: {
    maxWidth: '82%',
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    paddingVertical: spacing.sm + 2,
    paddingHorizontal: spacing.lg,
  },
  aiText: {
    fontSize: 15,
    lineHeight: 22,
  },
  errorText: {
    fontSize: 13,
    lineHeight: 20,
  },
  confirmBadge: {
    alignSelf: 'flex-start',
    borderRadius: radius.fab,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    marginBottom: spacing.sm,
  },
  confirmBadgeText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '600',
  },
  toolWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    marginTop: spacing.sm,
  },
  toolTag: {
    borderRadius: radius.fab,
    paddingHorizontal: spacing.sm,
    paddingVertical: 3,
  },
  toolTagText: {
    fontSize: 11,
  },
  emptyWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.xxl,
    paddingHorizontal: spacing.lg,
  },
  emptyEmoji: {
    fontSize: 44,
    marginBottom: spacing.md,
  },
  emptyTitle: {
    fontSize: 15,
    fontWeight: '600',
    marginBottom: spacing.xs,
  },
  emptyHint: {
    fontSize: 13,
    marginBottom: spacing.lg,
  },
  exampleWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: spacing.sm,
  },
  exampleChip: {
    borderRadius: radius.fab,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  exampleText: {
    fontSize: 12,
    fontWeight: '500',
  },
  inputBar: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingTop: spacing.sm,
    paddingBottom: spacing.md,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  input: {
    flex: 1,
    minHeight: 40,
    maxHeight: 100,
    borderRadius: radius.lg,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    fontSize: 15,
    textAlignVertical: 'top',
  },
  sendWrap: {
    width: 44,
    height: 44,
    borderRadius: 22,
  },
  sendButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendDisabled: {
    opacity: 0.4,
  },
  sendText: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '700',
  },
});
