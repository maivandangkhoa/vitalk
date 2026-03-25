import { useEffect } from 'react';
import { RouterProvider } from 'react-router-dom';
import { onAuthStateChanged } from 'firebase/auth';
import { auth } from '@/lib/firebase';
import { getUserRole } from '@/lib/auth';
import { useAuthStore } from '@/stores/authStore';
import { router } from '@/router';
import { Toaster } from '@/components/ui/sonner';
import '@/lib/i18n';

export default function App() {
  const { setUser, setRole, setLoading } = useAuthStore();

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      setUser(user);
      if (user) {
        const role = await getUserRole(user);
        setRole(role);
      } else {
        setRole('user');
      }
      setLoading(false);
    });

    return () => unsubscribe();
  }, [setUser, setRole, setLoading]);

  return (
    <>
      <RouterProvider router={router} />
      <Toaster />
    </>
  );
}
