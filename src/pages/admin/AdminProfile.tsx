import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Save, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { doc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useTeacherSelector, TeacherSelector } from '@/components/admin/TeacherSelector';
import { AnimatedSection } from '@/components/shared/motion';
import type { Language } from '@/types';
import { ALLOWED_DURATIONS, DEFAULT_HOURLY_RATE_USD, DURATION_MULTIPLIERS, type AllowedDuration } from '@/lib/constants';

const LANGS: Language[] = ['en', 'vi', 'ko', 'zh', 'ja'];
const LANG_LABELS: Record<Language, string> = { en: 'English', vi: 'Tiếng Việt', ko: '한국어', zh: '中文', ja: '日本語' };

export default function AdminProfile() {
  const { t } = useTranslation('admin');
  const { teacherId, teachers, isAdmin, setTeacherId } = useTeacherSelector();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [name, setName] = useState('');
  const [age, setAge] = useState('');
  const [location, setLocation] = useState('');
  const [profileImageUrl, setProfileImageUrl] = useState('');
  const [videoIntroUrl, setVideoIntroUrl] = useState('');
  const [bio, setBio] = useState<Record<Language, string>>({ en: '', vi: '', ko: '', zh: '', ja: '' });
  const [teachingStyle, setTeachingStyle] = useState<Record<Language, string>>({ en: '', vi: '', ko: '', zh: '', ja: '' });
  const [hourlyRate, setHourlyRate] = useState<number>(DEFAULT_HOURLY_RATE_USD);
  const [overrides, setOverrides] = useState<Partial<Record<AllowedDuration, number | ''>>>({});

  useEffect(() => {
    if (!teacherId) {
      setLoading(false);
      return;
    }
    const fetch = async () => {
      setLoading(true);
      try {
        const snap = await getDoc(doc(db, 'teachers', teacherId));
        if (snap.exists()) {
          const data = snap.data();
          setName(data.name || '');
          setAge(data.age || '');
          setLocation(data.location || '');
          setProfileImageUrl(data.profileImageUrl || '');
          setVideoIntroUrl(data.videoIntroUrl || '');
          if (data.bio) setBio(data.bio);
          if (data.teachingStyle) setTeachingStyle(data.teachingStyle);
          const rate = typeof data.hourlyRate === 'number'
            ? data.hourlyRate
            : typeof data.lessonPrice === 'number' && data.lessonPrice > 0
              ? data.lessonPrice
              : DEFAULT_HOURLY_RATE_USD;
          setHourlyRate(rate);
          const ovr: Partial<Record<AllowedDuration, number | ''>> = {};
          for (const d of ALLOWED_DURATIONS) {
            const v = data.lessonPriceOverrides?.[d];
            if (typeof v === 'number') ovr[d] = v;
          }
          setOverrides(ovr);
        }
      } finally {
        setLoading(false);
      }
    };
    fetch();
  }, [teacherId]);

  const handleSave = async () => {
    if (!teacherId) return;
    setSaving(true);
    try {
      const cleanOverrides: Partial<Record<AllowedDuration, number>> = {};
      for (const d of ALLOWED_DURATIONS) {
        const v = overrides[d];
        if (typeof v === 'number' && v > 0) cleanOverrides[d] = v;
      }
      await setDoc(doc(db, 'teachers', teacherId), {
        name,
        age,
        location,
        profileImageUrl,
        videoIntroUrl,
        bio,
        teachingStyle,
        hourlyRate,
        lessonPriceOverrides: cleanOverrides,
        updatedAt: serverTimestamp(),
      }, { merge: true });
      toast.success(t('profile.saved'));
    } catch {
      toast.error(t('profile.saveFailed'));
    } finally {
      setSaving(false);
    }
  };

  if (!teacherId) {
    return (
      <div className="flex items-center justify-center py-16">
        <p className="text-muted-foreground">Select a teacher to edit their profile.</p>
      </div>
    );
  }

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
        <div className="flex items-center gap-4">
          <h1 className="text-2xl font-bold">{t('profile.title')}</h1>
          {isAdmin && (
            <TeacherSelector teacherId={teacherId} teachers={teachers} onChange={setTeacherId} />
          )}
        </div>
        <Button onClick={handleSave} disabled={saving}>
          {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
          {t('profile.save')}
        </Button>
      </AnimatedSection>

      <div className="space-y-6">
        <Card>
          <CardContent className="space-y-4 pt-6">
            <h3 className="flex items-center gap-2 font-semibold"><span className="h-5 w-1 rounded-full bg-indigo-500" />{t('profile.basicInfo')}</h3>
            <div className="grid gap-4 sm:grid-cols-3">
              <Field label={t('profile.name')} value={name} onChange={setName} />
              <Field label={t('profile.age')} value={age} onChange={setAge} />
              <Field label={t('profile.location')} value={location} onChange={setLocation} />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label={t('profile.profileImageUrl')} value={profileImageUrl} onChange={setProfileImageUrl} placeholder="https://..." />
              <Field label={t('profile.videoIntroUrl')} value={videoIntroUrl} onChange={setVideoIntroUrl} placeholder="https://youtube.com/..." />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="space-y-4 pt-6">
            <h3 className="flex items-center gap-2 font-semibold"><span className="h-5 w-1 rounded-full bg-indigo-500" />{t('profile.bio')}</h3>
            {LANGS.map((lang) => (
              <div key={lang}>
                <label className="mb-1 block text-sm font-medium">{LANG_LABELS[lang]}</label>
                <textarea
                  value={bio[lang]}
                  onChange={(e) => setBio((prev) => ({ ...prev, [lang]: e.target.value }))}
                  rows={3}
                  className="w-full rounded-xl border border-input bg-background px-3 py-2 text-sm outline-none transition-all focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20"
                />
              </div>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardContent className="space-y-4 pt-6">
            <h3 className="flex items-center gap-2 font-semibold"><span className="h-5 w-1 rounded-full bg-indigo-500" />{t('profile.pricing', 'Pricing')}</h3>
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className="mb-1 block text-sm font-medium">
                  {t('profile.hourlyRate', 'Hourly rate (USD)')}
                </label>
                <input
                  type="number"
                  min={0}
                  step={0.5}
                  value={hourlyRate}
                  onChange={(e) => setHourlyRate(Number(e.target.value))}
                  className="w-full rounded-xl border border-input bg-background px-3 py-2 text-sm outline-none transition-all focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20"
                />
                <p className="mt-1 text-xs text-muted-foreground">
                  {t('profile.hourlyRateHint', 'Base USD rate per 60 min. Other durations scale by the multiplier shown below.')}
                </p>
              </div>
            </div>
            <div>
              <p className="mb-2 text-sm font-medium">{t('profile.priceTable', 'Auto-derived prices (USD)')}</p>
              <div className="grid gap-2 sm:grid-cols-4">
                {ALLOWED_DURATIONS.map((d) => {
                  const mult = DURATION_MULTIPLIERS[d];
                  const derived = Math.round(hourlyRate * mult * 100) / 100;
                  const override = overrides[d];
                  return (
                    <div key={d} className="rounded-xl border border-zinc-200 p-3">
                      <div className="text-xs font-semibold text-zinc-600">{d} min ({mult}x)</div>
                      <div className="mt-1 text-sm text-muted-foreground">
                        {t('profile.derived', 'Default')}: ${derived.toFixed(2)}
                      </div>
                      <input
                        type="number"
                        min={0}
                        step={0.5}
                        placeholder={t('profile.overridePlaceholder', 'Override (optional)')}
                        value={override ?? ''}
                        onChange={(e) => {
                          const raw = e.target.value;
                          setOverrides((prev) => ({
                            ...prev,
                            [d]: raw === '' ? '' : Number(raw),
                          }));
                        }}
                        className="mt-2 w-full rounded-lg border border-input bg-background px-2 py-1 text-sm outline-none transition-all focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20"
                      />
                    </div>
                  );
                })}
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="space-y-4 pt-6">
            <h3 className="flex items-center gap-2 font-semibold"><span className="h-5 w-1 rounded-full bg-indigo-500" />{t('profile.teachingStyle')}</h3>
            {LANGS.map((lang) => (
              <div key={lang}>
                <label className="mb-1 block text-sm font-medium">{LANG_LABELS[lang]}</label>
                <textarea
                  value={teachingStyle[lang]}
                  onChange={(e) => setTeachingStyle((prev) => ({ ...prev, [lang]: e.target.value }))}
                  rows={3}
                  className="w-full rounded-xl border border-input bg-background px-3 py-2 text-sm outline-none transition-all focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20"
                />
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function Field({ label, value, onChange, placeholder }: {
  label: string; value: string; onChange: (v: string) => void; placeholder?: string;
}) {
  return (
    <div>
      <label className="mb-1 block text-sm font-medium">{label}</label>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full rounded-xl border border-input bg-background px-3 py-2 text-sm outline-none transition-all focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20"
      />
    </div>
  );
}
