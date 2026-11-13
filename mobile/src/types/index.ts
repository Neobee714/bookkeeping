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

/** 备注类型：evaluation = 用户确认过的评价；null = 旧备注未整理。 */
export type NoteKind = 'evaluation';

export interface Transaction {
  id: number;
  user_id: number;
  /** 离线新增幂等键（服务端返回；旧记录为 null）。 */
  client_id?: string | null;
  amount: number;
  type: TransactionType;
  category: Category;
  /** 自由文本评价；旧数据里是历史备注。 */
  note: string | null;
  /** 商家；为空表示未填。 */
  merchant?: string | null;
  /** 项目 / 吃了什么 / 玩了什么；为空表示未填。 */
  item?: string | null;
  /** evaluation = 已确认的评价；null / undefined = 旧备注未整理。 */
  note_kind?: NoteKind | null;
  date: string;
  created_at: string;
  /** 由循环规则自动生成时指向规则；手动记账为 null。 */
  recurring_rule_id?: number | null;
  /** 仅本地：待同步（尚未上传）。 */
  pending?: boolean;
  /** 仅本地：同步失败（4xx）。 */
  syncFailed?: boolean;
  /** 仅本地：失败原因。 */
  syncError?: string;
}

export interface TransactionCreatePayload {
  amount: number;
  type: TransactionType;
  category: Category;
  /** 评价；旧字段语义沿用，后端按非空置 note_kind='evaluation'。 */
  note?: string;
  merchant?: string;
  item?: string;
  date: string;
  /** 离线新增幂等键；在线新增可不传。 */
  client_id?: string;
}

