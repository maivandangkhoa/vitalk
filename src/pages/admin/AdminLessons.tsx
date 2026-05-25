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
  getDocs,
  serverTimestamp,
  orderBy,
  query,
} from 'firebase/firestore';
import { db } from '@/lib/firebase';
import type { Language } from '@/types';
import { ALLOWED_DURATIONS, type AllowedDuration } from '@/lib/constants';

const LANGS: Language[] = ['en', 'ko', 'zh', 'ja', 'vi'];
const LANG_LABELS: Record<Language, string> = { en: 'EN', ko: 'KO', zh: 'ZH', ja: 'JA', vi: 'VI' };

interface LessonTypeRow {
  id: string;
  title: Record<Language, string>;
  description: Record<Language, string>;
  allowedDurations: AllowedDuration[];
  level: string;
  isActive: boolean;
  sortOrder: number;
}

const EMPTY_LANG = { en: '', vi: '', ko: '', zh: '', ja: '' };

export default function AdminLessons() {
  const { t } = useTranslation('admin');
  const [lessons, setLessons] = useState<LessonTypeRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const fetchLessons = useCallback(async () => {
    setLoading(true);
    try {
      const snap = await getDocs(query(collection(db, 'lessonTypes'), orderBy('sortOrder', 'asc')));
      setLessons(
        snap.docs.map((d) => {
          const data = d.data();
          const allowed: AllowedDuration[] =
            Array.isArray(data.allowedDurations) && data.allowedDurations.length > 0
              ? (data.allowedDurations.filter((n: number) =>
                  (ALLOWED_DURATIONS as readonly number[]).includes(n),
                ) as AllowedDuration[])
              : [...ALLOWED_DURATIONS];
          return {
            id: d.id,
            title: data.title ?? { ...EMPTY_LANG },
            description: data.description ?? { ...EMPTY_LANG },
            allowedDurations: allowed,
            level: data.level ?? 'beginner',
            isActive: data.isActive ?? true,
            sortOrder: data.sortOrder ?? 0,
          };
        }),
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchLessons();
  }, [fetchLessons]);

  const addLesson = () => {
    const newId = `lesson_${Date.now()}`;
    setLessons((prev) => [
      ...prev,
      {
        id: newId,
        title: { ...EMPTY_LANG },
        description: { ...EMPTY_LANG },
        allowedDurations: [...ALLOWED_DURATIONS],
        level: 'beginner',
        isActive: true,
        sortOrder: prev.length,
      },
    ]);
  };

  const updateLesson = <K extends keyof LessonTypeRow>(id: string, field: K, value: LessonTypeRow[K]) => {
    setLessons((prev) => prev.map((l) => (l.id === id ? { ...l, [field]: value } : l)));
  };

  const toggleDuration = (id: string, d: AllowedDuration) => {
    setLessons((prev) =>
      prev.map((l) => {
        if (l.id !== id) return l;
        const has = l.allowedDurations.includes(d);
        const next = has ? l.allowedDurations.filter((x) => x !== d) : [...l.allowedDurations, d].sort((a, b) => a - b);
        return { ...l, allowedDurations: next };
      }),
    );
  };

  const removeLesson = (id: string) => {
    setLessons((prev) => prev.filter((l) => l.id !== id));
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const snap = await getDocs(collection(db, 'lessonTypes'));
      const existingIds = snap.docs.map((d) => d.id);
      const currentIds = lessons.map((l) => l.id);
      for (const id of existingIds) {
        if (!currentIds.includes(id)) {
          await deleteDoc(doc(db, 'lessonTypes', id));
        }
      }

      for (let i = 0; i < lessons.length; i++) {
        const lesson = lessons[i];
        if (lesson.allowedDurations.length === 0) {
          toast.error(t('lessons.needDuration', 'Each lesson type must allow at least one duration.'));
          return;
        }
        await setDoc(doc(db, 'lessonTypes', lesson.id), {
          title: lesson.title,
          description: lesson.description,
          allowedDurations: lesson.allowedDurations,
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
      <AnimatedSection className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold">{t('nav.lessons')}</h1>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={addLesson}>
            <Plus className="mr-2 h-4 w-4" />
            <span className="hidden sm:inline">{t('lessons.addLessonType')}</span>
            <span className="sm:hidden">Add</span>
          </Button>
          <Button size="sm" onClick={handleSave} disabled={saving}>
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
                    <Badge
                      className={
                        lesson.level === 'beginner'
                          ? 'bg-emerald-50 text-emerald-600 border-emerald-200'
                          : lesson.level === 'intermediate'
                            ? 'bg-sky-50 text-sky-600 border-sky-200'
                            : lesson.level === 'conversation'
                              ? 'bg-purple-50 text-purple-600 border-purple-200'
                              : 'bg-amber-50 text-amber-600 border-amber-200'
                      }
                    >
                      {t(`lessons.${lesson.level}`)}
                    </Badge>
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

                <div className="grid gap-3 sm:grid-cols-2">
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
                    <label className="mb-1 block text-xs font-medium">
                      {t('lessons.allowedDurations', 'Allowed durations (min)')}
                    </label>
                    <div className="flex flex-wrap gap-1.5">
                      {ALLOWED_DURATIONS.map((d) => {
                        const active = lesson.allowedDurations.includes(d);
                        return (
                          <button
                            key={d}
                            type="button"
                            onClick={() => toggleDuration(lesson.id, d)}
                            className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
                              active
                                ? 'border-indigo-500 bg-indigo-500 text-white'
                                : 'border-zinc-200 bg-white text-zinc-600 hover:border-indigo-300'
                            }`}
                          >
                            {d}m
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </div>

                <div>
                  <label className="mb-1 block text-xs font-medium">{t('lessons.titleLabel')}</label>
                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                    {LANGS.map((lang) => (
                      <div key={lang} className="relative">
                        <span className="absolute left-2 top-2 text-xs text-muted-foreground">
                          {LANG_LABELS[lang]}
                        </span>
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
                  <label className="mb-1 block text-xs font-medium">{t('lessons.descriptionLabel')}</label>
                  <div className="grid gap-3 md:grid-cols-2">
                    {LANGS.map((lang) => (
                      <div key={lang}>
                        <span className="mb-1 block text-[10px] font-medium text-muted-foreground">
                          {LANG_LABELS[lang]}
                        </span>
                        <textarea
                          value={lesson.description[lang]}
                          onChange={(e) =>
                            updateLesson(lesson.id, 'description', {
                              ...lesson.description,
                              [lang]: e.target.value,
                            })
                          }
                          rows={5}
                          className="w-full rounded-xl border border-input bg-background px-3 py-2 text-sm leading-relaxed outline-none transition-all focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20"
                        />
                      </div>
                    ))}
                  </div>
                </div>
              </CardContent>
            </Card>
          </StaggerItem>
        ))}
      </StaggerContainer>
    </div>
  );
}
