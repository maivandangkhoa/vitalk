import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Plus,
  Loader2,
  Pencil,
  Eye,
  EyeOff,
  Users2,
  X,
  Check,
  Download,
} from 'lucide-react';
import { toast } from 'sonner';
import { httpsCallable } from 'firebase/functions';
import { functions } from '@/lib/firebase';
import {
  useAdminTeachers,
  createTeacher,
  updateTeacher,
} from '@/hooks/useTeachers';
import { AnimatedSection, StaggerContainer, StaggerItem } from '@/components/shared/motion';

interface TeacherForm {
  name: string;
  slug: string;
  email: string;
  location: string;
  timezone: string;
  profileImageUrl: string;
  bio: string;
  isActive: boolean;
  uid: string;
}

const EMPTY_FORM: TeacherForm = {
  name: '',
  slug: '',
  email: '',
  location: '',
  timezone: '',
  profileImageUrl: '',
  bio: '',
  isActive: true,
  uid: '',
};

interface ItalkiProfileResult {
  name: string;
  profileImageUrl: string;
  location: string;
  bio: string;
  teachingStyle: string;
  languages: Record<string, string>;
  rating: number;
  totalReviews: number;
  lessonPrice: number;
  currency: string;
  videoIntroUrl: string;
  italkiId: string;
}

