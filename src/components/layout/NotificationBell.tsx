import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Bell } from 'lucide-react';
import { toast } from 'sonner';
import { useNotifications } from '@/hooks/useNotifications';
import { useAuthStore } from '@/stores/authStore';
import {
  getPushPermission,
  isPushSupported,
  listenForegroundMessages,
  requestPushPermission,
} from '@/lib/messaging';
import type { AppNotification, Language } from '@/types';

function formatRelative(ts: AppNotification['createdAt'], locale: string): string {
  if (!ts) return '';
  const date = ts.toDate();
  const diff = Date.now() - date.getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return locale === 'vi' ? 'vừa xong' : 'just now';
  if (mins < 60) return `${mins}m`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days}d`;
  return date.toLocaleDateString(locale);
}

function getLessonName(n: AppNotification, lang: Language): string {
  const lessonName = n.meta.lessonName;
  if (!lessonName) return '';
  return lessonName[lang] || lessonName.en || '';
}

export function NotificationBell() {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const lang = (i18n.language || 'en').split('-')[0] as Language;
  const { user } = useAuthStore();
  const { items, unreadCount, markAsRead, markAllAsRead, eligible } = useNotifications();
  const [open, setOpen] = useState(false);
  const [pushSupported, setPushSupported] = useState(false);
  const [pushPermission, setPushPermission] = useState<NotificationPermission | 'unsupported'>(
    'default'
  );
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onClick);
    document.addEventListener('keydown', onEsc);
    return () => {
      document.removeEventListener('mousedown', onClick);
      document.removeEventListener('keydown', onEsc);
    };
  }, [open]);

  useEffect(() => {
    if (!eligible) return;
    let unsub: (() => void) | undefined;
    isPushSupported().then((supported) => {
      setPushSupported(supported);
      setPushPermission(getPushPermission());
      if (supported && getPushPermission() === 'granted') {
        listenForegroundMessages().then((u) => {
          unsub = u;
        });
      }
    });
    return () => unsub?.();
  }, [eligible]);

  const handleEnablePush = async () => {
    if (!user) return;
    const res = await requestPushPermission(user.uid);
    setPushPermission(getPushPermission());
    if (res.ok) {
      toast.success(t('notifications.enabled'));
      const unsub = await listenForegroundMessages();
      void unsub;
    } else if (res.reason === 'denied') {
      toast.error(t('notifications.denied'));
    }
  };

  if (!eligible) return null;

  const handleClick = async (n: AppNotification) => {
    if (!n.read) await markAsRead(n.id);
    setOpen(false);
    navigate('/admin/bookings');
  };

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        aria-label={t('notifications.title')}
        onClick={() => setOpen((v) => !v)}
        className="relative flex h-9 w-9 items-center justify-center rounded-xl text-muted-foreground transition-colors hover:bg-indigo-50 hover:text-indigo-600"
      >
        <Bell className="h-5 w-5" />
        {unreadCount > 0 && (
          <span className="absolute -top-0.5 -right-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-semibold text-white">
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 z-50 mt-2 w-80 overflow-hidden rounded-xl border border-zinc-100 bg-white shadow-lg">
          <div className="flex items-center justify-between border-b border-zinc-100 px-4 py-3">
            <h3 className="text-sm font-semibold">{t('notifications.title')}</h3>
            {unreadCount > 0 && (
              <button
                type="button"
                onClick={markAllAsRead}
                className="text-xs text-indigo-600 hover:underline"
              >
                {t('notifications.markAllRead')}
              </button>
            )}
          </div>
          {pushSupported && pushPermission === 'default' && (
            <div className="border-b border-zinc-100 bg-indigo-50/40 px-4 py-2">
              <button
                type="button"
                onClick={handleEnablePush}
                className="w-full text-left text-xs font-medium text-indigo-600 hover:underline"
              >
                {t('notifications.enable')}
              </button>
            </div>
          )}
          {pushSupported && pushPermission === 'denied' && (
            <div className="border-b border-zinc-100 bg-amber-50/60 px-4 py-2">
              <p className="text-xs text-amber-800">{t('notifications.denied')}</p>
            </div>
          )}
          <div className="max-h-96 overflow-y-auto">
            {items.length === 0 ? (
              <p className="px-4 py-8 text-center text-sm text-muted-foreground">
                {t('notifications.empty')}
              </p>
            ) : (
              items.map((n) => (
                <button
                  key={n.id}
                  type="button"
                  onClick={() => handleClick(n)}
                  className={`flex w-full flex-col items-start gap-1 border-b border-zinc-100 px-4 py-3 text-left transition-colors last:border-b-0 hover:bg-zinc-50 ${
                    n.read ? '' : 'bg-indigo-50/40'
                  }`}
                >
                  <div className="flex w-full items-start justify-between gap-2">
                    <span className="text-sm font-medium">
                      {t('notifications.bookingCreated.title', {
                        student: n.meta.studentName ?? '',
                      })}
                    </span>
                    <span className="shrink-0 text-[11px] text-muted-foreground">
                      {formatRelative(n.createdAt, lang)}
                    </span>
                  </div>
                  <span className="text-xs text-muted-foreground">
                    {t('notifications.bookingCreated.body', {
                      lesson: getLessonName(n, lang),
                      date: n.meta.date ?? '',
                      time: n.meta.startTime ?? '',
                    })}
                  </span>
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
