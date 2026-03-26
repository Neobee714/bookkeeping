import client from '@/api/client';
import type {
  ApiResponse,
  Circle,
  CircleComment,
  CircleInviteCode,
  CirclePost,
  CirclePostPage,
  CircleRating,
} from '@/types';

const assertSuccess = <T>(response: ApiResponse<T>): T => {
  if (!response.success) {
    throw new Error(response.message || '请求失败');
  }
  return response.data;
};

export const getMyCircles = async (): Promise<Circle[]> => {
  const response = await client.get<ApiResponse<Circle[]>>('/api/v1/circles');
  return assertSuccess(response.data);
};

export const createCircle = async (
  name: string,
  description?: string,
): Promise<Circle> => {
  const response = await client.post<ApiResponse<Circle>>('/api/v1/circles', {
    name,
    description,
  });
  return assertSuccess(response.data);
};

export const getCirclePosts = async (
  circleId: number,
  page = 1,
  pageSize = 20,
): Promise<CirclePostPage> => {
  const response = await client.get<ApiResponse<CirclePostPage>>(
    `/api/v1/circles/${circleId}/posts`,
    {
      params: {
        page,
        page_size: pageSize,
      },
    },
  );
  return assertSuccess(response.data);
};

export const createPost = async (
  circleId: number,
  content?: string,
  image?: string,
): Promise<CirclePost> => {
  const response = await client.post<ApiResponse<CirclePost>>(
    `/api/v1/circles/${circleId}/posts`,
    {
      content,
      image,
    },
  );
  return assertSuccess(response.data);
};

export const deletePost = async (
  circleId: number,
  postId: number,
): Promise<{ id: number }> => {
  const response = await client.delete<ApiResponse<{ id: number }>>(
    `/api/v1/circles/${circleId}/posts/${postId}`,
  );
  return assertSuccess(response.data);
};

export const ratePost = async (
  postId: number,
  score: number,
): Promise<CircleRating> => {
  const response = await client.post<ApiResponse<CircleRating>>(
    `/api/v1/posts/${postId}/rate`,
    { score },
  );
  return assertSuccess(response.data);
};

export const getPostComments = async (
  postId: number,
): Promise<CircleComment[]> => {
  const response = await client.get<ApiResponse<CircleComment[]>>(
    `/api/v1/posts/${postId}/comments`,
  );
  return assertSuccess(response.data);
};

export const addComment = async (
  postId: number,
  content: string,
): Promise<CircleComment> => {
  const response = await client.post<ApiResponse<CircleComment>>(
    `/api/v1/posts/${postId}/comments`,
    { content },
  );
  return assertSuccess(response.data);
};

export const deleteComment = async (
  commentId: number,
): Promise<{ id: number }> => {
  const response = await client.delete<ApiResponse<{ id: number }>>(
    `/api/v1/comments/${commentId}`,
  );
  return assertSuccess(response.data);
};

export const generateInviteCode = async (
  circleId: number,
): Promise<CircleInviteCode> => {
  const response = await client.post<ApiResponse<CircleInviteCode>>(
    `/api/v1/circles/${circleId}/invite`,
  );
  return assertSuccess(response.data);
};

export const joinCircle = async (code: string): Promise<Circle> => {
  const response = await client.post<ApiResponse<Circle>>('/api/v1/circles/join', {
    code,
  });
  return assertSuccess(response.data);
};
