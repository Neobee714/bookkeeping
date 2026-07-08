import axios from 'axios';
import { useEffect, useMemo, useRef, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

import { sendAgentMessage } from '@/api/agent';
import { useAuthStore } from '@/store/authStore';
import type { AgentChatMessage } from '@/types';

const examples = [
  '总结我最近六个月的开销',
  '去年我和伴侣总共花了多少',
  '列出最近三个月餐饮超过 100 的账单',
];

const MAX_HISTORY_MESSAGES = 40;
const STORAGE_KEY_PREFIX = 'bookkeeping.agent.messages.v1';

const isAgentChatMessage = (value: unknown): value is AgentChatMessage => {
  if (!value || typeof value !== 'object') {
    return false;
  }
  const candidate = value as Partial<AgentChatMessage>;
  return (
    (candidate.role === 'user' || candidate.role === 'assistant') &&
    typeof candidate.content === 'string'
  );
};

const getStorageKey = (userId: number | undefined): string | null =>
  userId ? `${STORAGE_KEY_PREFIX}.${userId}` : null;

const readStoredMessages = (userId: number | undefined): AgentChatMessage[] => {
  const storageKey = getStorageKey(userId);
  if (!storageKey) {
    return [];
  }

  try {
    const raw = sessionStorage.getItem(storageKey);
    if (!raw) {
      return [];
    }
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) && parsed.every(isAgentChatMessage) ? parsed : [];
  } catch {
    return [];
  }
};

function AssistantMessage({ content }: { content: string }) {
  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      components={{
        h1: ({ children }) => (
          <h2 className="mb-2 mt-1 text-[18px] font-bold leading-7 text-[#1C1C1E]">
            {children}
          </h2>
        ),
        h2: ({ children }) => (
          <h3 className="mb-2 mt-1 text-[16px] font-bold leading-7 text-[#1C1C1E]">
            {children}
          </h3>
        ),
        h3: ({ children }) => (
          <h4 className="mb-2 mt-1 text-[15px] font-bold leading-6 text-[#1C1C1E]">
            {children}
          </h4>
        ),
        p: ({ children }) => <p className="my-2 first:mt-0 last:mb-0">{children}</p>,
        strong: ({ children }) => (
          <strong className="font-semibold text-[#111827]">{children}</strong>
        ),
        ul: ({ children }) => (
          <ul className="my-2 list-disc space-y-1 pl-5">{children}</ul>
        ),
        ol: ({ children }) => (
          <ol className="my-2 list-decimal space-y-1 pl-5">{children}</ol>
        ),
        table: ({ children }) => (
          <div className="my-3 overflow-x-auto rounded-xl border border-[rgba(60,60,67,0.16)]">
            <table className="min-w-full border-collapse text-left text-[13px]">
              {children}
            </table>
          </div>
        ),
        th: ({ children }) => (
          <th className="border-b border-[rgba(60,60,67,0.14)] bg-[rgba(0,122,255,0.08)] px-3 py-2 font-semibold text-[#1C1C1E]">
            {children}
          </th>
        ),
        td: ({ children }) => (
          <td className="border-b border-[rgba(60,60,67,0.1)] px-3 py-2 text-[#1C1C1E] last:border-b-0">
            {children}
          </td>
        ),
        code: ({ children }) => (
          <code className="rounded-md bg-[rgba(60,60,67,0.12)] px-1.5 py-0.5 text-[12px]">
            {children}
          </code>
        ),
      }}
    >
      {content}
    </ReactMarkdown>
  );
}

