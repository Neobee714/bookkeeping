import client from '@/api/client';
import type {
  AgentChatMessage,
  AgentChatResponse,
  ApiResponse,
} from '@/types';

const assertSuccess = <T>(response: ApiResponse<T>): T => {
  if (!response.success) {
    throw new Error(response.message || '请求失败');
  }
  return response.data;
};

export const sendAgentMessage = async (
  message: string,
  history: AgentChatMessage[],
): Promise<AgentChatResponse> => {
  const response = await client.post<ApiResponse<AgentChatResponse>>('/agent/chat', {
    message,
    history,
  });
  return assertSuccess(response.data);
};
