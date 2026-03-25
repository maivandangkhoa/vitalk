import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { toast } from 'sonner';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { onAuthStateChanged, type User } from 'firebase/auth';
import { auth } from '@/lib/firebase';
import { Loader2 } from 'lucide-react';

export default function AdminSetupPage() {
  const [setupKey, setSetupKey] = useState('');
  const [loading, setLoading] = useState(false);
  const [user, setUser] = useState<User | null>(null);
  const [authLoading, setAuthLoading] = useState(true);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => {
      setUser(u);
      setAuthLoading(false);
    });
    return unsub;
  }, []);

  const handleSetup = async () => {
    if (!user) {
      toast.error('Please login first');
      return;
    }
    if (!setupKey) {
      toast.error('Enter setup key');
      return;
    }

    setLoading(true);
    try {
      const setUserRole = httpsCallable(getFunctions(), 'setUserRole');
      const result = await setUserRole({
        uid: user.uid,
        role: 'admin',
        setupKey,
      });
      console.log('Result:', result.data);
      toast.success('Admin role set! Please logout and login again.');
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error('Setup error:', err);
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  };

  if (authLoading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-indigo-500" />
      </div>
    );
  }

  return (
    <div className="flex min-h-[60vh] items-center justify-center px-4 py-16">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <h1 className="text-2xl font-bold">Admin Setup</h1>
          <p className="text-sm text-muted-foreground">
            First-time admin setup. Enter the setup key to grant admin role.
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          {user ? (
            <>
              <p className="text-sm">
                Logged in as: <span className="font-medium">{user.email}</span>
              </p>
              <p className="text-xs text-muted-foreground">
                UID: {user.uid}
              </p>
              <input
                type="password"
                placeholder="Setup Key"
                value={setupKey}
                onChange={(e) => setSetupKey(e.target.value)}
                className="w-full rounded-xl border border-input bg-background px-3 py-2 text-sm outline-none transition-all focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20"
              />
              <Button onClick={handleSetup} disabled={loading} className="w-full">
                {loading ? 'Setting up...' : 'Set Admin Role'}
              </Button>
            </>
          ) : (
            <p className="text-center text-muted-foreground">
              Please <a href="/login" className="text-indigo-500 hover:underline">login</a> first.
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