function AgentPage() {
  const user = useAuthStore((state) => state.user);
  const userId = user?.id;
  const storageKey = useMemo(() => getStorageKey(userId), [userId]);
  const [messages, setMessages] = useState<AgentChatMessage[]>(() =>
    readStoredMessages(userId),
  );
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const bottomRef = useRef<HTMLDivElement | null>(null);

  const canSend = useMemo(() => input.trim().length > 0 && !loading, [input, loading]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [messages, loading, error]);

  useEffect(() => {
    setMessages(readStoredMessages(userId));
    setError('');
  }, [userId]);

  useEffect(() => {
    if (!storageKey) {
      return;
    }

    try {
      sessionStorage.setItem(storageKey, JSON.stringify(messages));
    } catch {
      // Ignore storage failures so chat remains usable in restricted browsers.
    }
  }, [messages, storageKey]);

  const sendMessage = async (text: string) => {
    const trimmed = text.trim();
    if (!trimmed || loading) {
      return;
    }

    const history = messages.slice(-MAX_HISTORY_MESSAGES);
    const userMessage: AgentChatMessage = { role: 'user', content: trimmed };
    setMessages((current) => [...current, userMessage]);
    setInput('');
    setError('');
    setLoading(true);

    try {
      const response = await sendAgentMessage(trimmed, history);
      setMessages((current) => [
        ...current,
        { role: 'assistant', content: response.reply },
      ]);
    } catch (err) {
      const message = axios.isAxiosError(err)
        ? err.response?.data?.message ?? 'AI 助手暂时不可用'
        : err instanceof Error
          ? err.message
          : 'AI 助手暂时不可用';
      setError(message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <section className="flex h-[calc(100vh-9rem)] min-h-0 flex-col pb-2">
      <h1 className="ios-anim mb-3 mt-2 text-[34px] font-bold tracking-tight text-[#1C1C1E]">
        AI 助手
      </h1>

      <div className="ios-glass ios-anim ios-anim-d1 mb-3 p-3">
        <div className="flex flex-wrap gap-2">
          {examples.map((example) => (
            <button
              key={example}
              type="button"
              onClick={() => void sendMessage(example)}
              className="rounded-full bg-[rgba(0,122,255,0.1)] px-3 py-1.5 text-[12px] font-medium text-[#007AFF]"
              disabled={loading}
            >
              {example}
            </button>
          ))}
        </div>
      </div>

      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto">
        {messages.length === 0 ? (
          <div className="ios-glass ios-anim ios-anim-d2 px-4 py-10 text-center text-sm text-[#8E8E93]">
            可以问我开销总结、分类排行、伴侣账单和具体明细。
          </div>
        ) : (
          messages.map((message, index) => {
            const isUser = message.role === 'user';
            return (
              <div
                key={`${message.role}-${index}`}
                className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}
              >
                <div
                  className={`max-w-[82%] rounded-2xl px-3.5 py-2.5 text-[14px] leading-6 ${
                    isUser
                      ? 'whitespace-pre-wrap bg-[#007AFF] text-white'
                      : 'ios-glass text-[#1C1C1E]'
                  }`}
                >
                  {isUser ? message.content : <AssistantMessage content={message.content} />}
                </div>
              </div>
            );
          })
        )}

        {loading && (
          <div className="flex justify-start">
            <div className="ios-glass rounded-2xl px-3.5 py-2.5 text-[14px] text-[#8E8E93]">
              正在分析账单...
            </div>
          </div>
        )}

        {error && (
          <div className="ios-glass rounded-2xl px-3.5 py-2.5 text-[13px] text-[#FF3B30]">
            {error}
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      <form
        className="ios-glass ios-glass-strong mt-3 flex items-end gap-2 p-2"
        onSubmit={(event) => {
          event.preventDefault();
          void sendMessage(input);
        }}
      >
        <textarea
          value={input}
          onChange={(event) => setInput(event.target.value)}
          rows={1}
          aria-label="输入给 AI 助手的问题"
          placeholder="问问最近的开销..."
          className="max-h-28 min-h-[40px] flex-1 resize-none bg-transparent px-2 py-2 text-[15px] text-[#1C1C1E] outline-none placeholder:text-[#8E8E93]"
        />
        <button
          type="submit"
          disabled={!canSend}
          className="h-10 rounded-full bg-[#007AFF] px-4 text-[14px] font-semibold text-white disabled:opacity-40"
        >
          发送
        </button>
      </form>
    </section>
  );
}

export default AgentPage;
