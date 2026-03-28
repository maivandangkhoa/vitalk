import { useState, useEffect, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { CalendarDays, BookOpen, CreditCard, Users, Loader2 } from 'lucide-react';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell,
} from 'recharts';
import {
  collection,
  query,
  orderBy,
  getDocs,
  where,
} from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useAuthStore } from '@/stores/authStore';
import { BentoGrid, BentoCard } from '@/components/shared/BentoGrid';
import { StaggerContainer, StaggerItem, AnimatedSection } from '@/components/shared/motion';
import { statusColors } from '@/lib/utils';
import type { Booking } from '@/types';

interface DashboardStats {
  upcoming: number;
  total: number;
  pendingPayments: number;
  students: number;
}

const STAT_CARDS = [
  { key: 'upcomingLessons', icon: CalendarDays, bg: 'bg-indigo-50', text: 'text-indigo-500' },
  { key: 'totalBookings', icon: BookOpen, bg: 'bg-purple-50', text: 'text-purple-500' },
  { key: 'pendingPayments', icon: CreditCard, bg: 'bg-amber-50', text: 'text-amber-500' },
  { key: 'totalStudents', icon: Users, bg: 'bg-emerald-50', text: 'text-emerald-500' },
];

const PIE_COLORS = ['#6366f1', '#f59e0b', '#10b981', '#f43f5e'];

