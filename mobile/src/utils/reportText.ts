/**
 * 财报展示文案（纯函数，不请求后端、不读任何原生模块）。
 *
 * 时间处理：接口按契约返回带 `+08:00` 的北京时间字符串。这里直接解析字符串里的
 * 年月日时分，**不做时区换算**，避免设备时区不同导致日期挪一天（REQ 非功能需求）。
 */
import type { ReportKind } from '../types';

/** 周期类型选择器的固定顺序与文案；badge 用于列表左侧徽标。 */
export const REPORT_KIND_OPTIONS: ReadonlyArray<{
  key: ReportKind;
  label: string;
  badge: string;
}> = [
  { key: 'weekly', label: '周报', badge: '周' },
  { key: 'monthly', label: '月报', badge: '月' },
  { key: 'quarterly', label: '季报', badge: '季' },
  { key: 'yearly', label: '年报', badge: '年' },
];

/** 周报的生成星期：1=周一 … 7=周日。 */
export const WEEKDAY_OPTIONS: ReadonlyArray<{
  value: number;
  label: string;
  short: string;
}> = [
  { value: 1, label: '周一', short: '一' },
  { value: 2, label: '周二', short: '二' },
  { value: 3, label: '周三', short: '三' },
  { value: 4, label: '周四', short: '四' },
  { value: 5, label: '周五', short: '五' },
  { value: 6, label: '周六', short: '六' },
  { value: 7, label: '周日', short: '日' },
];

/** 常用生成时点（0–23 都可存，弹层只列常用项）。 */
export const REPORT_HOUR_OPTIONS: ReadonlyArray<number> = [8, 9, 12, 20, 21];

/** 月报 / 季报 / 年报的生成日：1–28，避免短月歧义。 */
export const REPORT_DAY_OPTIONS: ReadonlyArray<number> = Array.from(
  { length: 28 },
  (_, index) => index + 1,
);

const WEEKDAY_CHARS = ['一', '二', '三', '四', '五', '六', '日'];

/** 生成设置里与本文件文案相关的字段（单测可直接传对象字面量）。 */
export interface ReportScheduleLike {
  kind: ReportKind;
  anchor_weekday: number | null;
  anchor_day: number;
  anchor_hour: number;
}

/** 下次生成时间所需的最小字段。 */
export interface ReportNextLike {
  enabled: boolean;
  next_run_at: string | null;
}

/** 列表条目摘要所需的最小字段。 */
export interface ReportMetaLike {
  period_start: string;
  period_end: string;
  transaction_count: number;
  total_income: number;
  balance: number;
}

const DATE_TIME_RE = /^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2}))?/;

interface ParsedDateTime {
  year: number;
  month: number;
  day: number;
  hour: number | null;
  minute: number | null;
}

/** 解析后端返回的北京时间字符串；不构造 Date，避免时区偏移。 */
const parseDateTime = (value: string | null | undefined): ParsedDateTime | null => {
  if (!value) {
    return null;
  }
  const match = DATE_TIME_RE.exec(value);
  if (!match) {
    return null;
  }
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const hour = match[4] === undefined ? null : Number(match[4]);
  const minute = match[5] === undefined ? null : Number(match[5]);
  if (month < 1 || month > 12 || day < 1 || day > 31) {
    return null;
  }
  return { year, month, day, hour, minute };
};

const pad2 = (value: number): string => String(value).padStart(2, '0');

const clamp = (value: number, min: number, max: number): number => {
  if (!Number.isFinite(value)) {
    return min;
  }
  return Math.min(Math.max(Math.round(value), min), max);
};

/** 星期归一化到 1–7（非法值按周一）。 */
export const normalizeWeekday = (value: number | null): number =>
  value === null ? 1 : clamp(value, 1, 7);

/** 生成日归一化到 1–28（非法值按 1 日）。 */
export const normalizeAnchorDay = (value: number): number => clamp(value, 1, 28);

