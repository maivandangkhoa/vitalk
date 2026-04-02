import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { httpsCallable } from 'firebase/functions';
import { functions } from '@/lib/firebase';
import { signInWithNaverToken } from '@/lib/auth';
import { LoadingSpinner } from '@/components/shared/LoadingSpinner';

export default function NaverCallbackPage() {
  const [searchParams] = useSearchParams();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const handleCallback = async () => {
      const code = searchParams.get('code');
      const state = searchParams.get('state');
      const savedState = localStorage.getItem('naver_oauth_state');

      if (!code || !state) {
        setError('Missing authorization code');
        return;
      }

      if (state !== savedState) {
        setError('Invalid state parameter');
        return;
      }

      localStorage.removeItem('naver_oauth_state');

      try {
        const naverLoginFn = httpsCallable<
          { code: string; state: string },
          { customToken: string }
        >(functions, 'naverLogin');

        const result = await naverLoginFn({ code, state });
        await signInWithNaverToken(result.data.customToken);

        if (window.opener) {
          window.opener.postMessage(
            { type: 'NAVER_LOGIN_SUCCESS' },
            window.location.origin
          );
          window.close();
        } else {
          window.location.href = '/';
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Naver login failed';
        setError(msg);
        if (window.opener) {
          window.opener.postMessage(
            { type: 'NAVER_LOGIN_ERROR', error: msg },
            window.location.origin
          );
        }
      }
    };

    handleCallback();
  }, [searchParams]);

  if (error) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <p className="text-lg text-red-500">{error}</p>
      </div>
    );
  }

  return <LoadingSpinner />;
}
