import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';

export function Footer() {
  const { t } = useTranslation();
  const year = new Date().getFullYear();

  return (
    <footer className="border-t border-zinc-100 bg-white">
      <div className="container mx-auto px-4 py-12">
        <div className="grid gap-8 md:grid-cols-3">
          <div>
            <Link to="/" className="text-lg font-bold">
              Vi<span className="text-indigo-500">Talk</span>
            </Link>
            <p className="mt-2 text-sm text-muted-foreground">
              {t('footer.tagline')}
            </p>
          </div>

          <div>
            <h3 className="mb-3 text-sm font-semibold">{t('nav.lessons')}</h3>
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
            </nav>
          </div>

          <div>
            <h3 className="mb-3 text-sm font-semibold">{t('footer.contact')}</h3>
            <p className="text-sm text-muted-foreground">{t('footer.location')}</p>
          </div>
        </div>

        <div className="mt-8 border-t border-zinc-100 pt-4 text-center text-sm text-muted-foreground">
          {t('footer.copyright', { year })}
        </div>
      </div>
    </footer>
  );
}
