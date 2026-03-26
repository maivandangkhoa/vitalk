import { Link, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Menu } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { LanguageSwitcher } from '@/components/shared/LanguageSwitcher';
import { useAuthStore } from '@/stores/authStore';
import { useUIStore } from '@/stores/uiStore';
import { signOut } from '@/lib/auth';
import { Sheet, SheetContent, SheetTrigger } from '@/components/ui/sheet';

const NAV_ITEMS = [
  { key: 'home', path: '/' },
  { key: 'lessons', path: '/lessons' },
  { key: 'book', path: '/book' },
  { key: 'blog', path: '/blog' },
  { key: 'reviews', path: '/reviews' },
] as const;

export function Header() {
  const { t } = useTranslation();
  const location = useLocation();
  const { user, role } = useAuthStore();
  const { isMobileNavOpen, setMobileNavOpen } = useUIStore();

  const handleSignOut = async () => {
    await signOut();
  };

  const navLinks = (
    <>
      {NAV_ITEMS.map((item) => (
        <Link
          key={item.key}
          to={item.path}
          onClick={() => setMobileNavOpen(false)}
          className={`rounded-xl px-3 py-1.5 text-sm font-medium transition-all duration-200 ${
            location.pathname === item.path
              ? 'bg-indigo-50 text-indigo-600'
              : 'text-muted-foreground hover:bg-indigo-50 hover:text-indigo-600'
          }`}
        >
          {t(`nav.${item.key}`)}
        </Link>
      ))}
    </>
  );

  return (
    <header className="sticky top-0 z-50 w-full border-b border-zinc-100 bg-white/80 shadow-sm backdrop-blur-md">
      <div className="container mx-auto flex h-16 items-center justify-between px-4">
        <Link to="/" className="flex items-center gap-2">
          <span className="text-xl font-bold tracking-tight">
            Vi<span className="text-indigo-500">Talk</span>
          </span>
        </Link>

        {/* Desktop nav */}
        <nav className="hidden items-center gap-1 md:flex">
          {navLinks}
        </nav>

        <div className="flex items-center gap-2">
          <LanguageSwitcher />

          {user ? (
            <div className="hidden items-center gap-2 md:flex">
              {role === 'admin' && (
                <Button variant="outline" size="sm" render={<Link to="/admin" />}>
                  {t('nav.admin')}
                </Button>
              )}
              <Button variant="outline" size="sm" render={<Link to="/my-bookings" />}>
                {t('nav.myBookings')}
              </Button>
              <Button variant="ghost" size="sm" onClick={handleSignOut}>
                {t('nav.logout')}
              </Button>
              <Link to="/my-bookings" className="flex items-center gap-2 rounded-full border border-zinc-200 py-1 pr-3 pl-1 transition-colors hover:bg-zinc-50">
                {user.photoURL ? (
                  <img src={user.photoURL} alt="" className="h-7 w-7 rounded-full object-cover" />
                ) : (
                  <span className="flex h-7 w-7 items-center justify-center rounded-full bg-indigo-100 text-xs font-semibold text-indigo-600">
                    {(user.displayName || user.email || '?').charAt(0).toUpperCase()}
                  </span>
                )}
                <span className="max-w-[100px] truncate text-sm font-medium">
                  {user.displayName || user.email?.split('@')[0]}
                </span>
              </Link>
            </div>
          ) : (
            <Button size="sm" render={<Link to="/login" />} className="hidden md:inline-flex">
              {t('nav.login')}
            </Button>
          )}

          {/* Mobile menu */}
          <Sheet open={isMobileNavOpen} onOpenChange={setMobileNavOpen}>
            <SheetTrigger render={<Button variant="ghost" size="icon" className="md:hidden" />}>
              <Menu className="h-5 w-5" />
            </SheetTrigger>
            <SheetContent side="right" className="w-[280px]">
              <nav className="mt-8 flex flex-col gap-2">
                {navLinks}
                <div className="my-2 h-px bg-zinc-100" />
                {user ? (
                  <>
                    <div className="flex items-center gap-2.5 px-3 py-2">
                      {user.photoURL ? (
                        <img src={user.photoURL} alt="" className="h-8 w-8 rounded-full object-cover" />
                      ) : (
                        <span className="flex h-8 w-8 items-center justify-center rounded-full bg-indigo-100 text-sm font-semibold text-indigo-600">
                          {(user.displayName || user.email || '?').charAt(0).toUpperCase()}
                        </span>
                      )}
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium">{user.displayName || user.email?.split('@')[0]}</p>
                        {user.displayName && user.email && (
                          <p className="truncate text-xs text-muted-foreground">{user.email}</p>
                        )}
                      </div>
                    </div>
                    <div className="my-1 h-px bg-zinc-100" />
                    {role === 'admin' && (
                      <Link
                        to="/admin"
                        onClick={() => setMobileNavOpen(false)}
                        className="rounded-xl px-3 py-1.5 text-sm font-medium text-muted-foreground transition-all hover:bg-indigo-50 hover:text-indigo-600"
                      >
                        {t('nav.admin')}
                      </Link>
                    )}
                    <Link
                      to="/my-bookings"
                      onClick={() => setMobileNavOpen(false)}
                      className="rounded-xl px-3 py-1.5 text-sm font-medium text-muted-foreground transition-all hover:bg-indigo-50 hover:text-indigo-600"
                    >
                      {t('nav.myBookings')}
                    </Link>
                    <button
                      onClick={() => {
                        handleSignOut();
                        setMobileNavOpen(false);
                      }}
                      className="rounded-xl px-3 py-1.5 text-left text-sm font-medium text-muted-foreground transition-all hover:bg-indigo-50 hover:text-indigo-600"
                    >
                      {t('nav.logout')}
                    </button>
                  </>
                ) : (
                  <Link
                    to="/login"
                    onClick={() => setMobileNavOpen(false)}
                    className="rounded-xl px-3 py-1.5 text-sm font-medium text-indigo-600"
                  >
                    {t('nav.login')}
                  </Link>
                )}
              </nav>
            </SheetContent>
          </Sheet>
        </div>
      </div>
    </header>
  );
}
