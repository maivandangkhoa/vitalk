import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import {
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  updateDoc,
  addDoc,
  query,
  serverTimestamp,
} from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  CheckCircle,
  AlertCircle,
  Loader2,
  Database,
  ArrowRight,
  RefreshCw,
} from 'lucide-react';
import { toast } from 'sonner';

interface MigrationStatus {
  hasOldProfile: boolean;
  hasTeachers: boolean;
  oldAvailabilityCount: number;
  bookingsWithoutTeacher: number;
  reviewsWithoutTeacher: number;
  teacherCount: number;
}

interface StepResult {
  status: 'idle' | 'running' | 'done' | 'error';
  message: string;
}

const INITIAL_STATUS: MigrationStatus = {
  hasOldProfile: false,
  hasTeachers: false,
  oldAvailabilityCount: 0,
  bookingsWithoutTeacher: 0,
  reviewsWithoutTeacher: 0,
  teacherCount: 0,
};

export default function AdminMigration() {
  const { t } = useTranslation('admin');
  const [status, setStatus] = useState<MigrationStatus>(INITIAL_STATUS);
  const [checking, setChecking] = useState(true);

  // Form fields
  const [teacherUid, setTeacherUid] = useState('');
  const [teacherEmail, setTeacherEmail] = useState('');
  const [teacherSlug, setTeacherSlug] = useState('');

  // Migration progress
  const [migrating, setMigrating] = useState(false);
  const [steps, setSteps] = useState<StepResult[]>([
    { status: 'idle', message: '' },
    { status: 'idle', message: '' },
    { status: 'idle', message: '' },
    { status: 'idle', message: '' },
    { status: 'idle', message: '' },
  ]);
  const [createdTeacherId, setCreatedTeacherId] = useState('');

  const checkStatus = async () => {
    setChecking(true);
    try {
      // Check old profile
      const profileSnap = await getDoc(doc(db, 'profile', 'teacher'));

      // Check old availability
      const availSnap = await getDocs(collection(db, 'availability'));

      // Check teachers collection
      const teachersSnap = await getDocs(collection(db, 'teachers'));

      // Check bookings without teacherId
      const bookingsSnap = await getDocs(collection(db, 'bookings'));
      const bookingsWithoutTeacher = bookingsSnap.docs.filter(
        (d) => !d.data().teacherId
      ).length;

      // Check reviews without teacherId
      const reviewsSnap = await getDocs(collection(db, 'reviews'));
      const reviewsWithoutTeacher = reviewsSnap.docs.filter(
        (d) => !d.data().teacherId
      ).length;

      setStatus({
        hasOldProfile: profileSnap.exists(),
        hasTeachers: !teachersSnap.empty,
        oldAvailabilityCount: availSnap.size,
        bookingsWithoutTeacher,
        reviewsWithoutTeacher,
        teacherCount: teachersSnap.size,
      });
    } catch (err) {
      console.error('Failed to check migration status:', err);
    } finally {
      setChecking(false);
    }
  };

  useEffect(() => {
    checkStatus();
  }, []);

  const updateStep = (index: number, update: StepResult) => {
    setSteps((prev) => prev.map((s, i) => (i === index ? update : s)));
  };

  const runMigration = async () => {
    if (!teacherUid || !teacherEmail || !teacherSlug) {
      toast.error(t('migration.fillRequired', 'Please fill in all required fields'));
      return;
    }

    setMigrating(true);
    setSteps([
      { status: 'idle', message: '' },
      { status: 'idle', message: '' },
      { status: 'idle', message: '' },
      { status: 'idle', message: '' },
      { status: 'idle', message: '' },
    ]);

    try {
      // Step 1: Create teacher from old profile
      updateStep(0, { status: 'running', message: '' });
      const profileSnap = await getDoc(doc(db, 'profile', 'teacher'));
      if (!profileSnap.exists()) {
        updateStep(0, { status: 'error', message: t('migration.noOldProfile', 'No old profile found') });
        setMigrating(false);
        return;
      }
      const profileData = profileSnap.data();
      const teacherRef = await addDoc(collection(db, 'teachers'), {
        ...profileData,
        slug: teacherSlug,
        uid: teacherUid,
        email: teacherEmail,
        timezone: 'Asia/Seoul',
        isActive: true,
        sortOrder: 0,
        createdAt: profileData.updatedAt || serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      const teacherId = teacherRef.id;
      setCreatedTeacherId(teacherId);
      updateStep(0, {
        status: 'done',
        message: `${t('migration.createdTeacher', 'Created teacher')}: ${profileData.name} (${teacherId})`,
      });

      // Step 2: Copy availability
      updateStep(1, { status: 'running', message: '' });
      const availSnap = await getDocs(collection(db, 'availability'));
      let copiedCount = 0;
      for (const availDoc of availSnap.docs) {
        await setDoc(
          doc(db, 'teachers', teacherId, 'availability', availDoc.id),
          availDoc.data()
        );
        copiedCount++;
      }
      updateStep(1, {
        status: 'done',
        message: `${t('migration.copiedAvailability', 'Copied availability')}: ${copiedCount} ${t('migration.documents', 'documents')}`,
      });

      // Step 3: Update bookings
      updateStep(2, { status: 'running', message: '' });
      const bookingsSnap = await getDocs(collection(db, 'bookings'));
      let updatedBookings = 0;
      for (const bookingDoc of bookingsSnap.docs) {
        if (!bookingDoc.data().teacherId) {
          await updateDoc(bookingDoc.ref, {
            teacherId,
            teacherName: profileData.name || '',
          });
          updatedBookings++;
        }
      }
      updateStep(2, {
        status: 'done',
        message: `${t('migration.updatedBookings', 'Updated bookings')}: ${updatedBookings}`,
      });

      // Step 4: Update reviews
      updateStep(3, { status: 'running', message: '' });
      const reviewsSnap = await getDocs(collection(db, 'reviews'));
      let updatedReviews = 0;
      for (const reviewDoc of reviewsSnap.docs) {
        if (!reviewDoc.data().teacherId) {
          await updateDoc(reviewDoc.ref, { teacherId });
          updatedReviews++;
        }
      }
      updateStep(3, {
        status: 'done',
        message: `${t('migration.updatedReviews', 'Updated reviews')}: ${updatedReviews}`,
      });

      // Step 5: Update user doc
      updateStep(4, { status: 'running', message: '' });
      const userRef = doc(db, 'users', teacherUid);
      const userSnap = await getDoc(userRef);
      if (userSnap.exists()) {
        await updateDoc(userRef, { teacherId, role: 'teacher' });
        updateStep(4, {
          status: 'done',
          message: t('migration.updatedUser', 'Updated user with teacherId and role'),
        });
      } else {
        updateStep(4, {
          status: 'error',
          message: t('migration.userNotFound', 'User not found with this UID'),
        });
      }

      toast.success(t('migration.complete', 'Migration completed successfully!'));
      await checkStatus();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      toast.error(`${t('migration.failed', 'Migration failed')}: ${message}`);
    } finally {
      setMigrating(false);
    }
  };

  const stepLabels = [
    t('migration.step1', 'Create teacher profile from old data'),
    t('migration.step2', 'Copy availability to teacher subcollection'),
    t('migration.step3', 'Add teacherId to bookings'),
    t('migration.step4', 'Add teacherId to reviews'),
    t('migration.step5', 'Update user document'),
  ];

  const needsMigration =
    status.hasOldProfile &&
    (!status.hasTeachers ||
      status.bookingsWithoutTeacher > 0 ||
      status.reviewsWithoutTeacher > 0);

  return (
    <div className="mx-auto max-w-3xl space-y-8">
      <div>
        <h1 className="text-2xl font-bold">{t('migration.title', 'Data Migration')}</h1>
        <p className="mt-1 text-muted-foreground">
          {t('migration.subtitle', 'Migrate from single-teacher to multi-teacher data structure')}
        </p>
      </div>

      {/* Status Card */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <h2 className="font-semibold">{t('migration.currentStatus', 'Current Status')}</h2>
          <Button
            variant="ghost"
            size="sm"
            onClick={checkStatus}
            disabled={checking}
          >
            <RefreshCw className={`mr-1 h-4 w-4 ${checking ? 'animate-spin' : ''}`} />
            {t('migration.refresh', 'Refresh')}
          </Button>
        </CardHeader>
        <CardContent>
          {checking ? (
            <div className="flex items-center gap-2 text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              {t('migration.checking', 'Checking data...')}
            </div>
          ) : (
            <div className="space-y-3">
              <StatusRow
                label={t('migration.oldProfile', 'Old profile (profile/teacher)')}
                exists={status.hasOldProfile}
              />
              <StatusRow
                label={t('migration.teachersCollection', 'Teachers collection')}
                exists={status.hasTeachers}
                count={status.teacherCount}
              />
              <StatusRow
                label={t('migration.oldAvailability', 'Old availability docs')}
                exists={status.oldAvailabilityCount > 0}
                count={status.oldAvailabilityCount}
              />
              <div className="flex items-center justify-between text-sm">
                <span>{t('migration.bookingsNoTeacher', 'Bookings without teacherId')}</span>
                <Badge variant={status.bookingsWithoutTeacher > 0 ? 'destructive' : 'secondary'}>
                  {status.bookingsWithoutTeacher}
                </Badge>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span>{t('migration.reviewsNoTeacher', 'Reviews without teacherId')}</span>
                <Badge variant={status.reviewsWithoutTeacher > 0 ? 'destructive' : 'secondary'}>
                  {status.reviewsWithoutTeacher}
                </Badge>
              </div>

              {!needsMigration && status.hasTeachers && (
                <div className="mt-4 flex items-center gap-2 rounded-lg bg-emerald-50 p-3 text-sm text-emerald-700">
                  <CheckCircle className="h-4 w-4" />
                  {t('migration.allDone', 'All data has been migrated successfully!')}
                </div>
              )}
              {!status.hasOldProfile && !status.hasTeachers && (
                <div className="mt-4 flex items-center gap-2 rounded-lg bg-amber-50 p-3 text-sm text-amber-700">
                  <AlertCircle className="h-4 w-4" />
                  {t('migration.noData', 'No old profile data found. Nothing to migrate.')}
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Migration Form */}
      {needsMigration && (
        <Card>
          <CardHeader>
            <h2 className="font-semibold">{t('migration.runMigration', 'Run Migration')}</h2>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="grid gap-4 sm:grid-cols-3">
              <div>
                <label className="mb-1 block text-sm font-medium">
                  {t('migration.teacherUid', 'Teacher Firebase UID')} *
                </label>
                <input
                  type="text"
                  value={teacherUid}
                  onChange={(e) => setTeacherUid(e.target.value)}
                  placeholder="abc123..."
                  className="h-10 w-full rounded-lg border px-3 text-sm"
                  disabled={migrating}
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium">
                  {t('migration.teacherEmail', 'Teacher Email')} *
                </label>
                <input
                  type="email"
                  value={teacherEmail}
                  onChange={(e) => setTeacherEmail(e.target.value)}
                  placeholder="teacher@example.com"
                  className="h-10 w-full rounded-lg border px-3 text-sm"
                  disabled={migrating}
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium">
                  {t('migration.teacherSlug', 'URL Slug')} *
                </label>
                <input
                  type="text"
                  value={teacherSlug}
                  onChange={(e) => setTeacherSlug(e.target.value)}
                  placeholder="win"
                  className="h-10 w-full rounded-lg border px-3 text-sm"
                  disabled={migrating}
                />
                <p className="mt-1 text-xs text-muted-foreground">/teachers/{teacherSlug || 'slug'}</p>
              </div>
            </div>

            {/* Steps Progress */}
            <div className="space-y-3">
              {stepLabels.map((label, i) => (
                <div
                  key={i}
                  className={`flex items-center gap-3 rounded-lg border p-3 text-sm ${
                    steps[i].status === 'done'
                      ? 'border-emerald-200 bg-emerald-50'
                      : steps[i].status === 'error'
                        ? 'border-red-200 bg-red-50'
                        : steps[i].status === 'running'
                          ? 'border-indigo-200 bg-indigo-50'
                          : 'border-zinc-100'
                  }`}
                >
                  <div className="flex h-6 w-6 shrink-0 items-center justify-center">
                    {steps[i].status === 'running' ? (
                      <Loader2 className="h-4 w-4 animate-spin text-indigo-500" />
                    ) : steps[i].status === 'done' ? (
                      <CheckCircle className="h-4 w-4 text-emerald-500" />
                    ) : steps[i].status === 'error' ? (
                      <AlertCircle className="h-4 w-4 text-red-500" />
                    ) : (
                      <Database className="h-4 w-4 text-zinc-400" />
                    )}
                  </div>
                  <div className="flex-1">
                    <span className="font-medium">{label}</span>
                    {steps[i].message && (
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        {steps[i].message}
                      </p>
                    )}
                  </div>
                </div>
              ))}
            </div>

            <Button
              className="h-12 w-full"
              onClick={runMigration}
              disabled={migrating || !teacherUid || !teacherEmail || !teacherSlug}
            >
              {migrating ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  {t('migration.migrating', 'Migrating...')}
                </>
              ) : (
                <>
                  <ArrowRight className="mr-2 h-4 w-4" />
                  {t('migration.startMigration', 'Start Migration')}
                </>
              )}
            </Button>

            {createdTeacherId && (
              <div className="rounded-lg bg-zinc-50 p-3 text-sm">
                <span className="font-medium">Teacher ID: </span>
                <code className="rounded bg-zinc-200 px-1.5 py-0.5 text-xs">{createdTeacherId}</code>
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function StatusRow({
  label,
  exists,
  count,
}: {
  label: string;
  exists: boolean;
  count?: number;
}) {
  return (
    <div className="flex items-center justify-between text-sm">
      <span>{label}</span>
      <Badge variant={exists ? 'secondary' : 'outline'}>
        {exists ? (count != null ? count : 'Yes') : 'No'}
      </Badge>
    </div>
  );
}
