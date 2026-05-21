import { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { Eye, EyeOff } from 'lucide-react';
import { signInWithGoogle, signInWithEmail, signUpWithEmail } from '@/lib/auth';
import { toast } from 'sonner';
import { AnimatedSection } from '@/components/shared/motion';

function authErrorKey(err: unknown): string {
  const code = (err as { code?: string })?.code;
  switch (code) {
    case 'auth/email-already-in-use': return 'auth.errors.emailInUse';
    case 'auth/invalid-email': return 'auth.errors.invalidEmail';
    case 'auth/weak-password': return 'auth.errors.weakPassword';
    case 'auth/wrong-password': return 'auth.errors.wrongPassword';
    case 'auth/user-not-found': return 'auth.errors.userNotFound';
    case 'auth/invalid-credential':
    case 'auth/invalid-login-credentials': return 'auth.errors.invalidCredential';
    case 'auth/too-many-requests': return 'auth.errors.tooManyRequests';
    case 'auth/network-request-failed': return 'auth.errors.network';
    default: return 'auth.errors.default';
  }
}

export default function LoginPage() {
  const { t } = useTranslation('common');
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  // Where to send the user after a successful login. Only allow relative
  // paths so this can't be turned into an open redirect.
  const redirectParam = searchParams.get('redirect') || '/';
  const redirectTo = redirectParam.startsWith('/') ? redirectParam : '/';
  const [isLogin, setIsLogin] = useState(true);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleOAuthMessage = useCallback(
    (event: MessageEvent) => {
      if (event.origin !== window.location.origin) return;
      const type = event.data?.type;
      if (type === 'NAVER_LOGIN_SUCCESS' || type === 'KAKAO_LOGIN_SUCCESS') {
        navigate(redirectTo);
      } else if (type === 'NAVER_LOGIN_ERROR') {
        toast.error(event.data.error || 'Naver login failed');
      } else if (type === 'KAKAO_LOGIN_ERROR') {
        toast.error(event.data.error || 'Kakao login failed');
      }
    },
    [navigate, redirectTo]
  );

  useEffect(() => {
    window.addEventListener('message', handleOAuthMessage);
    return () => window.removeEventListener('message', handleOAuthMessage);
  }, [handleOAuthMessage]);

  const handleGoogleLogin = async () => {
    try {
      setLoading(true);
      await signInWithGoogle();
      navigate(redirectTo);
    } catch (err) {
      const code = (err as { code?: string })?.code;
      if (code === 'auth/popup-closed-by-user' || code === 'auth/cancelled-popup-request') {
        return;
      }
      const key = authErrorKey(err);
      toast.error(t(key));
      if (key === 'auth.errors.default') {
        console.error('Unexpected Google login error:', err);
      }
    } finally {
      setLoading(false);
    }
  };

  const handleKakaoLogin = () => {
    const clientId = import.meta.env.VITE_KAKAO_CLIENT_ID;
    if (!clientId) {
      toast.error('Kakao login is not configured');
      return;
    }

    const state = crypto.randomUUID();
    localStorage.setItem('kakao_oauth_state', state);

    const redirectUri = `${window.location.origin}/auth/kakao/callback`;
    const params = new URLSearchParams({
      response_type: 'code',
      client_id: clientId,
      redirect_uri: redirectUri,
      state,
    });

    const kakaoAuthUrl = `https://kauth.kakao.com/oauth/authorize?${params.toString()}`;

    const width = 500;
    const height = 600;
    const left = window.screenX + (window.outerWidth - width) / 2;
    const top = window.screenY + (window.outerHeight - height) / 2;
    const popup = window.open(
      kakaoAuthUrl,
      'kakao-login',
      `width=${width},height=${height},left=${left},top=${top}`
    );

    if (!popup) {
      toast.error('Popup blocked. Please allow popups for this site.');
    }
  };

  const handleNaverLogin = () => {
    const clientId = import.meta.env.VITE_NAVER_CLIENT_ID;
    if (!clientId) {
      toast.error('Naver login is not configured');
      return;
    }

    const state = crypto.randomUUID();
    localStorage.setItem('naver_oauth_state', state);

    const redirectUri = `${window.location.origin}/auth/naver/callback`;
    const params = new URLSearchParams({
      response_type: 'code',
      client_id: clientId,
      redirect_uri: redirectUri,
      state,
    });

    const naverAuthUrl = `https://nid.naver.com/oauth2.0/authorize?${params.toString()}`;

    const width = 500;
    const height = 600;
    const left = window.screenX + (window.outerWidth - width) / 2;
    const top = window.screenY + (window.outerHeight - height) / 2;
    const popup = window.open(
      naverAuthUrl,
      'naver-login',
      `width=${width},height=${height},left=${left},top=${top}`
    );

    if (!popup) {
      toast.error('Popup blocked. Please allow popups for this site.');
    }
  };

  const handleEmailSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setLoading(true);
      if (isLogin) {
        await signInWithEmail(email, password);
      } else {
        await signUpWithEmail(email, password);
      }
      navigate(redirectTo);
    } catch (err) {
      const code = (err as { code?: string })?.code;
      const key = authErrorKey(err);
      toast.error(t(key));
      if (key === 'auth.errors.default') {
        console.error('Unexpected email auth error:', err);
      }
      if (!isLogin && code === 'auth/email-already-in-use') {
        setIsLogin(true);
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="relative flex min-h-[60vh] items-center justify-center px-4 py-16">
      <div className="absolute inset-0 bg-gradient-to-br from-indigo-50 via-purple-50/30 to-zinc-50" />
      <div className="absolute -top-40 right-1/4 h-80 w-80 rounded-full bg-indigo-200/20 blur-3xl" />
      <div className="absolute -bottom-40 left-1/4 h-80 w-80 rounded-full bg-purple-200/15 blur-3xl" />

      <AnimatedSection className="relative w-full max-w-lg">
        <Card className="border-zinc-100 bg-white/80 shadow-lg backdrop-blur-md">
          <CardHeader className="px-8 pb-2 pt-8 text-center">
            <h1 className="text-2xl font-bold">
              {isLogin ? t('auth.loginTitle') : t('auth.signupTitle')}
            </h1>
          </CardHeader>
          <CardContent className="space-y-5 px-8 pb-8">
            {isLogin && (<>
            {/* Social logins */}
            <Button
              variant="outline"
              className="h-12 w-full rounded-xl border-zinc-200 hover:bg-zinc-50"
              onClick={handleGoogleLogin}
              disabled={loading}
            >
              <svg className="mr-2.5 h-4 w-4" viewBox="0 0 24 24">
                <path
                  fill="currentColor"
                  d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z"
                />
                <path
                  fill="currentColor"
                  d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                />
                <path
                  fill="currentColor"
                  d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                />
                <path
                  fill="currentColor"
                  d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                />
              </svg>
              {t('auth.loginWithGoogle')}
            </Button>

            <Button
              variant="outline"
              className="h-12 w-full rounded-xl bg-[#FEE500] text-[#191919] hover:bg-[#FDD800]"
              onClick={handleKakaoLogin}
              disabled={loading}
            >
              <svg className="mr-2.5 h-4 w-4" viewBox="0 0 24 24">
                <path
                  fill="currentColor"
                  d="M12 3C6.477 3 2 6.463 2 10.691c0 2.726 1.8 5.117 4.5 6.473-.2.744-.723 2.694-.828 3.112-.13.517.19.51.398.371.163-.108 2.6-1.767 3.652-2.485.738.109 1.5.166 2.278.166 5.523 0 10-3.463 10-7.637C22 6.463 17.523 3 12 3z"
                />
              </svg>
              {t('auth.loginWithKakao')}
            </Button>

            <Button
              variant="outline"
              className="h-12 w-full rounded-xl bg-[#03C75A] text-white hover:bg-[#02b351]"
              onClick={handleNaverLogin}
              disabled={loading}
            >
              <svg className="mr-2.5 h-4 w-4" viewBox="0 0 24 24">
                <path
                  fill="currentColor"
                  d="M16.273 12.845 7.376 0H0v24h7.727V11.155L16.624 24H24V0h-7.727v12.845z"
                />
              </svg>
              {t('auth.loginWithNaver')}
            </Button>

            <div className="flex items-center gap-4">
              <Separator className="flex-1" />
              <span className="text-xs text-zinc-400">{t('auth.or')}</span>
              <Separator className="flex-1" />
            </div>
            </>)}

            {/* Email form */}
            <form onSubmit={handleEmailSubmit} className="space-y-4">
              <div>
                <label className="mb-1.5 block text-sm font-medium">{t('auth.email')}</label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  className="h-12 w-full rounded-xl border border-input bg-background px-4 text-sm outline-none transition-all focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20"
                />
              </div>
              <div>
                <label className="mb-1.5 block text-sm font-medium">{t('auth.password')}</label>
                <div className="relative">
                  <input
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    minLength={6}
                    className="h-12 w-full rounded-xl border border-input bg-background px-4 pr-12 text-sm outline-none transition-all focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((v) => !v)}
                    aria-label={showPassword ? t('auth.hidePassword') : t('auth.showPassword')}
                    className="absolute right-3 top-1/2 -translate-y-1/2 rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-zinc-100 hover:text-foreground"
                    tabIndex={-1}
                  >
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>
              <Button type="submit" className="mt-1 h-12 w-full" disabled={loading}>
                {isLogin ? t('auth.loginWithEmail') : t('auth.signupWithEmail')}
              </Button>
            </form>

            <p className="text-center text-sm leading-relaxed text-muted-foreground">
              {isLogin ? t('auth.noAccount') : t('auth.hasAccount')}{' '}
              <button
                type="button"
                onClick={() => setIsLogin(!isLogin)}
                className="font-medium text-indigo-500 hover:underline"
              >
                {isLogin ? t('auth.signupTitle') : t('auth.loginTitle')}
              </button>
            </p>
          </CardContent>
        </Card>
      </AnimatedSection>
    </div>
  );
}
