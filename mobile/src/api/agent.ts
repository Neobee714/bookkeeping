import type { AgentChatMessage, AgentChatResponse, ApiResponse } from '../types';
import { AGENT_TIMEOUT_MS } from '../config';
import client, { unwrap } from './client';

/** 发送 AI 记账助手消息(带历史上下文)。 */
export const sendAgentMessage = async (
  message: string,
  history: AgentChatMessage[],
): Promise<AgentChatResponse> => {
  const response = await client.post<ApiResponse<AgentChatResponse>>(
    '/agent/chat',
    { message, history },
    { timeout: AGENT_TIMEOUT_MS },
  );
  return unwrap(response.data);
};
