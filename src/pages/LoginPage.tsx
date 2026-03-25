import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { signInWithGoogle, signInWithEmail, signUpWithEmail } from '@/lib/auth';
import { toast } from 'sonner';
import { AnimatedSection } from '@/components/shared/motion';

export default function LoginPage() {
  const { t } = useTranslation('common');
  const navigate = useNavigate();
  const [isLogin, setIsLogin] = useState(true);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

  const handleGoogleLogin = async () => {
    try {
      setLoading(true);
      await signInWithGoogle();
      navigate('/');
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error('Google login error:', err);
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  };

  const handleKakaoLogin = () => {
    toast.info('Kakao login coming soon');
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
      navigate('/');
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error('Email auth error:', err);
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="relative flex min-h-[60vh] items-center justify-center px-4 py-16">
      <div className="absolute inset-0 bg-gradient-to-br from-indigo-50 via-purple-50/30 to-zinc-50" />
      <div className="absolute -top-40 right-1/4 h-80 w-80 rounded-full bg-indigo-200/20 blur-3xl" />
      <div className="absolute -bottom-40 left-1/4 h-80 w-80 rounded-full bg-purple-200/15 blur-3xl" />

      <AnimatedSection className="relative w-full max-w-md">
        <Card className="border-zinc-100 bg-white/80 shadow-lg backdrop-blur-md">
          <CardHeader className="text-center">
            <h1 className="text-2xl font-bold">
              {isLogin ? t('auth.loginTitle') : t('auth.signupTitle')}
            </h1>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Social logins */}
            <Button
              variant="outline"
              className="w-full rounded-xl border-zinc-200 hover:bg-zinc-50"
              onClick={handleGoogleLogin}
              disabled={loading}
            >
              <svg className="mr-2 h-4 w-4" viewBox="0 0 24 24">
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
              className="w-full rounded-xl bg-[#FEE500] text-[#191919] hover:bg-[#FDD800]"
              onClick={handleKakaoLogin}
              disabled={loading}
            >
              <svg className="mr-2 h-4 w-4" viewBox="0 0 24 24">
                <path
                  fill="currentColor"
                  d="M12 3C6.477 3 2 6.463 2 10.691c0 2.726 1.8 5.117 4.5 6.473-.2.744-.723 2.694-.828 3.112-.13.517.19.51.398.371.163-.108 2.6-1.767 3.652-2.485.738.109 1.5.166 2.278.166 5.523 0 10-3.463 10-7.637C22 6.463 17.523 3 12 3z"
                />
              </svg>
              {t('auth.loginWithKakao')}
            </Button>

            <div className="flex items-center gap-3">
              <Separator className="flex-1" />
              <span className="text-xs text-zinc-400">or</span>
              <Separator className="flex-1" />
            </div>

            {/* Email form */}
            <form onSubmit={handleEmailSubmit} className="space-y-3">
              <div>
                <label className="mb-1 block text-sm font-medium">{t('auth.email')}</label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  className="w-full rounded-xl border border-input bg-background px-3 py-2 text-sm outline-none transition-all focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20"
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium">{t('auth.password')}</label>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  minLength={6}
                  className="w-full rounded-xl border border-input bg-background px-3 py-2 text-sm outline-none transition-all focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20"
                />
              </div>
              <Button type="submit" className="w-full" disabled={loading}>
                {isLogin ? t('auth.loginWithEmail') : t('auth.signupWithEmail')}
              </Button>
            </form>

            <p className="text-center text-sm text-muted-foreground">
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