export default function AdminDashboard() {
  const { t } = useTranslation('admin');
  const { role, teacherId } = useAuthStore();
  const [stats, setStats] = useState<DashboardStats>({ upcoming: 0, total: 0, pendingPayments: 0, students: 0 });
  const [allBookings, setAllBookings] = useState<Booking[]>([]);
  const [recentBookings, setRecentBookings] = useState<Booking[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      try {
        const constraints = [orderBy('createdAt', 'desc')];
        if (role === 'teacher' && teacherId) {
          constraints.unshift(where('teacherId', '==', teacherId));
        }
        const allSnap = await getDocs(
          query(collection(db, 'bookings'), ...constraints)
        );
        const bookings = allSnap.docs.map((d) => ({ id: d.id, ...d.data() }) as Booking);
        setAllBookings(bookings);

        const today = new Date().toISOString().split('T')[0];
        const upcoming = bookings.filter(
          (b) => b.date >= today && (b.status === 'confirmed' || b.status === 'pending')
        ).length;
        const pendingPayments = bookings.filter(
          (b) => b.paymentStatus === 'pending'
        ).length;
        const uniqueStudents = new Set(bookings.map((b) => b.studentId)).size;

        setStats({ upcoming, total: bookings.length, pendingPayments, students: uniqueStudents });
        setRecentBookings(bookings.slice(0, 5));
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, [role, teacherId]);

  const statValues = [stats.upcoming, stats.total, stats.pendingPayments, stats.students];

  const statusDistribution = useMemo(() => {
    const statuses = ['confirmed', 'pending', 'completed', 'cancelled'] as const;
    return statuses.map((s) => ({
      key: s,
      name: t(`bookings.${s}`),
      value: allBookings.filter((b) => b.status === s).length,
    })).filter((d) => d.value > 0);
  }, [allBookings, t]);

  const monthlyData = useMemo(() => {
    const months: Record<string, number> = {};
    allBookings.forEach((b) => {
      const month = b.date?.substring(0, 7);
      if (month) {
        months[month] = (months[month] || 0) + 1;
      }
    });
    return Object.entries(months)
      .sort(([a], [b]) => a.localeCompare(b))
      .slice(-6)
      .map(([month, count]) => ({
        month: month.substring(5),
        bookings: count,
      }));
  }, [allBookings]);

  return (
    <div>
      <AnimatedSection>
        <h1 className="mb-6 text-2xl font-bold">{t('dashboard.title')}</h1>
      </AnimatedSection>

      {loading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="h-8 w-8 animate-spin text-indigo-500" />
        </div>
      ) : (
        <>
          <StaggerContainer className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
            {STAT_CARDS.map(({ key, icon: Icon, bg, text }, i) => (
              <StaggerItem key={key}>
                <Card>
                  <CardContent className="flex items-center gap-4 pt-6">
                    <div className={`flex h-12 w-12 items-center justify-center rounded-xl ${bg}`}>
                      <Icon className={`h-6 w-6 ${text}`} />
                    </div>
                    <div>
                      <p className="font-mono text-2xl font-bold">{statValues[i]}</p>
                      <p className="text-sm text-muted-foreground">{t(`dashboard.${key}`)}</p>
                    </div>
                  </CardContent>
                </Card>
              </StaggerItem>
            ))}
          </StaggerContainer>

          <BentoGrid cols={2} className="mt-6">
            <BentoCard>
              <AnimatedSection delay={0.2}>
                <Card className="h-full">
                  <CardHeader>
                    <h2 className="text-lg font-semibold">{t('dashboard.monthlyBookings')}</h2>
                  </CardHeader>
                  <CardContent>
                    {monthlyData.length > 0 ? (
                      <ResponsiveContainer width="100%" height={220}>
                        <BarChart data={monthlyData}>
                          <XAxis dataKey="month" tick={{ fontSize: 12 }} axisLine={false} tickLine={false} />
                          <YAxis tick={{ fontSize: 12 }} axisLine={false} tickLine={false} />
                          <Tooltip
                            contentStyle={{
                              borderRadius: '12px',
                              border: '1px solid #e4e4e7',
                              boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)',
                            }}
                          />
                          <Bar dataKey="bookings" fill="#6366f1" radius={[6, 6, 0, 0]} />
                        </BarChart>
                      </ResponsiveContainer>
                    ) : (
                      <p className="py-12 text-center text-sm text-muted-foreground">{t('dashboard.noData')}</p>
                    )}
                  </CardContent>
                </Card>
              </AnimatedSection>
            </BentoCard>

            <BentoCard>
              <AnimatedSection delay={0.3}>
                <Card className="h-full">
                  <CardHeader>
                    <h2 className="text-lg font-semibold">{t('dashboard.statusDistribution')}</h2>
                  </CardHeader>
                  <CardContent>
                    {statusDistribution.length > 0 ? (
                      <div className="flex items-center justify-center gap-6">
                        <ResponsiveContainer width={160} height={160}>
                          <PieChart>
                            <Pie
                              data={statusDistribution}
                              cx="50%"
                              cy="50%"
                              innerRadius={45}
                              outerRadius={70}
                              paddingAngle={4}
                              dataKey="value"
                            >
                              {statusDistribution.map((_, i) => (
                                <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                              ))}
                            </Pie>
                          </PieChart>
                        </ResponsiveContainer>
                        <div className="space-y-2">
                          {statusDistribution.map((d, i) => (
                            <div key={d.key} className="flex items-center gap-2 text-sm">
                              <div
                                className="h-3 w-3 rounded-full"
                                style={{ backgroundColor: PIE_COLORS[i % PIE_COLORS.length] }}
                              />
                              <span className="text-muted-foreground">{d.name}</span>
                              <span className="font-mono font-medium">{d.value}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    ) : (
                      <p className="py-12 text-center text-sm text-muted-foreground">{t('dashboard.noData')}</p>
                    )}
                  </CardContent>
                </Card>
              </AnimatedSection>
            </BentoCard>
          </BentoGrid>

          <AnimatedSection delay={0.4} className="mt-6">
            <Card>
              <CardHeader>
                <h2 className="text-lg font-semibold">{t('dashboard.recentBookings')}</h2>
              </CardHeader>
              <CardContent>
                {recentBookings.length > 0 ? (
                  <div className="space-y-3">
                    {recentBookings.map((b) => (
                      <div
                        key={b.id}
                        className="flex items-center justify-between rounded-xl border border-zinc-100 px-4 py-3.5 text-sm transition-all duration-200 hover:bg-zinc-50"
                      >
                        <div className="flex items-center gap-3">
                          <span className="font-medium">{b.studentName}</span>
                          <span className="font-mono text-muted-foreground">
                            {b.date} {b.startTime}
                          </span>
                        </div>
                        <div className="flex items-center gap-3">
                          <Badge className={statusColors[b.status] || ''}>
                            {t(`bookings.${b.status}`)}
                          </Badge>
                          <span className="font-mono text-muted-foreground">${b.amount}</span>
                        </div>
                      </div>
                    ))}
                    <Link
                      to="/admin/bookings"
                      className="mt-3 block text-center text-sm text-indigo-500 hover:underline"
                    >
                      {t('dashboard.viewAllBookings')}
                    </Link>
                  </div>
                ) : (
                  <p className="py-8 text-center text-muted-foreground">
                    {t('dashboard.noUpcoming')}
                  </p>
                )}
              </CardContent>
            </Card>
          </AnimatedSection>
        </>
      )}
    </div>
  );
}
