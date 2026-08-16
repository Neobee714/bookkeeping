import type {
  AdminUser,
  ApiResponse,
  Circle,
  CircleApplication,
  CircleApplicationCreatePayload,
  CircleApplicationReviewPayload,
  CircleComment,
  CircleCommentCreatePayload,
  CircleCreatePayload,
  CircleInviteCode,
  CircleOverview,
  CirclePost,
  CirclePostCreatePayload,
  CirclePostPage,
  CircleRatePayload,
  CircleRating,
  JoinedCircle,
} from '../types';
import client, { unwrap } from './client';

/**
 * 双人圈子 API。
 *
 * 注意:后端 circles 路由挂载在 `/api/v1` 前缀下(见 backend/app/main.py),
 * 因此这里统一使用 `/api/v1/circles` 与 `/api/v1/posts`。
 */

const CIRCLES_BASE = '/api/v1/circles';

export const listCircles = async (): Promise<Circle[]> => {
  const response = await client.get<ApiResponse<Circle[]>>(CIRCLES_BASE);
  return unwrap(response.data);
};

export const listAllCircles = async (): Promise<CircleOverview[]> => {
  const response = await client.get<ApiResponse<CircleOverview[]>>(
    `${CIRCLES_BASE}/all`,
  );
  return unwrap(response.data);
};

export const getCircleDetail = async (circleId: number): Promise<Circle> => {
  const response = await client.get<ApiResponse<Circle>>(
    `${CIRCLES_BASE}/${circleId}`,
  );
  return unwrap(response.data);
};

export const createCircle = async (
  payload: CircleCreatePayload,
): Promise<Circle> => {
  const response = await client.post<ApiResponse<Circle>>(
    CIRCLES_BASE,
    payload,
  );
  return unwrap(response.data);
};

export const getCircleInvite = async (
  circleId: number,
): Promise<CircleInviteCode | null> => {
  const response = await client.get<ApiResponse<CircleInviteCode | null>>(
    `${CIRCLES_BASE}/${circleId}/invite`,
  );
  return unwrap(response.data);
};

export const createCircleInvite = async (
  circleId: number,
): Promise<CircleInviteCode> => {
  const response = await client.post<ApiResponse<CircleInviteCode>>(
    `${CIRCLES_BASE}/${circleId}/invite`,
  );
  return unwrap(response.data);
};

export const joinCircle = async (code: string): Promise<Circle> => {
  const response = await client.post<ApiResponse<Circle>>(
    `${CIRCLES_BASE}/join`,
    { code },
  );
  return unwrap(response.data);
};

export const leaveCircle = async (
  circleId: number,
): Promise<{ circle_id: number }> => {
  const response = await client.delete<ApiResponse<{ circle_id: number }>>(
    `${CIRCLES_BASE}/${circleId}/leave`,
  );
  return unwrap(response.data);
};

export const applyCreateCircle = async (
  payload: CircleApplicationCreatePayload,
): Promise<CircleApplication> => {
  const response = await client.post<ApiResponse<CircleApplication>>(
    `${CIRCLES_BASE}/apply-create`,
    payload,
  );
  return unwrap(response.data);
};

export const getMyApplication = async (): Promise<CircleApplication | null> => {
  const response = await client.get<ApiResponse<CircleApplication | null>>(
    `${CIRCLES_BASE}/my-application`,
  );
  return unwrap(response.data);
};

export const deleteMyApplication = async (): Promise<{ id: number }> => {
  const response = await client.delete<ApiResponse<{ id: number }>>(
    `${CIRCLES_BASE}/my-application`,
  );
  return unwrap(response.data);
};

export const listCircleApplications = async (
  status: 'pending' | 'approved' | 'rejected' = 'pending',
): Promise<CircleApplication[]> => {
  const response = await client.get<ApiResponse<{ items: CircleApplication[] }>>(
    `${CIRCLES_BASE}/applications`,
    { params: { status } },
  );
  return unwrap(response.data).items;
};

export const reviewCircleApplication = async (
  applicationId: number,
  action: CircleApplicationReviewPayload['action'],
): Promise<CircleApplication> => {
  const response = await client.put<ApiResponse<CircleApplication>>(
    `${CIRCLES_BASE}/applications/${applicationId}/review`,
    { action },
  );
  return unwrap(response.data);
};

export const getAdminPendingCount = async (): Promise<number> => {
  const response = await client.get<ApiResponse<{ pending_count: number }>>(
    `${CIRCLES_BASE}/applications/pending-count`,
  );
  return unwrap(response.data).pending_count;
};

export const listCirclePosts = async (
  circleId: number,
  page = 1,
  pageSize = 20,
): Promise<CirclePostPage> => {
  const response = await client.get<ApiResponse<CirclePostPage>>(
    `${CIRCLES_BASE}/${circleId}/posts`,
    { params: { page, page_size: pageSize } },
  );
  return unwrap(response.data);
};

export const createPost = async (
  circleId: number,
  payload: CirclePostCreatePayload,
): Promise<CirclePost> => {
  const response = await client.post<ApiResponse<CirclePost>>(
    `${CIRCLES_BASE}/${circleId}/posts`,
    payload,
  );
  return unwrap(response.data);
};

export const deletePost = async (
  circleId: number,
  postId: number,
): Promise<{ id: number }> => {
  const response = await client.delete<ApiResponse<{ id: number }>>(
    `${CIRCLES_BASE}/${circleId}/posts/${postId}`,
  );
  return unwrap(response.data);
};

export const ratePost = async (
  postId: number,
  score: CircleRatePayload['score'],
): Promise<CircleRating> => {
  const response = await client.post<ApiResponse<CircleRating>>(
    `/api/v1/posts/${postId}/rate`,
    { score },
  );
  return unwrap(response.data);
};

export const listPostRatings = async (
  postId: number,
): Promise<CircleRating[]> => {
  const response = await client.get<ApiResponse<CircleRating[]>>(
    `/api/v1/posts/${postId}/ratings`,
  );
  return unwrap(response.data);
};

export const listPostComments = async (
  postId: number,
): Promise<CircleComment[]> => {
  const response = await client.get<ApiResponse<CircleComment[]>>(
    `/api/v1/posts/${postId}/comments`,
  );
  return unwrap(response.data);
};

export const createPostComment = async (
  postId: number,
  content: CircleCommentCreatePayload['content'],
): Promise<CircleComment> => {
  const response = await client.post<ApiResponse<CircleComment>>(
    `/api/v1/posts/${postId}/comments`,
    { content },
  );
  return unwrap(response.data);
};

export const deleteComment = async (
  commentId: number,
): Promise<{ id: number }> => {
  const response = await client.delete<ApiResponse<{ id: number }>>(
    `/api/v1/comments/${commentId}`,
  );
  return unwrap(response.data);
};

/** 管理后台:用户列表(含圈子信息)。 */
export const getAdminUsers = async (): Promise<
  Array<AdminUser & { joined_circle: JoinedCircle }>
> => {
  const response = await client.get<
    ApiResponse<Array<AdminUser & { joined_circle: JoinedCircle }>>
  >('/api/v1/users');
  return unwrap(response.data);
};

/** 管理后台:将用户移出圈子(仅管理员)。 */
export const removeCircleMember = async (
  circleId: number,
  userId: number,
): Promise<{ circle_id: number; user_id: number }> => {
  const response = await client.delete<
    ApiResponse<{ circle_id: number; user_id: number }>
  >(`${CIRCLES_BASE}/${circleId}/members/${userId}`);
  return unwrap(response.data);
};
