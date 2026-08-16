/**
 * 金额与日期格式化工具(首页账单流 / 记账弹层共用)。
 */

/** 金额展示:千分位 + 2 位小数(如 12,345.67)。 */
export function formatMoney(value: number): string {
  const [whole, decimal] = value.toFixed(2).split('.');
  const withSeparator = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return `${withSeparator}.${decimal}`;
}

/** Date -> YYYY-MM(如 2026-07)。 */
export function getMonthKey(value: Date): string {
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, '0');
  return `${year}-${month}`;
}

/** Date -> YYYY-MM-DD(本地时区,避免 toISOString 的 UTC 偏移)。 */
export function toDateString(value: Date): string {
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, '0');
  const day = String(value.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/** 月份平移(日期按月末截断,与 Web 端一致)。 */
export function shiftMonth(value: Date, delta: number): Date {
  const target = new Date(value.getFullYear(), value.getMonth() + delta, 1);
  const lastDay = new Date(
    target.getFullYear(),
    target.getMonth() + 1,
    0,
  ).getDate();
  return new Date(
    target.getFullYear(),
    target.getMonth(),
    Math.min(value.getDate(), lastDay),
  );
}

/** 月份标题:2026-07 -> 2026年7月。 */
export function formatMonthLabel(value: Date): string {
  return `${value.getFullYear()}年${value.getMonth() + 1}月`;
}

/** 相对日分组标题:今天 / 昨天 / 更早日期(M月D日 周X)。 */
export function formatDateLabel(dateString: string): string {
  const date = parseDateString(dateString);
  if (!date) {
    return dateString;
  }
  const today = startOfDay(new Date());
  const diffDays = Math.round(
    (today.getTime() - startOfDay(date).getTime()) / 86_400_000,
  );
  if (diffDays === 0) {
    return '今天';
  }
  if (diffDays === 1) {
    return '昨天';
  }
  const weekdays = '日一二三四五六';
  return `${date.getMonth() + 1}月${date.getDate()}日 周${weekdays[date.getDay()]}`;
}

/** 严格校验 YYYY-MM-DD(拒绝 2026-02-31 这类 JS 自动进位值)。 */
export function isValidDateString(value: string): boolean {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) {
    return false;
  }
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (month < 1 || month > 12 || day < 1 || day > 31) {
    return false;
  }
  const date = new Date(year, month - 1, day);
  return (
    date.getFullYear() === year &&
    date.getMonth() === month - 1 &&
    date.getDate() === day
  );
}

function parseDateString(value: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) {
    return null;
  }
  const date = new Date(
    Number(match[1]),
    Number(match[2]) - 1,
    Number(match[3]),
  );
  return Number.isNaN(date.getTime()) ? null : date;
}

function startOfDay(value: Date): Date {
  return new Date(value.getFullYear(), value.getMonth(), value.getDate());
}

/** ISO 时间 → "YYYY-MM-DD HH:mm";空值/非法输入返回空串。 */
export function formatDateTime(iso: string | null | undefined): string {
  if (!iso) {
    return '';
  }
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return '';
  }
  const pad = (n: number) => String(n).padStart(2, '0');
  return (
    `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ` +
    `${pad(date.getHours())}:${pad(date.getMinutes())}`
  );
}

/** 评分显示:整数不带小数位,否则保留 1 位小数。 */
export function formatScore(score: number): string {
  return Number.isInteger(score) ? String(score) : score.toFixed(1);
}

/** 头像/图片是否可直接作为 Image uri(data URI 或 http(s) 地址)。 */
export function isImageUri(
  value: string | null | undefined,
): value is string {
  return (
    !!value &&
    (value.startsWith('data:image/') || value.startsWith('http'))
  );
}
