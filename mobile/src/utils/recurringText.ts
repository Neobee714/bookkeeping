/**
 * 循环规则的展示文案（纯函数，不请求后端）。
 *
 * 频率的具体日子完全由 `start_date` 推导：11-01 锚定「每月 1 号」，
 * 11-03 锚定「每周二」，2027-02-29 锚定「每年 2 月 29 日」。
 */
import type { RecurringFreq } from '../types';

/** describeFreq 所需的最小字段（单测可直接传对象字面量）。 */
export interface RecurringFreqLike {
  freq: RecurringFreq;
  start_date: string;
}

/** nextRunLabel 所需的最小字段。 */
export interface RecurringNextLike {
  enabled: boolean;
  next_run_date: string;
}

/** 频率选择器的固定顺序与文案（弹层用）：常规频率。 */
export const FREQ_OPTIONS: ReadonlyArray<{ key: RecurringFreq; label: string }> = [
  { key: 'daily', label: '每天' },
  { key: 'weekly', label: '每周' },
  { key: 'monthly', label: '每月' },
  { key: 'yearly', label: '每年' },
];

/**
 * 工作日类频率。工作日按周一至周五计，不含法定节假日
 * （节假日需每年维护假日表，本版不做）。
 */
export const WORKDAY_FREQ_OPTIONS: ReadonlyArray<{
  key: RecurringFreq;
  label: string;
}> = [
  { key: 'workday', label: '每个工作日' },
  { key: 'monthly_last_workday', label: '最后工作日' },
  { key: 'monthly_nth_workday', label: '第 N 个工作日' },
];

const isWorkday = (value: Date): boolean => {
  const day = value.getDay();
  return day !== 0 && day !== 6;
};

/** 该日期是当月第几个工作日（1 起）；周末按它之前的工作日数计。 */
const workdayIndexInMonth = (value: Date): number => {
  let count = 0;
  const cursor = new Date(value.getFullYear(), value.getMonth(), 1);
  while (cursor < value) {
    if (isWorkday(cursor)) {
      count += 1;
    }
    cursor.setDate(cursor.getDate() + 1);
  }
  if (isWorkday(value)) {
    count += 1;
  }
  return Math.max(count, 1);
};


const WEEKDAYS = ['日', '一', '二', '三', '四', '五', '六'];

/** YYYY-MM-DD -> 本地时区 Date（避免 new Date(str) 的 UTC 偏移）；非法返回 null。 */
const parseDate = (value: string): Date | null => {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) {
    return null;
  }
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(year, month - 1, day);
  if (
    date.getFullYear() !== year ||
    date.getMonth() !== month - 1 ||
    date.getDate() !== day
  ) {
    return null;
  }
  return date;
};

/**
 * 频率文案：每天 / 每周二 / 每月 1 号 / 每年 11 月 1 日。
 * 首次日期缺失或非法时退化为不带日子的粗文案，避免列表出现 NaN。
 */
export function describeFreq(rule: RecurringFreqLike): string {
  const date = parseDate(rule.start_date);
  switch (rule.freq) {
    case 'weekly':
      return date ? `每周${WEEKDAYS[date.getDay()]}` : '每周';
    case 'monthly':
      return date ? `每月 ${date.getDate()} 号` : '每月';
    case 'yearly':
      return date
        ? `每年 ${date.getMonth() + 1} 月 ${date.getDate()} 日`
        : '每年';
    case 'workday':
      return '每个工作日';
    case 'monthly_last_workday':
      return '每月最后一个工作日';
    case 'monthly_nth_workday':
      return date ? `每月第 ${workdayIndexInMonth(date)} 个工作日` : '每月第 N 个工作日';
    case 'daily':
    default:
      return '每天';
  }
}

/** 下期文案：启用 → 「下期 12-01」；暂停 → 「已暂停」。 */
export function nextRunLabel(rule: RecurringNextLike): string {
  if (!rule.enabled) {
    return '已暂停';
  }
  const date = parseDate(rule.next_run_date);
  if (!date) {
    return '下期待定';
  }
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `下期 ${month}-${day}`;
}
