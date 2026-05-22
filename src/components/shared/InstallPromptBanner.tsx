import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Download, Share, Plus, X } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface BeforeInstallPromptEvent extends Event {
  readonly platforms: string[];
  readonly userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
  prompt(): Promise<void>;
}

const DISMISS_KEY = 'install-prompt-dismissed';
const DISMISS_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

function isDismissed(): boolean {
  const raw = localStorage.getItem(DISMISS_KEY);
  if (!raw) return false;
  const ts = Number(raw);
  if (!Number.isFinite(ts)) return false;
  return Date.now() - ts < DISMISS_TTL_MS;
}

function setDismissed() {
  localStorage.setItem(DISMISS_KEY, String(Date.now()));
}

function isStandalone(): boolean {
  // iOS Safari exposes a non-standard navigator.standalone; the standard
  // way is the display-mode media query.
  if (typeof window === 'undefined') return false;
  const nav = navigator as Navigator & { standalone?: boolean };
  if (nav.standalone === true) return true;
  return window.matchMedia?.('(display-mode: standalone)').matches ?? false;
}

function detectPlatform(): 'ios-safari' | 'installable' | 'unsupported' {
  if (typeof window === 'undefined') return 'unsupported';
  const ua = navigator.userAgent;
  const isIOS = /iPad|iPhone|iPod/.test(ua) || (ua.includes('Macintosh') && 'ontouchend' in document);
  const isSafariOnIOS = isIOS && /Safari/.test(ua) && !/CriOS|FxiOS|EdgiOS/.test(ua);
  if (isSafariOnIOS) return 'ios-safari';
  // Android Chrome / desktop Chrome / Edge fire beforeinstallprompt — caller
  // will switch to "installable" when the event arrives.
  return 'unsupported';
}

export function InstallPromptBanner() {
  const { t } = useTranslation('common');
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  // Compute initial banner state synchronously so we don't trigger a cascade
  // re-render from inside useEffect.
  const initial = (() => {
    if (typeof window === 'undefined') return { mode: 'installable' as const, show: false };
    if (isStandalone() || isDismissed()) return { mode: 'installable' as const, show: false };
    if (detectPlatform() === 'ios-safari') return { mode: 'ios-safari' as const, show: true };
    return { mode: 'installable' as const, show: false };
  })();
  const [show, setShow] = useState(initial.show);
  const [mode, setMode] = useState<'ios-safari' | 'installable'>(initial.mode);
  const [iosOpen, setIosOpen] = useState(false);

  useEffect(() => {
    if (isStandalone() || isDismissed()) return;

    const onBeforeInstall = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
      setMode('installable');
      setShow(true);
    };
    window.addEventListener('beforeinstallprompt', onBeforeInstall);

    const onAppInstalled = () => {
      setShow(false);
      setDeferredPrompt(null);
    };
    window.addEventListener('appinstalled', onAppInstalled);

    return () => {
      window.removeEventListener('beforeinstallprompt', onBeforeInstall);
      window.removeEventListener('appinstalled', onAppInstalled);
    };
  }, []);

  const dismiss = () => {
    setDismissed();
    setShow(false);
    setIosOpen(false);
  };

  const handleInstall = async () => {
    if (!deferredPrompt) return;
    await deferredPrompt.prompt();
    const choice = await deferredPrompt.userChoice;
    setDeferredPrompt(null);
    setShow(false);
    if (choice.outcome !== 'accepted') setDismissed();
  };

  if (!show) return null;

  return (
    <>
      <div className="fixed inset-x-0 bottom-0 z-40 px-3 pb-3 sm:px-4 sm:pb-4">
        <div className="mx-auto flex max-w-md items-center gap-3 rounded-2xl border border-indigo-100 bg-white px-4 py-3 shadow-lg">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-indigo-50">
            <Download className="h-5 w-5 text-indigo-500" />
          </div>
          <div className="flex-1 text-sm">
            <p className="font-semibold">{t('install.title', { defaultValue: 'Install HaviTalk' })}</p>
            <p className="mt-0.5 text-xs leading-snug text-muted-foreground">
              {t('install.subtitle', {
                defaultValue: 'Add to your home screen to receive lesson reminders.',
              })}
            </p>
          </div>
          {mode === 'installable' ? (
            <Button size="sm" onClick={handleInstall}>
              {t('install.cta', { defaultValue: 'Install' })}
            </Button>
          ) : (
            <Button size="sm" variant="outline" onClick={() => setIosOpen(true)}>
              {t('install.howTo', { defaultValue: 'How' })}
            </Button>
          )}
          <button
            type="button"
            onClick={dismiss}
            aria-label={t('install.dismiss', { defaultValue: 'Dismiss' })}
            className="rounded-md p-1 text-muted-foreground transition-colors hover:bg-zinc-100"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>

      {iosOpen && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 px-4 pb-4 sm:items-center sm:pb-0"
          onClick={dismiss}
        >
          <div
            className="w-full max-w-sm rounded-2xl bg-white p-5 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-3 flex items-center justify-between">
              <h3 className="font-semibold">
                {t('install.iosTitle', { defaultValue: 'Add HaviTalk to your home screen' })}
              </h3>
              <button
                type="button"
                onClick={() => setIosOpen(false)}
                aria-label={t('install.dismiss', { defaultValue: 'Dismiss' })}
                className="rounded-md p-1 text-muted-foreground transition-colors hover:bg-zinc-100"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <ol className="space-y-3 text-sm leading-relaxed">
              <li className="flex items-start gap-2">
                <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-indigo-100 text-xs font-semibold text-indigo-600">
                  1
                </span>
                <span className="flex flex-wrap items-center gap-1.5">
                  {t('install.iosStep1', { defaultValue: 'Tap' })}
                  <Share className="inline h-4 w-4 text-indigo-500" />
                  {t('install.iosStep1Tail', { defaultValue: "in Safari's bottom bar." })}
                </span>
              </li>
              <li className="flex items-start gap-2">
                <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-indigo-100 text-xs font-semibold text-indigo-600">
                  2
                </span>
                <span className="flex flex-wrap items-center gap-1.5">
                  {t('install.iosStep2', { defaultValue: 'Scroll and tap' })}
                  <span className="inline-flex items-center gap-1 rounded-md bg-zinc-100 px-1.5 py-0.5 text-xs font-medium">
                    <Plus className="h-3 w-3" />
                    {t('install.iosStep2Action', { defaultValue: 'Add to Home Screen' })}
                  </span>
                </span>
              </li>
              <li className="flex items-start gap-2">
                <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-indigo-100 text-xs font-semibold text-indigo-600">
                  3
                </span>
                <span>
                  {t('install.iosStep3', {
                    defaultValue: 'Tap Add. Open HaviTalk from the new home-screen icon to enable notifications.',
                  })}
                </span>
              </li>
            </ol>
            <Button className="mt-5 w-full" onClick={dismiss}>
              {t('install.gotIt', { defaultValue: 'Got it' })}
            </Button>
          </div>
        </div>
      )}
    </>
  );
}
