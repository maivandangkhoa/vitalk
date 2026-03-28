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

const LANGS: Language[] = ['en', 'vi', 'ko', 'ja'];
const LANG_LABELS: Record<Language, string> = { en: 'English', vi: 'Tiếng Việt', ko: '한국어', ja: '日本語' };

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
  const [bio, setBio] = useState<Record<Language, string>>({ en: '', vi: '', ko: '', ja: '' });
  const [teachingStyle, setTeachingStyle] = useState<Record<Language, string>>({ en: '', vi: '', ko: '', ja: '' });

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
      await setDoc(doc(db, 'teachers', teacherId), {
        name,
        age,
        location,
        profileImageUrl,
        videoIntroUrl,
        bio,
        teachingStyle,
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