/** 时点归一化到 0–23（非法值按 0 点）。 */
export const normalizeHour = (value: number): number => clamp(value, 0, 23);

/** 周期类型的中文名。 */
export function describeKind(kind: ReportKind): string {
  return REPORT_KIND_OPTIONS.find((option) => option.key === kind)?.label ?? '月报';
}

/** 列表徽标单字：周 / 月 / 季 / 年。 */
export function kindBadge(kind: ReportKind): string {
  return REPORT_KIND_OPTIONS.find((option) => option.key === kind)?.badge ?? '月';
}

/** 0–23 → 09:00。 */
export function formatHour(hour: number): string {
  return `${pad2(normalizeHour(hour))}:00`;
}

/**
 * 生成的「节奏」文案：每周三 09:00 / 每月 1 日 09:00 /
 * 每季度首月 1 日 09:00 / 每年 1 月 1 日 09:00。
 */
export function describeCadence(schedule: ReportScheduleLike): string {
  const hour = formatHour(schedule.anchor_hour);
  const day = normalizeAnchorDay(schedule.anchor_day);
  switch (schedule.kind) {
    case 'weekly':
      return `每周${
        WEEKDAY_CHARS[normalizeWeekday(schedule.anchor_weekday) - 1]
      } ${hour}`;
    case 'quarterly':
      return `每季度首月 ${day} 日 ${hour}`;
    case 'yearly':
      return `每年 1 月 ${day} 日 ${hour}`;
    case 'monthly':
    default:
      return `每月 ${day} 日 ${hour}`;
  }
}

/** 规则卡主文案：月报 · 每月 1 日 09:00。 */
export function describeSchedule(schedule: ReportScheduleLike): string {
  return `${describeKind(schedule.kind)} · ${describeCadence(schedule)}`;
}

/** 该周期覆盖的时间范围（弹层预览副文案）。 */
export function describeCoverage(kind: ReportKind): string {
  switch (kind) {
    case 'weekly':
      return '覆盖上一个完整自然周';
    case 'quarterly':
      return '覆盖上一个完整自然季度';
    case 'yearly':
      return '覆盖上一个完整自然年';
    case 'monthly':
    default:
      return '覆盖上一个完整自然月';
  }
}

/** 弹层底部的规则说明（含补生成语义，与 ARCH 第二节一致）。 */
export function describeRule(kind: ReportKind): string {
  const head =
    kind === 'weekly'
      ? '周报在选定的星期生成上一周（周一至周日）的财报。'
      : kind === 'quarterly'
      ? '季报在 1 / 4 / 7 / 10 月生成上一季度的财报。'
      : kind === 'yearly'
      ? '年报在 1 月生成上一年的财报。'
      : '月报在选定日期生成上一个自然月的财报。';
  return `${head}服务器每小时检查一次，错过时点会在下次检查补生成最近一期，不批量补历史。`;
}

/** 下次生成时间的日期部分：12 月 1 日 09:00（无时点则只到日）。 */
export function formatNextRunAt(value: string | null): string {
  const parsed = parseDateTime(value);
  if (!parsed) {
    return '';
  }
  const date = `${parsed.month} 月 ${parsed.day} 日`;
  if (parsed.hour === null) {
    return date;
  }
  return `${date} ${pad2(parsed.hour)}:${pad2(parsed.minute ?? 0)}`;
}

/**
 * 规则卡副文案：下次生成：12 月 1 日 09:00 / 自动生成已关闭。
 * 时间字符串缺失时退化为「尚未排期」，不显示 NaN。
 */
export function describeNextRun(next: ReportNextLike): string {
  if (!next.enabled) {
    return '自动生成已关闭';
  }
  const formatted = formatNextRunAt(next.next_run_at);
  return formatted ? `下次生成：${formatted}` : '尚未排期，保存后生效';
}

/** 时点 chip 列表：常用项 + 当前值（保证历史设置也能选中）。 */
export function reportHourOptions(current: number): number[] {
  const hour = normalizeHour(current);
  return Array.from(new Set([...REPORT_HOUR_OPTIONS, hour])).sort(
    (a, b) => a - b,
  );
}

