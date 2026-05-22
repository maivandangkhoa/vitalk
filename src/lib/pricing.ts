import {
  ALLOWED_DURATIONS,
  DEFAULT_HOURLY_RATE_USD,
  DURATION_MULTIPLIERS,
  type AllowedDuration,
} from './constants';
import {
  CURRENCY_SYMBOLS,
  DEFAULT_CURRENCY_CONFIG,
  type CurrencyConfig,
  type SupportedCurrency,
} from './currency';
import type { TeacherProfile } from '@/types/profile';

export function isAllowedDuration(n: number): n is AllowedDuration {
  return (ALLOWED_DURATIONS as readonly number[]).includes(n);
}

/** Effective hourly rate (USD) for a teacher, falling back to the default. */
export function teacherHourlyRateUSD(
  teacher: Pick<TeacherProfile, 'hourlyRate' | 'lessonPrice'> | null | undefined,
): number {
  return teacher?.hourlyRate ?? teacher?.lessonPrice ?? DEFAULT_HOURLY_RATE_USD;
}

/**
 * Price in USD for a given (teacher, duration). Rounded to 2 decimals.
 * Applies in order: explicit override → multiplier × hourlyRate.
 */
export function getDurationPriceUSD(
  teacher: Pick<TeacherProfile, 'hourlyRate' | 'lessonPrice' | 'lessonPriceOverrides'> | null | undefined,
  duration: AllowedDuration,
): number {
  const override = teacher?.lessonPriceOverrides?.[duration];
  if (typeof override === 'number') return override;
  const rate = teacherHourlyRateUSD(teacher);
  return Math.round(rate * DURATION_MULTIPLIERS[duration] * 100) / 100;
}

/**
 * Price for a (teacher, duration) in the requested display currency.
 * Prefers a per-currency teacher rate if set; otherwise converts USD via
 * the config's exchange rates.
 */
export function getDurationPrice(
  teacher: Pick<TeacherProfile, 'hourlyRate' | 'hourlyRates' | 'lessonPrice' | 'lessonPriceOverrides'> | null | undefined,
  duration: AllowedDuration,
  currency: SupportedCurrency,
  config: CurrencyConfig = DEFAULT_CURRENCY_CONFIG,
): number {
  const override = teacher?.lessonPriceOverrides?.[duration];
  if (typeof override === 'number') {
    if (currency === 'USD') return override;
    const rate = config.exchangeRates[currency] ?? 1;
    return Math.round(override * rate);
  }

  const perCurrencyHourly = teacher?.hourlyRates?.[currency];
  const multiplier = DURATION_MULTIPLIERS[duration];
  if (typeof perCurrencyHourly === 'number') {
    return Math.round(perCurrencyHourly * multiplier);
  }

  const usdHourly = teacherHourlyRateUSD(teacher);
  if (currency === 'USD') {
    return Math.round(usdHourly * multiplier * 100) / 100;
  }
  const fx = config.exchangeRates[currency] ?? 1;
  return Math.round(usdHourly * multiplier * fx);
}

/** Format a numeric amount with the currency symbol (e.g., "$10.50", "₩14,200"). */
export function formatDurationPrice(
  teacher: Pick<TeacherProfile, 'hourlyRate' | 'hourlyRates' | 'lessonPrice' | 'lessonPriceOverrides'> | null | undefined,
  duration: AllowedDuration,
  currency: SupportedCurrency,
  config: CurrencyConfig = DEFAULT_CURRENCY_CONFIG,
): string {
  const amount = getDurationPrice(teacher, duration, currency, config);
  const symbol = CURRENCY_SYMBOLS[currency] ?? currency;
  if (currency === 'USD') {
    return `${symbol}${amount.toFixed(2)}`;
  }
  return `${symbol}${Math.round(amount).toLocaleString('en-US')}`;
}
