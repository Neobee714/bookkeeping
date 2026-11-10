/**
 * 循环规则展示文案单元测试（纯函数，无需原生环境）。
 */
import type { RecurringRule } from '../src/types';
import { describeFreq, nextRunLabel } from '../src/utils/recurringText';

const rule = (overrides: Partial<RecurringRule> = {}): RecurringRule => ({
  id: 1,
  amount: 3200,
  type: 'expense',
  category: '居住',
  note: '房租',
  freq: 'monthly',
  start_date: '2026-11-01',
  next_run_date: '2026-12-01',
  enabled: true,
  last_generated_date: null,
  created_at: '2026-11-10T10:00:00+00:00',
  ...overrides,
});

describe('describeFreq', () => {
  test('每天', () => {
    expect(describeFreq(rule({ freq: 'daily', start_date: '2026-11-10' }))).toBe(
      '每天',
    );
  });

  test('每月按首次日期的「日」：每月 1 号', () => {
    expect(describeFreq(rule({ freq: 'monthly', start_date: '2026-11-01' }))).toBe(
      '每月 1 号',
    );
  });

  test('每月 31 号：文案保留锚定日，不在 App 侧夹取', () => {
    expect(describeFreq(rule({ freq: 'monthly', start_date: '2026-01-31' }))).toBe(
      '每月 31 号',
    );
  });

  test('每周按首次日期的星期：2026-11-03 是周二', () => {
    expect(describeFreq(rule({ freq: 'weekly', start_date: '2026-11-03' }))).toBe(
      '每周二',
    );
  });

  test('每周日：2026-11-01 是周日', () => {
    expect(describeFreq(rule({ freq: 'weekly', start_date: '2026-11-01' }))).toBe(
      '每周日',
    );
  });

  test('每年按首次日期的月/日：每年 11 月 1 日', () => {
    expect(describeFreq(rule({ freq: 'yearly', start_date: '2026-11-01' }))).toBe(
      '每年 11 月 1 日',
    );
  });

  test('每年 2 月 29 日（闰年锚定）', () => {
    expect(describeFreq(rule({ freq: 'yearly', start_date: '2024-02-29' }))).toBe(
      '每年 2 月 29 日',
    );
  });

  test('按本地时区解析，不因 UTC 偏移少一天', () => {
    expect(describeFreq(rule({ freq: 'monthly', start_date: '2026-01-01' }))).toBe(
      '每月 1 号',
    );
    expect(describeFreq(rule({ freq: 'yearly', start_date: '2026-01-01' }))).toBe(
      '每年 1 月 1 日',
    );
  });

  test('首次日期缺失或非法时退化为粗文案，不出现 NaN', () => {
    expect(describeFreq(rule({ freq: 'monthly', start_date: '' }))).toBe('每月');
    expect(describeFreq(rule({ freq: 'monthly', start_date: '2026-02-31' }))).toBe(
      '每月',
    );
    expect(describeFreq(rule({ freq: 'weekly', start_date: 'not-a-date' }))).toBe(
      '每周',
    );
    expect(describeFreq(rule({ freq: 'yearly', start_date: '2026-13-01' }))).toBe(
      '每年',
    );
  });
});

describe('nextRunLabel', () => {
  test('启用时展示「下期 MM-DD」', () => {
    expect(nextRunLabel(rule({ next_run_date: '2026-12-01' }))).toBe('下期 12-01');
  });

  test('跨年仍只展示月日', () => {
    expect(nextRunLabel(rule({ next_run_date: '2027-01-05' }))).toBe('下期 01-05');
  });

  test('暂停时展示「已暂停」，与到期日无关', () => {
    expect(
      nextRunLabel(rule({ enabled: false, next_run_date: '2026-12-01' })),
    ).toBe('已暂停');
  });

  test('到期日缺失或非法时展示「下期待定」', () => {
    expect(nextRunLabel(rule({ next_run_date: '' }))).toBe('下期待定');
    expect(nextRunLabel(rule({ next_run_date: '2026-02-30' }))).toBe('下期待定');
  });
});
