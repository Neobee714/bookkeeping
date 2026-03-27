import client from '@/api/client';
import type {
  ApiResponse,
  Circle,
  CircleApplication,
  CircleApplicationStatus,
  CircleComment,
  CircleInviteCode,
  CircleOverview,
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

export const getAllCircles = async (): Promise<CircleOverview[]> => {
  const response = await client.get<ApiResponse<CircleOverview[]>>('/api/v1/circles/all');
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

export const leaveCircle = async (
  circleId: number,
): Promise<{ circle_id: number }> => {
  const response = await client.delete<ApiResponse<{ circle_id: number }>>(
    `/api/v1/circles/${circleId}/leave`,
  );
  return assertSuccess(response.data);
};

export const applyCreateCircle = async (
  circleName: string,
  circleDescription?: string,
  message?: string,
): Promise<CircleApplication> => {
  const response = await client.post<ApiResponse<CircleApplication>>(
    '/api/v1/circles/apply-create',
    {
      circle_name: circleName,
      circle_description: circleDescription,
      message,
    },
  );
  return assertSuccess(response.data);
};

export const getMyApplication = async (): Promise<CircleApplication | null> => {
  const response = await client.get<ApiResponse<CircleApplication | null>>(
    '/api/v1/circles/my-application',
  );
  return assertSuccess(response.data);
};

export const deleteMyApplication = async (): Promise<{ id: number }> => {
  const response = await client.delete<ApiResponse<{ id: number }>>(
    '/api/v1/circles/my-application',
  );
  return assertSuccess(response.data);
};

export const getApplications = async (
  status?: CircleApplicationStatus | 'all',
): Promise<CircleApplication[]> => {
  const response = await client.get<ApiResponse<{ items: CircleApplication[] }>>(
    '/api/v1/circles/applications',
    {
      params: status ? { status } : undefined,
    },
  );
  return assertSuccess(response.data).items;
};

export const reviewApplication = async (
  applicationId: number,
  action: 'approve' | 'reject',
): Promise<CircleApplication> => {
  const response = await client.put<ApiResponse<CircleApplication>>(
    `/api/v1/circles/applications/${applicationId}/review`,
    { action },
  );
  return assertSuccess(response.data);
};

export const getAdminPendingCount = async (): Promise<number> => {
  const response = await client.get<ApiResponse<{ pending_count: number }>>(
    '/api/v1/circles/applications/pending-count',
  );
  return assertSuccess(response.data).pending_count;
};
