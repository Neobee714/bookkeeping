import axios from 'axios';
import { useEffect, useMemo, useRef, useState } from 'react';

import { sendAgentMessage } from '@/api/agent';
import type { AgentChatMessage } from '@/types';

const examples = [
  '总结我最近六个月的开销',
  '去年我和伴侣总共花了多少',
  '列出最近三个月餐饮超过 100 的账单',
];

const MAX_HISTORY_MESSAGES = 40;

function AgentPage() {
  const [messages, setMessages] = useState<AgentChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const bottomRef = useRef<HTMLDivElement | null>(null);

  const canSend = useMemo(() => input.trim().length > 0 && !loading, [input, loading]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [messages, loading, error]);

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
                  className={`max-w-[82%] whitespace-pre-wrap rounded-2xl px-3.5 py-2.5 text-[14px] leading-6 ${
                    isUser
                      ? 'bg-[#007AFF] text-white'
                      : 'ios-glass text-[#1C1C1E]'
                  }`}
                >
                  {message.content}
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
