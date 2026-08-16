/**
 * 与后端对齐的客户端类型定义。
 *
 * 以 Web 端 `frontend/src/types/index.ts` 为基准平移,并补充圈子
 * (Circle/Post/Rating/Comment/Application)相关类型。
 * 后端字段以 backend/app 的 schema 与 routers 序列化结果为准。
 */

// ---------- 通用 ----------

export type TransactionType = 'income' | 'expense';

export type Category = string;

/** 后端统一响应包裹结构。 */
export interface ApiResponse<T> {
  success: boolean;
  data: T;
  message: string;
}

// ---------- 用户 ----------

export interface Partner {
  id: number;
  username: string;
  nickname: string;
  avatar?: string | null;
}

export interface UserSummary {
  id: number;
  username: string;
  nickname: string;
  avatar?: string | null;
  created_at?: string | null;
}

export interface User {
  id: number;
  username: string;
  nickname: string;
  avatar?: string | null;
  is_admin: boolean;
  partner_id: number | null;
  partner: Partner | null;
  partner_code: string;
  reg_invite_code: string;
  created_at: string;
}

export interface AdminUser {
  id: number;
  username: string;
  nickname: string;
  avatar?: string | null;
  is_admin: boolean;
  created_at: string;
}

// ---------- 认证 ----------

export interface AuthTokenData {
  access_token: string;
  refresh_token: string;
  token_type: 'bearer';
  user: User;
}

export interface RefreshTokenData {
  access_token: string;
  refresh_token: string;
  token_type: 'bearer';
}

export interface LoginPayload {
  username: string;
  password: string;
}

export interface RegisterPayload {
  username: string;
  nickname: string;
  password: string;
  reg_invite_code: string;
  partner_code?: string | null;
  invite_code?: string | null;
}

/** 注册响应:后端只返回 user(不签发 token),见 API-REFERENCE 5.1。 */
export interface RegisterResult {
  user: User;
}

// ---------- 交易 ----------

export interface Transaction {
  id: number;
  user_id: number;
  amount: number;
  type: TransactionType;
  category: Category;
  note: string | null;
  date: string;
  created_at: string;
}

export interface TransactionCreatePayload {
  amount: number;
  type: TransactionType;
  category: Category;
  note?: string;
  date: string;
}

export interface TransactionUpdatePayload {
  amount?: number;
  type?: TransactionType;
  category?: Category;
  note?: string | null;
  date?: string;
}

// ---------- 预算 ----------

export interface Budget {
  id: number | null;
  user_id: number;
  category: Category;
  monthly_limit: number;
  year_month: string;
  actual_spent: number;
  remaining: number;
  created_at: string | null;
}

export interface BudgetSummary {
  month: string;
  items: Budget[];
  total_budget: number;
  total_spent: number;
}

export interface BudgetCreatePayload {
  category: Category;
  monthly_limit: number;
  year_month: string;
}

export interface BudgetUpdatePayload {
  category?: Category;
  monthly_limit?: number;
  year_month?: string;
}

// ---------- 储蓄目标 ----------

export interface SavingsGoal {
  id: number;
  user_id: number;
  name: string;
  target_amount: number;
  current_amount: number;
  deadline: string | null;
  created_at: string;
}

export interface SavingsCreatePayload {
  name: string;
  target_amount: number;
  current_amount?: number;
  deadline?: string | null;
}

export interface SavingsUpdatePayload {
  name?: string;
  target_amount?: number;
  current_amount?: number;
  deadline?: string | null;
}

// ---------- 统计 ----------

export interface NoteBreakdownEntry {
  note: string;
  amount: number;
  count: number;
}

export interface MonthlySummary {
  month: string;
  total_income: number;
  total_expense: number;
  balance: number;
  transaction_count: number;
  category_expenses: Record<string, number>;
  note_breakdown: Record<string, NoteBreakdownEntry[]>;
}

export interface TrendPoint {
  month: string;
  income: number;
  expense: number;
  balance: number;
}

// ---------- AI 记账助手 ----------

export type AgentChatRole = 'user' | 'assistant';

export interface AgentChatMessage {
  role: AgentChatRole;
  content: string;
}

export interface AgentChatRequest {
  message: string;
  history: AgentChatMessage[];
}

export interface AgentToolCallSummary {
  name: string;
  target?: string | null;
}

export interface AgentChatResponse {
  reply: string;
  tool_calls: AgentToolCallSummary[];
}

// ---------- 双人圈子 ----------

/** 圈子成员(带用户信息)。 */
export interface CircleMember {
  id: number;
  joined_at: string | null;
  user: UserSummary;
}

/** 圈子详情(成员可见的完整结构)。 */
export interface Circle {
  id: number;
  name: string;
  description: string | null;
  creator: UserSummary;
  creator_id: number;
  is_creator: boolean;
  member_count: number;
  members: CircleMember[];
  created_at: string | null;
}

export type CircleMemberStatus = 'creator' | 'member' | 'not_member';

/** 圈子概览(列表用,不包含成员明细)。 */
export interface CircleOverview {
  id: number;
  name: string;
  description: string | null;
  creator_id: number;
  member_count: number;
  my_status: CircleMemberStatus;
  created_at: string | null;
}

/** 圈子邀请码。 */
export interface CircleInviteCode {
  id: number;
  circle_id: number;
  code: string;
  created_at: string | null;
}

export type CircleApplicationStatus = 'pending' | 'approved' | 'rejected';

/** 创建圈子申请(管理员审批)。 */
export interface CircleApplication {
  id: number;
  circle_name: string;
  circle_description: string | null;
  message: string | null;
  status: CircleApplicationStatus;
  created_circle_id: number | null;
  created_at: string | null;
  reviewed_at: string | null;
  user: UserSummary;
}

/** 圈子帖子(含评分/评论统计与预览)。 */
export interface CirclePost {
  id: number;
  circle_id: number;
  content: string | null;
  image: string | null;
  created_at: string | null;
  user: UserSummary;
  average_score: number;
  rating_count: number;
  comment_count: number;
  my_score: number | null;
  comments_preview: CircleComment[];
}

/** 帖子评分。 */
export interface CircleRating {
  id: number;
  post_id: number;
  score: number;
  created_at: string | null;
  user: UserSummary;
}

/** 帖子评论。 */
export interface CircleComment {
  id: number;
  post_id: number;
  content: string;
  created_at: string | null;
  user: UserSummary;
}

/** 帖子分页结果。 */
export interface CirclePostPage {
  items: CirclePost[];
  page: number;
  page_size: number;
  total: number;
  has_more: boolean;
}

/** 管理后台中用户所属圈子摘要。 */
export type JoinedCircle = { id: number; name: string } | null;

// ---------- 圈子相关请求体 ----------

export interface CircleCreatePayload {
  name: string;
  description?: string | null;
}

export interface CircleJoinPayload {
  code: string;
}

export interface CirclePostCreatePayload {
  content?: string | null;
  image?: string | null;
}

export interface CircleRatePayload {
  score: number;
}

export interface CircleCommentCreatePayload {
  content: string;
}

export interface CircleApplicationCreatePayload {
  circle_name: string;
  circle_description?: string | null;
  message?: string | null;
}

export interface CircleApplicationReviewPayload {
  action: 'approve' | 'reject';
}
