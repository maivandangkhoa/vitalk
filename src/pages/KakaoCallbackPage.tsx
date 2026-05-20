import { useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { httpsCallable } from 'firebase/functions';
import { functions } from '@/lib/firebase';
import { signInWithKakaoToken } from '@/lib/auth';
import { LoadingSpinner } from '@/components/shared/LoadingSpinner';

export default function KakaoCallbackPage() {
  const [searchParams] = useSearchParams();
  const [error, setError] = useState<string | null>(null);
  const ranRef = useRef(false);

  useEffect(() => {
    if (ranRef.current) return;
    ranRef.current = true;
    const handleCallback = async () => {
      const code = searchParams.get('code');
      const state = searchParams.get('state');
      const savedState = localStorage.getItem('kakao_oauth_state');

      if (!code) {
        setError('Missing authorization code');
        return;
      }

      if (!state || state !== savedState) {
        setError('Invalid state parameter');
        return;
      }

      localStorage.removeItem('kakao_oauth_state');

      const redirectUri = `${window.location.origin}/auth/kakao/callback`;

      try {
        const kakaoLoginFn = httpsCallable<
          { code: string; redirectUri: string },
          { customToken: string }
        >(functions, 'kakaoLogin');

        const result = await kakaoLoginFn({ code, redirectUri });
        await signInWithKakaoToken(result.data.customToken);

        if (window.opener) {
          window.opener.postMessage(
            { type: 'KAKAO_LOGIN_SUCCESS' },
            window.location.origin
          );
          window.close();
        } else {
          window.location.href = '/';
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Kakao login failed';
        setError(msg);
        if (window.opener) {
          window.opener.postMessage(
            { type: 'KAKAO_LOGIN_ERROR', error: msg },
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
