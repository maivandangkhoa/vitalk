import { useEffect } from 'react';
import { RouterProvider } from 'react-router-dom';
import { onAuthStateChanged } from 'firebase/auth';
import { auth } from '@/lib/firebase';
import { getUserRole } from '@/lib/auth';
import { useAuthStore } from '@/stores/authStore';
import { useAppUpdate } from '@/hooks/useAppUpdate';
import { usePageViews } from '@/hooks/usePageViews';
import { setAnalyticsUser } from '@/lib/analytics';
import { router } from '@/router';
import { Toaster } from '@/components/ui/sonner';
import '@/lib/i18n';

export default function App() {
  const { setUser, setRole, setTeacherId, setLoading } = useAuthStore();

  useAppUpdate();
  usePageViews();

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      setUser(user);
      if (user) {
        const { role, teacherId } = await getUserRole(user);
        setRole(role);
        setTeacherId(teacherId);
        setAnalyticsUser(user.uid, role);
      } else {
        setRole('user');
        setTeacherId(null);
        setAnalyticsUser(null, null);
      }
      setLoading(false);
    });

    return () => unsubscribe();
  }, [setUser, setRole, setTeacherId, setLoading]);

  return (
    <>
      <RouterProvider router={router} />
      <Toaster />
    </>
  );
}
