import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  Users,
  Shield,
  UserCircle,
  Loader2,
  Search,
  Mail,
  Calendar,
} from 'lucide-react';
import { toast } from 'sonner';
import {
  collection,
  getDocs,
  doc,
  updateDoc,
  serverTimestamp,
  orderBy,
  query,
} from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { AnimatedSection, StaggerContainer, StaggerItem } from '@/components/shared/motion';
import type { UserRole } from '@/types';

interface UserData {
  uid: string;
  displayName: string;
  email: string;
  role: UserRole;
  provider: string;
  createdAt: Date | null;
  lastLoginAt: Date | null;
}

export default function AdminUsers() {
  const { t } = useTranslation('admin');
  const [users, setUsers] = useState<UserData[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');

  const fetchUsers = async () => {
    setLoading(true);
    try {
      const q = query(collection(db, 'users'), orderBy('createdAt', 'desc'));
      const snap = await getDocs(q);
      const list: UserData[] = snap.docs.map((d) => {
        const data = d.data();
        return {
          uid: d.id,
          displayName: data.displayName || '',
          email: data.email || '',
          role: data.role || 'user',
          provider: data.provider || 'unknown',
          createdAt: data.createdAt?.toDate?.() || null,
          lastLoginAt: data.lastLoginAt?.toDate?.() || null,
        };
      });
      setUsers(list);
    } catch (err) {
      console.error('Failed to fetch users:', err);
      toast.error(t('users.loadFailed'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchUsers();
  }, []);

  const handleRoleChange = async (uid: string, newRole: UserRole) => {
    setActionLoading(uid);
    try {
      await updateDoc(doc(db, 'users', uid), {
        role: newRole,
        updatedAt: serverTimestamp(),
      });
      setUsers((prev) =>
        prev.map((u) => (u.uid === uid ? { ...u, role: newRole } : u))
      );
      toast.success(t('users.roleUpdated', { role: newRole }));
    } catch (err) {
      console.error('Failed to update role:', err);
      toast.error(t('users.roleUpdateFailed'));
    } finally {
      setActionLoading(null);
    }
  };

  const filtered = users.filter((u) => {
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    return (
      u.displayName.toLowerCase().includes(q) ||
      u.email.toLowerCase().includes(q) ||
      u.uid.toLowerCase().includes(q)
    );
  });

  const adminCount = users.filter((u) => u.role === 'admin').length;
  const userCount = users.filter((u) => u.role === 'user').length;

  return (
    <div>
      <AnimatedSection>
        <h1 className="mb-6 text-2xl font-bold">
          {t('nav.users', 'User Management')}
        </h1>
      </AnimatedSection>

      {/* Stats */}
      <div className="mb-6 grid grid-cols-3 gap-4">
        <Card>
          <CardContent className="flex items-center gap-3 p-4">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-indigo-50">
              <Users className="h-5 w-5 text-indigo-500" />
            </div>
            <div>
              <p className="text-2xl font-bold font-mono">{users.length}</p>
              <p className="text-xs text-muted-foreground">{t('users.total')}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-3 p-4">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-50">
              <Shield className="h-5 w-5 text-amber-500" />
            </div>
            <div>
              <p className="text-2xl font-bold font-mono">{adminCount}</p>
              <p className="text-xs text-muted-foreground">{t('users.admins')}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-3 p-4">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-50">
              <UserCircle className="h-5 w-5 text-emerald-500" />
            </div>
            <div>
              <p className="text-2xl font-bold font-mono">{userCount}</p>
              <p className="text-xs text-muted-foreground">{t('users.users')}</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Search */}
      <div className="relative mb-4">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <input
          type="text"
          placeholder={t('users.searchPlaceholder')}
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="w-full rounded-xl border border-input bg-background py-2 pl-10 pr-3 text-sm outline-none transition-all focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20"
        />
      </div>

      {/* User list */}
      {loading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="h-8 w-8 animate-spin text-indigo-500" />
        </div>
      ) : filtered.length > 0 ? (
        <StaggerContainer className="space-y-3">
          {filtered.map((user) => (
            <StaggerItem key={user.uid}>
              <Card>
                <CardContent className="p-5">
                  <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2.5">
                        <h3 className="font-semibold">
                          {user.displayName || t('users.noName')}
                        </h3>
                        <Badge
                          className={
                            user.role === 'admin'
                              ? 'bg-amber-50 text-amber-700 border-amber-200'
                              : 'bg-zinc-50 text-zinc-600 border-zinc-200'
                          }
                        >
                          <Shield className="mr-1 h-3 w-3" />
                          {user.role}
                        </Badge>
                        <Badge variant="outline" className="text-xs">
                          {user.provider}
                        </Badge>
                      </div>

                      <div className="mt-3 grid gap-2 text-sm text-muted-foreground sm:grid-cols-2">
                        <div className="flex items-center gap-2.5">
                          <Mail className="h-3.5 w-3.5 shrink-0" />
                          <span className="truncate">{user.email}</span>
                        </div>
                        <div className="flex items-center gap-2.5">
                          <Calendar className="h-3.5 w-3.5 shrink-0" />
                          <span>
                            {user.createdAt
                              ? user.createdAt.toLocaleDateString()
                              : 'N/A'}
                          </span>
                        </div>
                      </div>

                      <p className="mt-2 font-mono text-xs text-muted-foreground">
                        {user.uid}
                      </p>
                    </div>

                    <div className="flex gap-2">
                      {user.role === 'user' ? (
                        <Button
                          size="sm"
                          onClick={() => handleRoleChange(user.uid, 'admin')}
                          disabled={actionLoading !== null}
                        >
                          {actionLoading === user.uid ? (
                            <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
                          ) : (
                            <Shield className="mr-1 h-3.5 w-3.5" />
                          )}
                          {t('users.makeAdmin')}
                        </Button>
                      ) : (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handleRoleChange(user.uid, 'user')}
                          disabled={actionLoading !== null}
                        >
                          {actionLoading === user.uid ? (
                            <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
                          ) : (
                            <UserCircle className="mr-1 h-3.5 w-3.5" />
                          )}
                          {t('users.removeAdmin')}
                        </Button>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            </StaggerItem>
          ))}
        </StaggerContainer>
      ) : (
        <Card>
          <CardContent className="flex flex-col items-center py-16">
            <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-indigo-50">
              <Users className="h-8 w-8 text-indigo-300" />
            </div>
            <p className="text-muted-foreground">
              {searchQuery ? t('users.noUsersFound') : t('users.noUsersYet')}
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
