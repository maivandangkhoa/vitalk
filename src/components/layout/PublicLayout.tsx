import { Outlet } from 'react-router-dom';
import { Header } from './Header';
import { Footer } from './Footer';
import { InstallPromptBanner } from '@/components/shared/InstallPromptBanner';

export function PublicLayout() {
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
