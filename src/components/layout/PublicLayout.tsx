import { useEffect } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Header } from './Header';
import { Footer } from './Footer';
import { InstallPromptBanner } from '@/components/shared/InstallPromptBanner';
import { langFromPath } from '@/lib/localeRoutes';

export function PublicLayout() {
  const { pathname } = useLocation();
  const { i18n } = useTranslation();

  /*
   * Lần tải đầu đã có detector đọc đường dẫn (`src/lib/i18n.ts`); chỗ này lo
   * những lần điều hướng trong app sau đó — bấm một link `/ja/blog/...` từ
   * trang khác thì i18n phải đi theo, vì detector chỉ chạy một lần lúc khởi tạo.
   */
  useEffect(() => {
    const lang = langFromPath(pathname);
    if (lang && lang !== i18n.language.split('-')[0]) {
      i18n.changeLanguage(lang);
    }
  }, [pathname, i18n]);

  return (
    <div className="flex min-h-screen flex-col bg-zinc-50">
      <Header />
      <main className="flex-1">
        <Outlet />
      </main>
      <Footer />
      <InstallPromptBanner />
    </div>
  );
}
