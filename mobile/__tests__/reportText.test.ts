/**
 * 财报展示文案单元测试（纯函数，无需原生环境）。
 */
import {
  categoryEmoji,
  describeCadence,
  describeCoverage,
  describeKind,
  describeNextRun,
  describeReportMeta,
  describeRule,
  describeSchedule,
  formatDelta,
  formatGeneratedAt,
  formatHour,
  formatMoney,
  formatMonthDay,
  formatPeriodRange,
  formatRate,
  kindBadge,
  normalizeAnchorDay,
  normalizeHour,
  normalizeWeekday,
  REPORT_DAY_OPTIONS,
  REPORT_HOUR_OPTIONS,
  reportHourOptions,
  savingsRateLabel,
  trendTitle,
} from '../src/utils/reportText';

const schedule = (
  overrides: Partial<Parameters<typeof describeSchedule>[0]> = {},
) => ({
  kind: 'monthly' as const,
  anchor_weekday: null,
  anchor_day: 1,
  anchor_hour: 9,
  ...overrides,
});

describe('describeKind / kindBadge', () => {
  test('四种周期的中文名', () => {
    expect(describeKind('weekly')).toBe('周报');
    expect(describeKind('monthly')).toBe('月报');
    expect(describeKind('quarterly')).toBe('季报');
    expect(describeKind('yearly')).toBe('年报');
  });

  test('列表徽标：周 / 月 / 季 / 年', () => {
    expect(kindBadge('weekly')).toBe('周');
    expect(kindBadge('monthly')).toBe('月');
    expect(kindBadge('quarterly')).toBe('季');
    expect(kindBadge('yearly')).toBe('年');
  });
});

describe('describeSchedule', () => {
  test('默认月报：月报 · 每月 1 日 09:00', () => {
    expect(describeSchedule(schedule())).toBe('月报 · 每月 1 日 09:00');
  });

  test('月报换日 / 换时点', () => {
    expect(
      describeSchedule(schedule({ anchor_day: 28, anchor_hour: 20 })),
    ).toBe('月报 · 每月 28 日 20:00');
  });

  test('周报按星期几：1=周一、7=周日', () => {
    expect(
      describeSchedule(schedule({ kind: 'weekly', anchor_weekday: 1 })),
    ).toBe('周报 · 每周一 09:00');
    expect(
      describeSchedule(schedule({ kind: 'weekly', anchor_weekday: 7 })),
    ).toBe('周报 · 每周日 09:00');
  });

  test('周报缺 anchor_weekday 时按周一，不出现 undefined', () => {
    expect(
      describeSchedule(schedule({ kind: 'weekly', anchor_weekday: null })),
    ).toBe('周报 · 每周一 09:00');
  });

  test('季报 / 年报只走首月，日号仍取 anchor_day', () => {
    expect(
      describeSchedule(schedule({ kind: 'quarterly', anchor_day: 5 })),
    ).toBe('季报 · 每季度首月 5 日 09:00');
    expect(describeSchedule(schedule({ kind: 'yearly', anchor_day: 3 }))).toBe(
      '年报 · 每年 1 月 3 日 09:00',
    );
  });

  test('非法日 / 时点被夹到契约范围', () => {
    expect(describeSchedule(schedule({ anchor_day: 31 }))).toBe(
      '月报 · 每月 28 日 09:00',
    );
    expect(describeSchedule(schedule({ anchor_day: 0 }))).toBe(
      '月报 · 每月 1 日 09:00',
    );
    expect(describeSchedule(schedule({ anchor_hour: 25 }))).toBe(
      '月报 · 每月 1 日 23:00',
    );
  });

  test('describeCadence 只给节奏，不带周期名', () => {
    expect(describeCadence(schedule({ anchor_hour: 8 }))).toBe('每月 1 日 08:00');
  });
});

describe('describeNextRun', () => {
  test('启用且有时点：下次生成：12 月 1 日 09:00', () => {
    expect(
      describeNextRun({
        enabled: true,
        next_run_at: '2026-12-01T09:00:00+08:00',
      }),
    ).toBe('下次生成：12 月 1 日 09:00');
  });

  test('禁用时只说明已关闭', () => {
    expect(describeNextRun({ enabled: false, next_run_at: null })).toBe(
      '自动生成已关闭',
    );
  });

  test('启用但没有 next_run_at 时不显示 NaN', () => {
    expect(describeNextRun({ enabled: true, next_run_at: null })).toBe(
      '尚未排期，保存后生效',
    );
    expect(describeNextRun({ enabled: true, next_run_at: 'oops' })).toBe(
      '尚未排期，保存后生效',
    );
  });
});

describe('formatDelta', () => {
  test('正负与一位小数', () => {
    expect(formatDelta(6.2)).toBe('+6.2%');
    expect(formatDelta(-2.1)).toBe('-2.1%');
    expect(formatDelta(12)).toBe('+12.0%');
    expect(formatDelta(6.24)).toBe('+6.2%');
  });

  test('0 / 缺值 / 非数字', () => {
    expect(formatDelta(0)).toBe('持平');
    expect(formatDelta(0.04)).toBe('持平');
    expect(formatDelta(null)).toBe('—');
    expect(formatDelta(undefined)).toBe('—');
    expect(formatDelta(Number.NaN)).toBe('—');
  });
});

