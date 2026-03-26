import { useTranslation } from 'react-i18next';

export default function NotFoundPage() {
  const { t } = useTranslation('common');

  return (
    <div className="container mx-auto px-4 py-8">
      <h1 className="text-3xl font-bold">{t('common.pageNotFound')}</h1>
      <p className="mt-4 text-muted-foreground">{t('common.comingSoon')}</p>
    </div>
  );
}
