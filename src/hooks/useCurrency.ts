import { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import type { Language } from '@/types';
import {
  type CurrencyConfig,
  type SupportedCurrency,
  DEFAULT_CURRENCY_CONFIG,
  formatPrice,
  formatLessonPrice,
  getCurrencyForLanguage,
} from '@/lib/currency';

let cachedConfig: CurrencyConfig | null = null;
let cacheTimestamp = 0;
const CACHE_TTL = 5 * 60 * 1000;

export function useCurrencySettings() {
  const { i18n } = useTranslation();
  const lang = i18n.language as Language;
  const [config, setConfig] = useState<CurrencyConfig>(
    cachedConfig ?? DEFAULT_CURRENCY_CONFIG
  );

  useEffect(() => {
    if (cachedConfig && Date.now() - cacheTimestamp < CACHE_TTL) {
      setConfig(cachedConfig);
      return;
    }

    const fetchConfig = async () => {
      try {
        const snap = await getDoc(doc(db, 'siteConfig', 'general'));
        if (snap.exists() && snap.data().currency) {
          const fetched = {
            ...DEFAULT_CURRENCY_CONFIG,
            ...snap.data().currency,
          } as CurrencyConfig;
          cachedConfig = fetched;
          cacheTimestamp = Date.now();
          setConfig(fetched);
        }
      } catch {
        // Use defaults
      }
    };
    fetchConfig();
  }, []);

  const currency: SupportedCurrency = getCurrencyForLanguage(lang, config);

  const format = useCallback(
    (amount: number) => formatPrice(amount, currency),
    [currency]
  );

  const formatLesson = useCallback(
    (lesson: { price: number; prices?: Record<string, number> }) =>
      formatLessonPrice(lesson, currency, config),
    [currency, config]
  );

  return { config, currency, format, formatLesson };
}
