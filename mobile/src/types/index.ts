/**
 * 与后端对齐的客户端类型定义。
 *
 * 以 Web 端 `frontend/src/types/index.ts` 为基准平移。
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

// ---------- 记账快捷输入 ----------

/** 备注预设记录的类别:手动收藏 / 不再推荐。 */
export type NotePresetKind = 'pinned' | 'hidden';

/** 快捷输入候选备注(后端按备注聚合的结果)。 */
export interface QuickNoteCandidate {
  note: string;
  /** 统计窗口内的出现次数(收藏项可为 0)。 */
  count: number;
  /** 统计窗口内最近一次使用日期(YYYY-MM-DD);无记录为 null。 */
  last_used: string | null;
}

/** GET /transactions/quick-inputs 的 data。 */
export interface QuickInputs {
  /** 当前用户最近录入的一笔账单日期(YYYY-MM-DD);无账单为 null。 */
  last_date: string | null;
  /** 手动收藏的备注,按收藏时间倒序。 */
  pinned: QuickNoteCandidate[];
  /** 各分类下自动推荐的高频备注,按 出现次数↓ / 最近使用↓ 排序。 */
  by_category: Record<string, QuickNoteCandidate[]>;
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

/** 备注金额排行条目(按备注聚合,含笔数)。 */
export interface NoteRankItem {
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
