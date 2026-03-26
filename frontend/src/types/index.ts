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

export interface User {
  id: number;
  username: string;
  nickname: string;
  avatar?: string | null;
  partner_id: number | null;
  partner: Partner | null;
  invite_code: string;
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