describe('时间与金额格式化（不做时区换算）', () => {
  test('周期区间：闭区间显示为 MM.DD – MM.DD', () => {
    expect(formatPeriodRange('2026-10-01', '2026-10-31')).toBe(
      '10.01 – 10.31',
    );
    expect(formatPeriodRange('2026-01-01', '2026-12-31')).toBe(
      '01.01 – 12.31',
    );
  });

  test('非法区间退化为 —', () => {
    expect(formatPeriodRange('', '2026-10-31')).toBe('—');
    expect(formatPeriodRange('2026-13-01', '2026-10-31')).toBe('—');
  });

  test('生成时间按字符串里的北京时间展示，零点不挪到前一天', () => {
    expect(formatGeneratedAt('2026-11-01T09:00:00+08:00')).toBe(
      '11 月 1 日 09:00 生成',
    );
    expect(formatGeneratedAt('2026-11-01T00:30:00+08:00')).toBe(
      '11 月 1 日 00:30 生成',
    );
  });

  test('只有日期时省略时点', () => {
    expect(formatGeneratedAt('2026-11-01')).toBe('11 月 1 日生成');
    expect(formatGeneratedAt('bad')).toBe('');
  });

  test('月日', () => {
    expect(formatMonthDay('2026-10-31')).toBe('10 月 31 日');
    expect(formatMonthDay('')).toBe('');
  });

  test('金额固定两位小数', () => {
    expect(formatMoney(2860.5)).toBe('2,860.50');
    expect(formatMoney(8420)).toBe('8,420.00');
    expect(formatMoney(-12.3)).toBe('-12.30');
    expect(formatMoney(Number.NaN)).toBe('0.00');
  });

  test('储蓄率角标取整', () => {
    expect(formatRate(34.2)).toBe('34%');
    expect(formatRate(null)).toBe('—');
  });
});

describe('列表摘要与储蓄率', () => {
  const item = {
    period_start: '2026-10-01',
    period_end: '2026-10-31',
    transaction_count: 68,
    total_income: 8420,
    balance: 2860.5,
  };

  test('储蓄率按「结余 / 收入」现算，与后端口径一致', () => {
    expect(savingsRateLabel(8420, 2860.5)).toBe('储蓄率 34%');
    expect(savingsRateLabel(0, 100)).toBeNull();
    expect(savingsRateLabel(100, -50)).toBe('储蓄率 -50%');
  });

  test('条目副文案拼接', () => {
    expect(describeReportMeta(item)).toBe(
      '10.01 – 10.31 · 68 笔 · 储蓄率 34%',
    );
    expect(
      describeReportMeta({ ...item, total_income: 0, balance: 0 }),
    ).toBe('10.01 – 10.31 · 68 笔');
  });
});

describe('设置弹层的选项与说明', () => {
  test('常用时点包含 08/09/12/20/21', () => {
    expect(REPORT_HOUR_OPTIONS).toEqual([8, 9, 12, 20, 21]);
    expect(reportHourOptions(9)).toEqual([8, 9, 12, 20, 21]);
  });

  test('历史设置的非典型时点会补进 chip 列表并排好序', () => {
    expect(reportHourOptions(7)).toEqual([7, 8, 9, 12, 20, 21]);
    expect(reportHourOptions(23)).toEqual([8, 9, 12, 20, 21, 23]);
  });

  test('生成日固定 1–28', () => {
    expect(REPORT_DAY_OPTIONS).toHaveLength(28);
    expect(REPORT_DAY_OPTIONS[0]).toBe(1);
    expect(REPORT_DAY_OPTIONS[27]).toBe(28);
  });

  test('归一化：星期 1–7、日 1–28、时 0–23', () => {
    expect(normalizeWeekday(null)).toBe(1);
    expect(normalizeWeekday(9)).toBe(7);
    expect(normalizeAnchorDay(0)).toBe(1);
    expect(normalizeAnchorDay(31)).toBe(28);
    expect(normalizeHour(-1)).toBe(0);
    expect(normalizeHour(24)).toBe(23);
  });

  test('时点补零', () => {
    expect(formatHour(8)).toBe('08:00');
    expect(formatHour(21)).toBe('21:00');
  });

  test('覆盖范围与补生成说明', () => {
    expect(describeCoverage('weekly')).toBe('覆盖上一个完整自然周');
    expect(describeCoverage('monthly')).toBe('覆盖上一个完整自然月');
    expect(describeCoverage('quarterly')).toBe('覆盖上一个完整自然季度');
    expect(describeCoverage('yearly')).toBe('覆盖上一个完整自然年');
    expect(describeRule('monthly')).toContain('上一个自然月');
    expect(describeRule('quarterly')).toContain('1 / 4 / 7 / 10 月');
    expect(describeRule('yearly')).toContain('1 月生成上一年');
    expect(describeRule('weekly')).toContain('周一至周日');
    expect(describeRule('monthly')).toContain('每小时检查一次');
  });
});

describe('趋势标题与分类 emoji', () => {
  test('跟随后端分桶单位', () => {
    expect(trendTitle('day')).toBe('每日支出');
    expect(trendTitle('week')).toBe('每周支出');
    expect(trendTitle('month')).toBe('每月支出');
    expect(trendTitle('unknown')).toBe('支出趋势');
  });

  test('分类 emoji 有兜底', () => {
    expect(categoryEmoji('餐饮')).toBe('🍜');
    expect(categoryEmoji('宠物')).toBe('🏷️');
  });
});
