import { clampBillingCycleStartDay } from '@/store/billingCycleStore';

export interface BillingCycleRange {
  startDate: string;
  endDate: string;
  rangeKey: string;
}

const formatDateParam = (value: Date): string => {
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, '0');
  const day = String(value.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

export const getBillingCycleRange = (
  anchorDate: Date,
  startDay: number,
): BillingCycleRange => {
  const normalizedStartDay = clampBillingCycleStartDay(startDay);
  const year = anchorDate.getFullYear();
  const month = anchorDate.getMonth();

  let start: Date;
  let end: Date;

  if (normalizedStartDay === 1) {
    start = new Date(year, month, 1);
    end = new Date(year, month + 1, 1);
  } else if (anchorDate.getDate() >= normalizedStartDay) {
    start = new Date(year, month, normalizedStartDay);
    end = new Date(year, month + 1, normalizedStartDay);
  } else {
    start = new Date(year, month - 1, normalizedStartDay);
    end = new Date(year, month, normalizedStartDay);
  }

  const startDate = formatDateParam(start);
  const endDate = formatDateParam(end);

  return {
    startDate,
    endDate,
    rangeKey: `${startDate}:${endDate}`,
  };
};

export const formatBillingCycleTip = (startDay: number): string =>
  `当前账单起始日：${clampBillingCycleStartDay(startDay)}号`;