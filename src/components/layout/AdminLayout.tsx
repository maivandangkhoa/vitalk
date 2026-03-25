import { Link, Outlet, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  LayoutDashboard,
  Calendar,
  BookOpen,
  PenSquare,
  Star,
  User,
  Users,
  GraduationCap,
  Settings,
  ArrowLeft,
  Menu,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { LanguageSwitcher } from '@/components/shared/LanguageSwitcher';
import { Sheet, SheetContent, SheetTrigger } from '@/components/ui/sheet';
import { useState } from 'react';

const ADMIN_NAV = [
  { key: 'dashboard', path: '/admin', icon: LayoutDashboard, color: 'bg-indigo-50 text-indigo-500' },
  { key: 'availability', path: '/admin/availability', icon: Calendar, color: 'bg-purple-50 text-purple-500' },
  { key: 'bookings', path: '/admin/bookings', icon: BookOpen, color: 'bg-emerald-50 text-emerald-500' },
  { key: 'blog', path: '/admin/blog', icon: PenSquare, color: 'bg-sky-50 text-sky-500' },
  { key: 'reviews', path: '/admin/reviews', icon: Star, color: 'bg-amber-50 text-amber-500' },
  { key: 'profile', path: '/admin/profile', icon: User, color: 'bg-rose-50 text-rose-500' },
  { key: 'users', path: '/admin/users', icon: Users, color: 'bg-orange-50 text-orange-500' },
  { key: 'lessons', path: '/admin/lessons', icon: GraduationCap, color: 'bg-teal-50 text-teal-500' },
  { key: 'settings', path: '/admin/settings', icon: Settings, color: 'bg-zinc-100 text-zinc-500' },
] as const;

function SidebarNav({ onItemClick }: { onItemClick?: () => void }) {
  const { t } = useTranslation('admin');
  const location = useLocation();

  return (
    <nav className="flex flex-col gap-1 px-3">
      {ADMIN_NAV.map((item) => {
        const isActive =
          item.path === '/admin'
            ? location.pathname === '/admin'
            : location.pathname.startsWith(item.path);
        const Icon = item.icon;
        return (
          <Link
            key={item.key}
            to={item.path}
            onClick={onItemClick}
            className={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-all duration-200 ${
              isActive
                ? 'bg-indigo-50 text-indigo-600'
                : 'text-muted-foreground hover:bg-zinc-50 hover:text-foreground'
            }`}
          >
            <span className={`flex h-7 w-7 items-center justify-center rounded-lg ${isActive ? 'bg-indigo-100' : item.color}`}>
              <Icon className="h-3.5 w-3.5" />
            </span>
            {t(`nav.${item.key}`)}
          </Link>
        );
      })}
    </nav>
  );
}

export function AdminLayout() {
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <div className="flex min-h-screen bg-zinc-50">
      {/* Desktop sidebar */}
      <aside className="hidden w-64 flex-shrink-0 border-r border-zinc-100 bg-white/80 backdrop-blur-md md:block">
        <div className="flex h-16 items-center justify-between border-b border-zinc-100 px-4">
          <Link to="/" className="text-lg font-bold">
            Vi<span className="text-indigo-500">Talk</span>
            <span className="ml-2 text-xs text-muted-foreground">Admin</span>
          </Link>
        </div>
        <div className="py-4">
          <SidebarNav />
        </div>
        <div className="absolute bottom-4 left-4">
          <Button variant="ghost" size="sm" render={<Link to="/" />} className="flex items-center gap-2 text-muted-foreground hover:text-indigo-600">
            <ArrowLeft className="h-4 w-4" />
            Back to site
          </Button>
        </div>
      </aside>

      {/* Main content */}
      <div className="flex flex-1 flex-col">
        <header className="flex h-16 items-center justify-between border-b border-zinc-100 bg-white/80 px-4 backdrop-blur-md md:px-6">
          <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
            <SheetTrigger render={<Button variant="ghost" size="icon" className="md:hidden" />}>
              <Menu className="h-5 w-5" />
            </SheetTrigger>
            <SheetContent side="left" className="w-64 p-0">
              <div className="flex h-16 items-center border-b border-zinc-100 px-4">
                <span className="text-lg font-bold">
                  Vi<span className="text-indigo-500">Talk</span>
                  <span className="ml-2 text-xs text-muted-foreground">Admin</span>
                </span>
              </div>
              <div className="py-4">
                <SidebarNav onItemClick={() => setMobileOpen(false)} />
              </div>
            </SheetContent>
          </Sheet>
          <div className="md:hidden" />
          <div className="flex items-center gap-2">
            <LanguageSwitcher />
          </div>
        </header>

        <main className="flex-1 overflow-y-auto p-6 md:p-8">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
