import { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Plus, Save, Loader2, Trash2, GripVertical } from 'lucide-react';
import { toast } from 'sonner';
import { AnimatedSection, StaggerContainer, StaggerItem } from '@/components/shared/motion';
import {
  collection,
  doc,
  setDoc,
  deleteDoc,
  getDoc,
  getDocs,
  serverTimestamp,
  orderBy,
  query,
} from 'firebase/firestore';
import { db } from '@/lib/firebase';
import type { Language } from '@/types';
import { CURRENCIES, CURRENCY_SYMBOLS, DEFAULT_CURRENCY_CONFIG, type CurrencyConfig } from '@/lib/currency';

const LANGS: Language[] = ['en', 'vi', 'ko', 'ja'];
const LANG_LABELS: Record<Language, string> = { en: 'EN', vi: 'VI', ko: 'KO', ja: 'JA' };

interface LessonType {
  id: string;
  title: Record<Language, string>;
  description: Record<Language, string>;
  duration: number;
  price: number;
  prices: Record<string, number>;
  currency: string;
  level: string;
  isActive: boolean;
  sortOrder: number;
}

const EMPTY_LANG = { en: '', vi: '', ko: '', ja: '' };

export default function AdminLessons() {
  const { t } = useTranslation('admin');
  const [lessons, setLessons] = useState<LessonType[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [currencyConfig, setCurrencyConfig] = useState<CurrencyConfig>(DEFAULT_CURRENCY_CONFIG);

  const fetchLessons = useCallback(async () => {
    setLoading(true);
    try {
      const [lessonSnap, configSnap] = await Promise.all([
        getDocs(query(collection(db, 'lessonTypes'), orderBy('sortOrder', 'asc'))),
        getDoc(doc(db, 'siteConfig', 'general')),
      ]);
      if (configSnap.exists() && configSnap.data().currency) {
        setCurrencyConfig({ ...DEFAULT_CURRENCY_CONFIG, ...configSnap.data().currency });
      }
      setLessons(lessonSnap.docs.map((d) => {
        const data = d.data();
        return {
          id: d.id,
          ...data,
          prices: data.prices ?? { USD: data.price ?? 14 },
        } as LessonType;
      }));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchLessons();
  }, [fetchLessons]);

  const calcPricesFromUsd = (usdPrice: number) => {
    const prices: Record<string, number> = { USD: usdPrice };
    for (const cur of CURRENCIES) {
      if (cur === 'USD') continue;
      prices[cur] = Math.round(usdPrice * (currencyConfig.exchangeRates[cur] ?? 1));
    }
    return prices;
  };

  const addLesson = () => {
    const newId = `lesson_${Date.now()}`;
    setLessons((prev) => [
      ...prev,
      {
        id: newId,
        title: { ...EMPTY_LANG },
        description: { ...EMPTY_LANG },
        duration: 50,
        price: 14,
        prices: calcPricesFromUsd(14),
        currency: 'USD',
        level: 'beginner',
        isActive: true,
        sortOrder: prev.length,
      },
    ]);
  };

  const updateLesson = (id: string, field: string, value: unknown) => {
    setLessons((prev) =>
      prev.map((l) => (l.id === id ? { ...l, [field]: value } : l))
    );
  };

  const removeLesson = (id: string) => {
    setLessons((prev) => prev.filter((l) => l.id !== id));
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      // Delete removed lessons
      const snap = await getDocs(collection(db, 'lessonTypes'));
      const existingIds = snap.docs.map((d) => d.id);
      const currentIds = lessons.map((l) => l.id);
      for (const id of existingIds) {
        if (!currentIds.includes(id)) {
          await deleteDoc(doc(db, 'lessonTypes', id));
        }
      }

      // Save all current lessons
      for (let i = 0; i < lessons.length; i++) {
        const lesson = lessons[i];
        await setDoc(doc(db, 'lessonTypes', lesson.id), {
          title: lesson.title,
          description: lesson.description,
          duration: lesson.duration,
          price: lesson.prices?.USD ?? lesson.price,
          prices: lesson.prices,
          currency: lesson.currency,
          level: lesson.level,
          isActive: lesson.isActive,
          sortOrder: i,
          updatedAt: serverTimestamp(),
        });
      }
      toast.success(t('lessons.saved'));
    } catch {
      toast.error(t('lessons.saveFailed'));
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="h-8 w-8 animate-spin text-indigo-500" />
      </div>
    );
  }

  return (
    <div>
      <AnimatedSection className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-bold">{t('nav.lessons')}</h1>
        <div className="flex gap-2">
          <Button variant="outline" onClick={addLesson}>
            <Plus className="mr-2 h-4 w-4" />
            {t('lessons.addLessonType')}
          </Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
            {t('lessons.saveAll')}
          </Button>
        </div>
      </AnimatedSection>

      <StaggerContainer className="space-y-4">
        {lessons.map((lesson) => (
          <StaggerItem key={lesson.id}>
          <Card>
            <CardContent className="space-y-4 pt-6">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <GripVertical className="h-4 w-4 text-muted-foreground" />
                  <Badge className={
                    lesson.level === 'beginner' ? 'bg-emerald-50 text-emerald-600 border-emerald-200' :
                    lesson.level === 'intermediate' ? 'bg-sky-50 text-sky-600 border-sky-200' :
                    lesson.level === 'conversation' ? 'bg-purple-50 text-purple-600 border-purple-200' :
                    'bg-amber-50 text-amber-600 border-amber-200'
                  }>{t(`lessons.${lesson.level}`)}</Badge>
                  {!lesson.isActive && <Badge variant="secondary">{t('lessons.inactive')}</Badge>}
                </div>
                <div className="flex items-center gap-2">
                  <label className="flex items-center gap-1 text-sm">
                    <input
                      type="checkbox"
                      checked={lesson.isActive}
                      onChange={(e) => updateLesson(lesson.id, 'isActive', e.target.checked)}
                    />
                    {t('lessons.active')}
                  </label>
                  <Button variant="ghost" size="sm" onClick={() => removeLesson(lesson.id)}>
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                </div>
              </div>

              <div className="grid gap-3 sm:grid-cols-3">
                <div>
                  <label className="mb-1 block text-xs font-medium">{t('lessons.level')}</label>
                  <select
                    value={lesson.level}
                    onChange={(e) => updateLesson(lesson.id, 'level', e.target.value)}
                    className="w-full rounded-xl border border-input bg-background px-3 py-2 text-sm outline-none transition-all focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20"
                  >
                    <option value="beginner">{t('lessons.beginner')}</option>
                    <option value="intermediate">{t('lessons.intermediate')}</option>
                    <option value="conversation">{t('lessons.conversation')}</option>
                    <option value="advanced">{t('lessons.advanced')}</option>
                  </select>
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium">{t('lessons.duration')}</label>
                  <input
                    type="number"
                    value={lesson.duration}
                    onChange={(e) => updateLesson(lesson.id, 'duration', Number(e.target.value))}
                    className="w-full rounded-xl border border-input bg-background px-3 py-2 text-sm outline-none transition-all focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium">{t('lessons.priceUsd')}</label>
                  <div className="grid grid-cols-4 gap-1.5">
                    {CURRENCIES.map((cur) => (
                      <div key={cur} className="relative">
                        <span className="absolute left-2 top-2 text-xs text-muted-foreground">{CURRENCY_SYMBOLS[cur]}</span>
                        <input
                          type="number"
                          value={lesson.prices?.[cur] ?? ''}
                          onChange={(e) => {
                            const val = Number(e.target.value);
                            const newPrices = { ...lesson.prices, [cur]: val };
                            if (cur === 'USD') {
                              // Auto-fill other currencies from USD
                              for (const c of CURRENCIES) {
                                if (c === 'USD') continue;
                                newPrices[c] = Math.round(val * (currencyConfig.exchangeRates[c] ?? 1));
                              }
                              updateLesson(lesson.id, 'price', val);
                            }
                            updateLesson(lesson.id, 'prices', newPrices);
                          }}
                          className="w-full rounded-md border border-input bg-background px-3 py-2 pl-6 text-sm"
                          placeholder={cur}
                        />
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              <div>
                <label className="mb-1 block text-xs font-medium">{t('lessons.titleLabel')}</label>
                <div className="grid gap-2 sm:grid-cols-4">
                  {LANGS.map((lang) => (
                    <div key={lang} className="relative">
                      <span className="absolute left-2 top-2 text-xs text-muted-foreground">{LANG_LABELS[lang]}</span>
                      <input
                        value={lesson.title[lang]}
                        onChange={(e) =>
                          updateLesson(lesson.id, 'title', { ...lesson.title, [lang]: e.target.value })
                        }
                        className="w-full rounded-md border border-input bg-background px-3 py-2 pl-8 text-sm"
                      />
                    </div>
                  ))}
                </div>
              </div>

              <div>
                <label className="mb-1 block text-xs font-medium">{t('lessons.descriptionEn')}</label>
                <textarea
                  value={lesson.description.en}
                  onChange={(e) =>
                    updateLesson(lesson.id, 'description', { ...lesson.description, en: e.target.value })
                  }
                  rows={2}
                  className="w-full rounded-xl border border-input bg-background px-3 py-2 text-sm outline-none transition-all focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20"
                />
              </div>
            </CardContent>
          </Card>
          </StaggerItem>
        ))}
      </StaggerContainer>
    </div>
  );
}