export interface TransactionUpdatePayload {
  amount?: number;
  type?: TransactionType;
  category?: Category;
  note?: string | null;
  merchant?: string | null;
  item?: string | null;
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

/** 快捷输入里的商家 / 菜品候选。 */
export interface QuickNameCandidate {
  name: string;
  count: number;
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
  /** 各分类下最近 90 天高频商家(旧后端可能不返回)。 */
  merchants_by_category?: Record<string, QuickNameCandidate[]>;
  /** 各分类下最近 90 天高频菜品(旧后端可能不返回)。 */
  items_by_category?: Record<string, QuickNameCandidate[]>;
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

// ---------- 循环记账 ----------

/** 重复频率：常规四种 + 工作日类三种（日子由 start_date 锚定）。 */
export type RecurringFreq =
  | 'daily'
  | 'weekly'
  | 'monthly'
  | 'yearly'
  | 'workday'
  | 'monthly_last_workday'
  | 'monthly_nth_workday';

/** 循环规则（GET /recurring 的 data 条目）。 */
export interface RecurringRule {
  id: number;
  amount: number;
  type: TransactionType;
  category: Category;
  note: string | null;
  freq: RecurringFreq;
  /** 锚定日 YYYY-MM-DD：决定每月几号 / 每周哪天 / 每年哪一天。 */
  start_date: string;
  /** 下一次到期日 YYYY-MM-DD（后端算好，App 只展示）。 */
  next_run_date: string;
  enabled: boolean;
  last_generated_date: string | null;
  created_at: string;
}

/** POST /recurring body。 */
export interface RecurringCreatePayload {
  amount: number;
  type: TransactionType;
  category: Category;
  note?: string;
  freq: RecurringFreq;
  start_date: string;
}

/** PATCH /recurring/{id} body：任意子集。 */
export interface RecurringUpdatePayload {
  amount?: number;
  type?: TransactionType;
  category?: Category;
  note?: string | null;
  freq?: RecurringFreq;
  start_date?: string;
  enabled?: boolean;
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

/** 图表排行维度：商家 / 菜品。 */
export type BreakdownDimension = 'merchant' | 'item';

/** 商家 / 菜品排行条目。 */
export interface BreakdownItem {
  name: string;
  amount: number;
  count: number;
  /** 人均 = amount / count，后端已四舍五入到 2 位。 */
  avg: number;
}

/** GET /stats/breakdown 的 data。 */
export interface BreakdownResponse {
  dimension: BreakdownDimension;
  items: BreakdownItem[];
  /** 当前用户 note_kind IS NULL 的去重备注数；不随月份变化。 */
  legacy_note_count: number;
  /** 最近一次尚未撤销的整理；老后端可能不返回。 */
  last_cleanup?: CleanupBatchInfo | null;
}

/** 一次整理保存批次（多条同名账单归为一批）。 */
export interface CleanupBatchInfo {
  batch_id: number;
  created_at: string;
  affected_count: number;
}

// ---------- 整理旧备注 ----------

/** 后端根据词表给出的建议，仅作 UI 提示，不自动应用。 */
export type NoteSuggestion = 'merchant' | 'item' | 'both' | 'evaluation' | null;

/** GET /transactions/note-candidates 的条目。 */
export interface NoteCandidate {
  note: string;
  count: number;
  total_amount: number;
  last_used: string | null;
  suggestion: NoteSuggestion;
}

/** GET /transactions/note-candidates 的 data。 */
export interface NoteCandidateList {
  /** 去重后的旧备注总数。 */
  total: number;
  items: NoteCandidate[];
  /** 最近一次尚未撤销的整理；没有或老后端不返回时为 null/undefined。 */
  last_cleanup?: CleanupBatchInfo | null;
}

/** POST /transactions/notes/reclassify 的 action。 */
export type ReclassifyAction = 'merchant' | 'item' | 'both' | 'evaluation' | 'skip';

export interface ReclassifyPayload {
  note: string;
  action: ReclassifyAction;
  merchant?: string | null;
  item?: string | null;
  /** 同一次保存的多条请求共用一个 key，便于整批撤销。 */
  batch_key?: string;
}

export interface ReclassifyResult {
  /** 受影响（被改写）的账单数。 */
  affected: number;
  /** 本次整理所属批次；没有可改写的行时为 null。 */
  batch_id?: number | null;
}

/** POST /transactions/notes/undo 的 data。 */
export interface UndoCleanupResult {
  batch_id: number;
  restored: number;
  skipped: number;
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

// ---------- 财报总结 ----------
//
// 契约见 docs/v0.17/ARCH.md 第六节：所有接口只返回当前用户自己的数据，
// 不带 target / partner 参数（个人账本，不做双人对比）。

/** 报告周期：上一完整自然周 / 月 / 季 / 年。 */
export type ReportKind = 'weekly' | 'monthly' | 'quarterly' | 'yearly';

/** GET /reports/settings 的 data；无设置时 exists=false + 默认值。 */
export interface ReportSettings {
  exists: boolean;
  enabled: boolean;
  kind: ReportKind;
  /** 1=周一 … 7=周日；非 weekly 为 null。 */
  anchor_weekday: number | null;
  /** 1–28；weekly 固定为 1。 */
  anchor_day: number;
  /** 0–23。 */
  anchor_hour: number;
  /** 北京时间 ISO 串（+08:00）；禁用时为 null。 */
  next_run_at: string | null;
  last_period_end: string | null;
}

/** PUT /reports/settings 的 body。 */
export interface ReportSettingsPayload {
  kind: ReportKind;
  anchor_weekday?: number | null;
  anchor_day: number;
  anchor_hour: number;
  enabled: boolean;
}

/** GET /reports 的条目：列表只带汇总字段，不解析 content。 */
export interface ReportListItem {
  id: number;
  kind: ReportKind;
  /** 如「2026 年 10 月」「2026 年第 3 季度」「2025 年」。 */
  label: string;
  /** 闭区间首日 YYYY-MM-DD。 */
  period_start: string;
  /** 闭区间末日 YYYY-MM-DD。 */
  period_end: string;
  generated_at: string;
  total_income: number;
  total_expense: number;
  balance: number;
  transaction_count: number;
  read_at: string | null;
}

export interface ReportListResponse {
  unread_count: number;
  /** 全部报告数（列表可能只返回最近 N 条）。 */
  total: number;
  items: ReportListItem[];
}

/** 分类支出占比（share 为 0–100 的百分数）。 */
export interface ReportCategoryShare {
  name: string;
  amount: number;
  share: number;
}

/** 最大单笔支出（Top 3，金额降序）。 */
export interface ReportTopExpense {
  amount: number;
  category: string;
  note: string | null;
  /** v0.18 新增；旧报告没有。 */
  merchant?: string | null;
  /** v0.18 新增；旧报告没有。 */
  item?: string | null;
  date: string;
}

/** 上一个同类型周期的汇总；无数据时为 null。 */
export interface ReportPrevSummary {
  total_income: number;
  total_expense: number;
  expense_delta_pct: number | null;
  income_delta_pct: number | null;
}

export interface ReportTrendPoint {
  label: string;
  expense: number;
}

/** 趋势分桶：周报 day / 月报 week / 季报与年报 month。 */
export interface ReportTrend {
  unit: 'day' | 'week' | 'month' | string;
  points: ReportTrendPoint[];
}

/** 生成时固化的快照（content JSON）。 */
export interface ReportContent {
  headline: string;
  total_income: number;
  total_expense: number;
  balance: number;
  /** 收入为 0 时为 null。 */
  savings_rate: number | null;
  transaction_count: number;
  active_days: number;
  period_days: number;
  daily_expense: number;
  prev_label: string | null;
  prev: ReportPrevSummary | null;
  categories: ReportCategoryShare[];
  top_expenses: ReportTopExpense[];
  insights: string[];
  trend: ReportTrend;
  /** v0.18 新增：商家 Top5（旧报告没有该字段）。 */
  merchants?: BreakdownItem[];
  /** v0.18 新增：菜品 Top5（旧报告没有该字段）。 */
  items?: BreakdownItem[];
  /** v0.18 新增：餐饮支出汇总（旧报告没有该字段）。 */
  dining?: ReportDining | null;
  /** v0.18 新增：最多 3 条吃喝洞察（旧报告没有该字段）。 */
  dining_insights?: string[];
}

/** 财报里的餐饮支出汇总。 */
export interface ReportDining {
  count: number;
  amount: number;
  avg: number;
}

/** GET /reports/{id} 的 data。 */
export interface ReportDetail {
  id: number;
  kind: ReportKind;
  label: string;
  period_start: string;
  period_end: string;
  generated_at: string;
  read_at: string | null;
  content: ReportContent;
}

/** POST /reports/{id}/read 的 data。 */
export interface ReportReadResult {
  id: number;
  read_at: string;
}
