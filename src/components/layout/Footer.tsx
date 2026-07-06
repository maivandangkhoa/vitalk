import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import type { Language, MultiLangText } from '@/types';

export function Footer() {
  const { t, i18n } = useTranslation();
  const year = new Date().getFullYear();
  const lang = (i18n.language || 'en').split('-')[0] as Language;
  const [address, setAddress] = useState<string>('');

  useEffect(() => {
    let cancelled = false;
    getDoc(doc(db, 'siteConfig', 'general'))
      .then((snap) => {
        if (cancelled) return;
        const data = snap.data() as { contact?: { address?: MultiLangText } } | undefined;
        const addr = data?.contact?.address;
        const value = addr?.[lang] || addr?.en || '';
        setAddress(value);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [lang]);

  const displayAddress = address || t('footer.location');

  return (
    <footer className="border-t border-zinc-100 bg-white">
      <div className="container mx-auto px-4 py-12">
        <div className="grid gap-8 md:grid-cols-3">
          <div>
            <Link to="/" className="text-lg font-bold">
              Havi<span className="text-indigo-500">Talk</span>
            </Link>
            <p className="mt-2 text-sm text-muted-foreground">
              {t('footer.tagline')}
            </p>
          </div>

          <div>
            <h3 className="mb-3 text-sm font-semibold">{t('footer.explore')}</h3>
            <nav className="flex flex-col gap-2">
              <Link to="/lessons" className="text-sm text-muted-foreground transition-colors hover:text-indigo-500">
                {t('nav.lessons')}
              </Link>
              <Link to="/book" className="text-sm text-muted-foreground transition-colors hover:text-indigo-500">
                {t('nav.book')}
              </Link>
              <Link to="/blog" className="text-sm text-muted-foreground transition-colors hover:text-indigo-500">
                {t('nav.blog')}
              </Link>
              <Link to="/policy" className="text-sm text-muted-foreground transition-colors hover:text-indigo-500">
                {t('footer.policy')}
              </Link>
            </nav>
          </div>

          <div>
            <h3 className="mb-3 text-sm font-semibold">{t('footer.contact')}</h3>
            <p className="whitespace-pre-line text-sm text-muted-foreground">{displayAddress}</p>
          </div>
        </div>

        <div className="mt-8 border-t border-zinc-100 pt-4 text-center text-sm text-muted-foreground">
          {t('footer.copyright', { year })}
        </div>
      </div>
    </footer>
  );
}
