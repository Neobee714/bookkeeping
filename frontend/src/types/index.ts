export type TransactionType = 'income' | 'expense';

export type Category =
  | '餐饮'
  | '交通'
  | '日用'
  | '娱乐'
  | '医疗'
  | '教育'
  | '购物'
  | '收入'
  | '其他';

export interface ApiResponse<T> {
  success: boolean;
  data: T;
  message: string;
}

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
  partner_id: number | null;
  partner: Partner | null;
  partner_code: string;
  reg_invite_code: string;
  created_at: string;
}

export interface AuthTokenData {
  access_token: string;
  refresh_token: string;
  token_type: 'bearer';
  user: User;
}

export interface RefreshTokenData {
  access_token: string;
  token_type: 'bearer';
}

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

export interface TransactionImportSkippedRow {
  row: number;
  reason: string;
}

export interface TransactionImportResult {
  imported: number;
  skipped: number;
  skipped_rows: TransactionImportSkippedRow[];
}

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

export interface MonthlySummary {
  month: string;
  total_income: number;
  total_expense: number;
  balance: number;
  transaction_count: number;
  category_expenses: Record<string, number>;
}

export interface TrendPoint {
  month: string;
  income: number;
  expense: number;
  balance: number;
}

export interface CircleMember {
  id: number;
  joined_at: string;
  user: UserSummary;
}

export interface Circle {
  id: number;
  name: string;
  description: string | null;
  creator: UserSummary;
  creator_id: number;
  is_creator: boolean;
  member_count: number;
  members: CircleMember[];
  created_at: string;
}

export interface CircleInviteCode {
  id: number;
  circle_id: number;
  code: string;
  created_at: string;
}

export type CircleApplicationStatus = 'pending' | 'approved' | 'rejected';
export type CircleMembershipStatus = 'creator' | 'member' | 'not_member';

export interface CircleOverview {
  id: number;
  name: string;
  description: string | null;
  creator_id: number;
  member_count: number;
  my_status: CircleMembershipStatus;
  created_at: string;
}

export interface CircleApplication {
  id: number;
  circle_name: string;
  circle_description: string | null;
  message: string | null;
  status: CircleApplicationStatus;
  created_at: string;
  reviewed_at: string | null;
  created_circle_id: number | null;
  user: UserSummary;
}

export interface CircleComment {
  id: number;
  post_id: number;
  content: string;
  created_at: string;
  user: UserSummary;
}

export interface CircleRating {
  id: number;
  post_id: number;
  score: number;
  created_at: string;
  user: UserSummary;
}

export interface CirclePost {
  id: number;
  circle_id: number;
  content: string | null;
  image: string | null;
  created_at: string;
  user: UserSummary;
  average_score: number;
  rating_count: number;
  comment_count: number;
  my_score: number | null;
  comments_preview: CircleComment[];
}

export interface CirclePostPage {
  items: CirclePost[];
  page: number;
  page_size: number;
  total: number;
  has_more: boolean;
}