/** 金额：1,234.50（金融口径固定两位小数）。 */
export function formatMoney(value: number): string {
  const safe = Number.isFinite(value) ? value : 0;
  return safe.toLocaleString('zh-CN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

/** 周期区间：10.01 – 10.31（契约里两端都是闭区间）。 */
export function formatPeriodRange(start: string, end: string): string {
  const from = parseDateTime(start);
  const to = parseDateTime(end);
  if (!from || !to) {
    return '—';
  }
  return `${pad2(from.month)}.${pad2(from.day)} – ${pad2(to.month)}.${pad2(
    to.day,
  )}`;
}

/** 生成时间：11 月 1 日 09:00 生成（无时点则「11 月 1 日生成」）。 */
export function formatGeneratedAt(value: string): string {
  const parsed = parseDateTime(value);
  if (!parsed) {
    return '';
  }
  const date = `${parsed.month} 月 ${parsed.day} 日`;
  if (parsed.hour === null) {
    return `${date}生成`;
  }
  return `${date} ${pad2(parsed.hour)}:${pad2(parsed.minute ?? 0)} 生成`;
}

/** 月日：10 月 31 日（最大单笔 / 页脚用）。 */
export function formatMonthDay(value: string): string {
  const parsed = parseDateTime(value);
  if (!parsed) {
    return '';
  }
  return `${parsed.month} 月 ${parsed.day} 日`;
}

/**
 * 环比文案：+6.2% / -2.1% / 持平 / —（无上一期）。
 * 只保留一位小数，负号用 ASCII「-」，避免不同字体下 U+2212 缺失。
 */
export function formatDelta(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) {
    return '—';
  }
  const rounded = Number(value.toFixed(1));
  if (rounded === 0) {
    return '持平';
  }
  const sign = rounded > 0 ? '+' : '-';
  return `${sign}${Math.abs(rounded).toFixed(1)}%`;
}

/** 储蓄率角标：34%；缺值时 —。 */
export function formatRate(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) {
    return '—';
  }
  return `${Math.round(value)}%`;
}

/**
 * 列表里的储蓄率文案：收入为 0 时返回 null（不显示，避免除零）。
 * 列表接口不返回 savings_rate，这里按结余/收入现算，与后端口径一致。
 */
export function savingsRateLabel(
  totalIncome: number,
  balance: number,
): string | null {
  if (!Number.isFinite(totalIncome) || totalIncome <= 0) {
    return null;
  }
  return `储蓄率 ${Math.round((balance / totalIncome) * 100)}%`;
}

/** 列表条目副文案：10.01 – 10.31 · 68 笔 · 储蓄率 34%。 */
export function describeReportMeta(item: ReportMetaLike): string {
  const parts = [
    formatPeriodRange(item.period_start, item.period_end),
    `${item.transaction_count} 笔`,
  ];
  const rate = savingsRateLabel(item.total_income, item.balance);
  if (rate) {
    parts.push(rate);
  }
  return parts.join(' · ');
}

/** 趋势卡标题：跟随后端的分桶单位。 */
export function trendTitle(unit: string): string {
  switch (unit) {
    case 'day':
      return '每日支出';
    case 'week':
      return '每周支出';
    case 'month':
      return '每月支出';
    default:
      return '支出趋势';
  }
}

/** 分类 emoji（与图表页分类一一对应，缺失时兜底）。 */
const CATEGORY_EMOJI: Record<string, string> = {
  餐饮: '🍜',
  交通: '🚇',
  日用: '🛒',
  娱乐: '🎮',
  医疗: '💊',
  教育: '📚',
  购物: '🛍️',
  零食: '🍿',
  收入: '💰',
  生活费: '💵',
  其他: '📌',
};

export function categoryEmoji(name: string): string {
  return CATEGORY_EMOJI[name] ?? '🏷️';
}
