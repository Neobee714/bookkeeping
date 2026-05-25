import { create } from 'zustand';

export const BILLING_CYCLE_START_DAY_MIN = 1;
export const BILLING_CYCLE_START_DAY_MAX = 28;

const BILLING_CYCLE_START_DAY_STORAGE_KEY = 'billing_cycle_start_day';
const isBrowser = typeof window !== 'undefined';

export const clampBillingCycleStartDay = (value: number): number => {
  if (!Number.isFinite(value)) {
    return BILLING_CYCLE_START_DAY_MIN;
  }

  const normalized = Math.trunc(value);
  return Math.min(
    BILLING_CYCLE_START_DAY_MAX,
    Math.max(BILLING_CYCLE_START_DAY_MIN, normalized),
  );
};

const readStoredBillingCycleStartDay = (): number => {
  if (!isBrowser) {
    return BILLING_CYCLE_START_DAY_MIN;
  }

  const rawValue = window.localStorage.getItem(BILLING_CYCLE_START_DAY_STORAGE_KEY);
  if (!rawValue) {
    return BILLING_CYCLE_START_DAY_MIN;
  }

  const parsedValue = Number.parseInt(rawValue, 10);
  return clampBillingCycleStartDay(parsedValue);
};

interface BillingCycleState {
  monthlyStartDay: number;
  setMonthlyStartDay: (day: number) => void;
}

export const useBillingCycleStore = create<BillingCycleState>((set) => ({
  monthlyStartDay: readStoredBillingCycleStartDay(),
  setMonthlyStartDay: (day) => {
    const normalized = clampBillingCycleStartDay(day);
    if (isBrowser) {
      window.localStorage.setItem(
        BILLING_CYCLE_START_DAY_STORAGE_KEY,
        String(normalized),
      );
    }
    set({ monthlyStartDay: normalized });
  },
}));