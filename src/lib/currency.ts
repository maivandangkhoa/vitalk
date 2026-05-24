import type { Language } from '@/types';

export type SupportedCurrency = 'USD' | 'KRW' | 'VND' | 'CNY' | 'JPY';

export interface CurrencyConfig {
  baseCurrency: 'USD';
  exchangeRates: Record<string, number>;
  languageCurrencyMap: Record<string, SupportedCurrency>;
}

export const CURRENCY_SYMBOLS: Record<SupportedCurrency, string> = {
  USD: '$',
  KRW: '₩',
  VND: '₫',
  CNY: '¥',
  JPY: '¥',
};

export const CURRENCIES: SupportedCurrency[] = ['USD', 'KRW', 'VND', 'CNY', 'JPY'];

export const DEFAULT_CURRENCY_CONFIG: CurrencyConfig = {
  baseCurrency: 'USD',
  exchangeRates: { KRW: 1350, VND: 25000, CNY: 7.2, JPY: 150 },
  languageCurrencyMap: { en: 'USD', ko: 'KRW', vi: 'VND', zh: 'CNY', ja: 'JPY' },
};

/**
 * Format an amount with its currency symbol.
 * formatPrice(19000, 'KRW') → "₩19,000"
 */
export function formatPrice(amount: number, currency: SupportedCurrency): string {
  const symbol = CURRENCY_SYMBOLS[currency] ?? currency;
  return `${symbol}${Math.round(amount).toLocaleString('en-US')}`;
}

/**
 * Get the display currency for a given language.
 */
export function getCurrencyForLanguage(
  lang: Language,
  config: CurrencyConfig = DEFAULT_CURRENCY_CONFIG,
): SupportedCurrency {
  return config.languageCurrencyMap[lang] ?? 'USD';
}

/**
 * Get lesson price for a specific currency.
 * Uses lesson.prices[currency] if set, otherwise calculates from USD price × exchange rate.
 */
export function getLessonPrice(
  lesson: { price: number; prices?: Record<string, number> },
  currency: SupportedCurrency,
  config: CurrencyConfig = DEFAULT_CURRENCY_CONFIG,
): number {
  if (lesson.prices?.[currency] != null) {
    return lesson.prices[currency];
  }
  if (currency === 'USD') return lesson.price;
  const rate = config.exchangeRates[currency] ?? 1;
  return Math.round(lesson.price * rate);
}

/**
 * Format lesson price for display in a given currency.
 */
export function formatLessonPrice(
  lesson: { price: number; prices?: Record<string, number> },
  currency: SupportedCurrency,
  config: CurrencyConfig = DEFAULT_CURRENCY_CONFIG,
): string {
  const amount = getLessonPrice(lesson, currency, config);
  return formatPrice(amount, currency);
}