export default function AdminTeachers() {
  const { t } = useTranslation('admin');
  const { teachers, loading, refetch } = useAdminTeachers();
  const [editing, setEditing] = useState<string | null>(null); // teacher id or 'new'
  const [form, setForm] = useState<TeacherForm>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);

  // italki import state
  const [showImport, setShowImport] = useState(false);
  const [importUrl, setImportUrl] = useState('');
  const [importing, setImporting] = useState(false);
  // Store extra fields from italki that don't fit in the form
  const [italkiExtra, setItalkiExtra] = useState<Partial<ItalkiProfileResult> | null>(null);

  const startAdd = () => {
    setEditing('new');
    setForm(EMPTY_FORM);
    setItalkiExtra(null);
  };

  const startEdit = (teacher: typeof teachers[number]) => {
    setEditing(teacher.id);
    setItalkiExtra(null);
    setForm({
      name: teacher.name,
      slug: teacher.slug,
      email: teacher.email,
      location: teacher.location,
      timezone: teacher.timezone,
      profileImageUrl: teacher.profileImageUrl,
      bio: typeof teacher.bio === 'object' ? (teacher.bio.en || '') : '',
      isActive: teacher.isActive,
      uid: teacher.uid,
    });
  };

  const cancelEdit = () => {
    setEditing(null);
    setForm(EMPTY_FORM);
    setItalkiExtra(null);
  };

  const handleImport = async () => {
    if (!importUrl.trim()) return;
    setImporting(true);
    try {
      const fn = httpsCallable<{ url: string }, ItalkiProfileResult>(
        functions,
        'scrapeItalkiProfile'
      );
      const result = await fn({ url: importUrl.trim() });
      const data = result.data;

      // Auto-generate slug from name
      const slug = data.name
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '');

      setForm({
        name: data.name,
        slug,
        email: '',
        location: data.location,
        timezone: '',
        profileImageUrl: data.profileImageUrl,
        bio: data.bio,
        isActive: true,
        uid: '',
      });

      // Save extra italki data for when we create the teacher
      setItalkiExtra({
        teachingStyle: data.teachingStyle,
        languages: data.languages,
        rating: data.rating,
        totalReviews: data.totalReviews,
        lessonPrice: data.lessonPrice,
        currency: data.currency,
        videoIntroUrl: data.videoIntroUrl,
        italkiId: data.italkiId,
      });

      setEditing('new');
      setShowImport(false);
      setImportUrl('');
      toast.success(t('teachers.importSuccess'));
    } catch {
      toast.error(t('teachers.importFailed'));
    } finally {
      setImporting(false);
    }
  };

  const handleSave = async () => {
    if (!form.name.trim() || !form.slug.trim()) return;
    setSaving(true);
    try {
      const payload = {
        name: form.name,
        slug: form.slug,
        email: form.email,
        location: form.location,
        timezone: form.timezone,
        profileImageUrl: form.profileImageUrl,
        bio: { en: form.bio, vi: '', ko: '', ja: '' },
        isActive: form.isActive,
        uid: form.uid,
      };

      if (editing === 'new') {
        await createTeacher({
          ...payload,
          sortOrder: teachers.length,
          age: 0,
          locationSince: 0,
          origin: '',
          languages: italkiExtra?.languages || {},
          education: '',
          previousLocations: [],
          interests: [],
          lessonPrice: italkiExtra?.lessonPrice || 0,
          currency: italkiExtra?.currency || 'USD',
          rating: italkiExtra?.rating || 0,
          totalReviews: italkiExtra?.totalReviews || 0,
          teachingStyle: italkiExtra?.teachingStyle
            ? { en: italkiExtra.teachingStyle, vi: '', ko: '', ja: '' }
            : { en: '', vi: '', ko: '', ja: '' },
          videoIntroUrl: italkiExtra?.videoIntroUrl || '',
          socialLinks: {},
          ...(italkiExtra?.italkiId ? { italkiId: italkiExtra.italkiId } : {}),
        });
      } else if (editing) {
        await updateTeacher(editing, payload);
      }
      toast.success(t('teachers.saved'));
      setEditing(null);
      setForm(EMPTY_FORM);
      setItalkiExtra(null);
      refetch();
    } catch {
      toast.error(t('teachers.saveFailed'));
    } finally {
      setSaving(false);
    }
  };

  const handleToggle = async (id: string, isActive: boolean) => {
    try {
      await updateTeacher(id, { isActive: !isActive });
      toast.success(!isActive ? t('teachers.active') : t('teachers.inactive'));
      refetch();
    } catch {
      toast.error(t('teachers.saveFailed'));
    }
  };

  const inputClass =
    'h-12 w-full rounded-xl border border-input bg-background px-4 text-sm outline-none transition-all focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20';

  return (
    <div>
      <AnimatedSection className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-bold">{t('teachers.title')}</h1>
        <div className="flex gap-2">
          <Button
            variant="outline"
            onClick={() => setShowImport(!showImport)}
            disabled={editing !== null}
          >
            <Download className="mr-2 h-4 w-4" />
            {t('teachers.importItalki')}
          </Button>
          <Button onClick={startAdd} disabled={editing === 'new'}>
            <Plus className="mr-2 h-4 w-4" />
            {t('teachers.addTeacher')}
          </Button>
        </div>
      </AnimatedSection>

      {/* italki Import bar */}
      {showImport && !editing && (
        <AnimatedSection>
          <Card className="mb-6">
            <CardContent className="flex items-center gap-3 p-5">
              <input
                value={importUrl}
                onChange={(e) => setImportUrl(e.target.value)}
                className={inputClass}
                placeholder={t('teachers.pasteItalkiUrl')}
                onKeyDown={(e) => e.key === 'Enter' && handleImport()}
              />
              <Button onClick={handleImport} disabled={importing || !importUrl.trim()}>
                {importing ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Download className="mr-2 h-4 w-4" />
                )}
                {importing ? t('teachers.importing') : t('teachers.importButton')}
              </Button>
              <Button variant="ghost" size="sm" onClick={() => { setShowImport(false); setImportUrl(''); }}>
                <X className="h-4 w-4" />
              </Button>
            </CardContent>
          </Card>
        </AnimatedSection>
      )}

      {/* Add/Edit form */}
      {editing && (
        <AnimatedSection>
          <Card className="mb-6">
            <CardContent className="space-y-4 p-8">
              <h3 className="font-semibold">
                {editing === 'new' ? t('teachers.addTeacher') : t('teachers.editTeacher')}
              </h3>
              <div className="grid gap-4 md:grid-cols-2">
                <div>
                  <label className="mb-1.5 block text-sm font-medium">{t('teachers.name')}</label>
                  <input
                    value={form.name}
                    onChange={(e) => setForm({ ...form, name: e.target.value })}
                    className={inputClass}
                    placeholder="Jane Doe"
                  />
                </div>
                <div>
                  <label className="mb-1.5 block text-sm font-medium">{t('teachers.slug')}</label>
                  <input
                    value={form.slug}
                    onChange={(e) => setForm({ ...form, slug: e.target.value })}
                    className={inputClass}
                    placeholder="jane-doe"
                  />
                </div>
                <div>
                  <label className="mb-1.5 block text-sm font-medium">{t('teachers.email')}</label>
                  <input
                    value={form.email}
                    onChange={(e) => setForm({ ...form, email: e.target.value })}
                    className={inputClass}
                    placeholder="jane@example.com"
                  />
                </div>
                <div>
                  <label className="mb-1.5 block text-sm font-medium">{t('teachers.uid')}</label>
                  <input
                    value={form.uid}
                    onChange={(e) => setForm({ ...form, uid: e.target.value })}
                    className={inputClass}
                    placeholder="Firebase Auth UID"
                  />
                </div>
                <div>
                  <label className="mb-1.5 block text-sm font-medium">{t('teachers.location')}</label>
                  <input
                    value={form.location}
                    onChange={(e) => setForm({ ...form, location: e.target.value })}
                    className={inputClass}
                    placeholder="Seoul, South Korea"
                  />
                </div>
                <div>
                  <label className="mb-1.5 block text-sm font-medium">{t('teachers.timezone')}</label>
                  <input
                    value={form.timezone}
                    onChange={(e) => setForm({ ...form, timezone: e.target.value })}
                    className={inputClass}
                    placeholder="Asia/Seoul"
                  />
                </div>
                <div className="md:col-span-2">
                  <label className="mb-1.5 block text-sm font-medium">{t('teachers.profileImageUrl')}</label>
                  <input
                    value={form.profileImageUrl}
                    onChange={(e) => setForm({ ...form, profileImageUrl: e.target.value })}
                    className={inputClass}
                    placeholder="https://example.com/photo.jpg"
                  />
                </div>
                <div className="md:col-span-2">
                  <label className="mb-1.5 block text-sm font-medium">{t('teachers.bio')}</label>
                  <textarea
                    value={form.bio}
                    onChange={(e) => setForm({ ...form, bio: e.target.value })}
                    className="min-h-[120px] w-full rounded-xl border border-input bg-background px-4 py-3 text-sm outline-none transition-all focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20"
                    placeholder="Teacher bio (English)"
                  />
                </div>
              </div>
              <div className="flex items-center gap-4">
                <label className="flex items-center gap-2 text-sm font-medium">
                  <input
                    type="checkbox"
                    checked={form.isActive}
                    onChange={(e) => setForm({ ...form, isActive: e.target.checked })}
                    className="h-4 w-4 rounded border-gray-300"
                  />
                  {t('teachers.isActive')}
                </label>
              </div>
              <div className="flex items-center gap-4">
                <Button onClick={handleSave} disabled={saving || !form.name.trim() || !form.slug.trim()}>
                  {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Check className="mr-2 h-4 w-4" />}
                  {t('teachers.save')}
                </Button>
                <Button variant="outline" onClick={cancelEdit}>
                  <X className="mr-2 h-4 w-4" />
                  {t('blog.back')}
                </Button>
              </div>
            </CardContent>
          </Card>
        </AnimatedSection>
      )}

      {/* Teachers list */}
      {loading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="h-8 w-8 animate-spin text-indigo-500" />
        </div>
      ) : teachers.length > 0 ? (
        <StaggerContainer className="space-y-3">
          {teachers.map((teacher) => (
            <StaggerItem key={teacher.id}>
              <Card>
                <CardContent className="flex items-start justify-between gap-4 p-5">
                  <div className="flex min-w-0 flex-1 gap-4">
                    {/* Profile image / avatar */}
                    {teacher.profileImageUrl ? (
                      <img
                        src={teacher.profileImageUrl}
                        alt={teacher.name}
                        className="h-12 w-12 shrink-0 rounded-full object-cover"
                      />
                    ) : (
                      <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-indigo-50">
                        <Users2 className="h-5 w-5 text-indigo-400" />
                      </div>
                    )}
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2.5">
                        <span className="font-semibold">{teacher.name}</span>
                        <Badge
                          className={teacher.isActive ? 'bg-emerald-50 text-emerald-600 border-emerald-200' : ''}
                          variant={teacher.isActive ? 'default' : 'secondary'}
                        >
                          {teacher.isActive ? t('teachers.active') : t('teachers.inactive')}
                        </Badge>
                      </div>
                      <p className="mt-1 text-sm text-muted-foreground">
                        {teacher.slug} &middot; {teacher.email}
                      </p>
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        {teacher.location} &middot; {teacher.timezone}
                      </p>
                    </div>
                  </div>
                  <div className="flex gap-1">
                    <Button variant="ghost" size="sm" onClick={() => startEdit(teacher)}>
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => handleToggle(teacher.id, teacher.isActive)}>
                      {teacher.isActive ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </StaggerItem>
          ))}
        </StaggerContainer>
      ) : (
        <Card>
          <CardContent className="flex flex-col items-center py-16">
            <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-indigo-50">
              <Users2 className="h-8 w-8 text-indigo-300" />
            </div>
            <p className="text-muted-foreground">{t('teachers.noTeachers')}</p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
