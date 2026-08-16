import type { AgentChatMessage, AgentChatResponse, ApiResponse } from '../types';
import client, { unwrap } from './client';

/** 发送 AI 记账助手消息(带历史上下文)。 */
export const sendAgentMessage = async (
  message: string,
  history: AgentChatMessage[],
): Promise<AgentChatResponse> => {
  const response = await client.post<ApiResponse<AgentChatResponse>>(
    '/agent/chat',
    { message, history },
  );
  return unwrap(response.data);
};
