import { createBrowserRouter, Navigate } from 'react-router-dom';
import { lazy, Suspense } from 'react';
import { PublicLayout } from '@/components/layout/PublicLayout';
import { AdminLayout } from '@/components/layout/AdminLayout';
import { ProtectedRoute } from '@/components/shared/ProtectedRoute';
import { LoadingSpinner } from '@/components/shared/LoadingSpinner';

// Lazy load pages
const HomePage = lazy(() => import('@/pages/HomePage'));
const LessonsPage = lazy(() => import('@/pages/LessonsPage'));
const BookingPage = lazy(() => import('@/pages/BookingPage'));
const BlogListPage = lazy(() => import('@/pages/BlogListPage'));
const BlogPostPage = lazy(() => import('@/pages/BlogPostPage'));
const ReviewsPage = lazy(() => import('@/pages/ReviewsPage'));
const LoginPage = lazy(() => import('@/pages/LoginPage'));
const MyBookingsPage = lazy(() => import('@/pages/MyBookingsPage'));
const NotFoundPage = lazy(() => import('@/pages/NotFoundPage'));
const AdminSetupPage = lazy(() => import('@/pages/AdminSetupPage'));
const NaverCallbackPage = lazy(() => import('@/pages/NaverCallbackPage'));

// Admin pages
const AdminDashboard = lazy(() => import('@/pages/admin/AdminDashboard'));
const AdminAvailability = lazy(() => import('@/pages/admin/AdminAvailability'));
const AdminBookings = lazy(() => import('@/pages/admin/AdminBookings'));
const AdminBlog = lazy(() => import('@/pages/admin/AdminBlog'));
const AdminBlogEdit = lazy(() => import('@/pages/admin/AdminBlogEdit'));
const AdminReviews = lazy(() => import('@/pages/admin/AdminReviews'));
const AdminProfile = lazy(() => import('@/pages/admin/AdminProfile'));
const AdminUsers = lazy(() => import('@/pages/admin/AdminUsers'));
const AdminLessons = lazy(() => import('@/pages/admin/AdminLessons'));
const AdminLocations = lazy(() => import('@/pages/admin/AdminLocations'));
const AdminSettings = lazy(() => import('@/pages/admin/AdminSettings'));
const AdminTeachers = lazy(() => import('@/pages/admin/AdminTeachers'));
const AdminMigration = lazy(() => import('@/pages/admin/AdminMigration'));

// Public teacher pages
const TeachersListPage = lazy(() => import('@/pages/TeachersListPage'));
const TeacherProfilePage = lazy(() => import('@/pages/TeacherProfilePage'));

function SuspenseWrapper({ children }: { children: React.ReactNode }) {
  return <Suspense fallback={<LoadingSpinner />}>{children}</Suspense>;
}

export const router = createBrowserRouter([
  {
    element: <PublicLayout />,
    children: [
      {
        path: '/',
        element: <SuspenseWrapper><HomePage /></SuspenseWrapper>,
      },
      {
        path: '/lessons',
        element: <SuspenseWrapper><LessonsPage /></SuspenseWrapper>,
      },
      {
        path: '/book',
        element: <SuspenseWrapper><BookingPage /></SuspenseWrapper>,
      },
      {
        path: '/teachers',
        element: <SuspenseWrapper><TeachersListPage /></SuspenseWrapper>,
      },
      {
        path: '/teachers/:slug',
        element: <SuspenseWrapper><TeacherProfilePage /></SuspenseWrapper>,
      },
      {
        path: '/teachers/:slug/book',
        element: <Navigate to="/book" replace />,
      },
      {
        path: '/blog',
        element: <SuspenseWrapper><BlogListPage /></SuspenseWrapper>,
      },
      {
        path: '/blog/:slug',
        element: <SuspenseWrapper><BlogPostPage /></SuspenseWrapper>,
      },
      {
        path: '/reviews',
        element: <SuspenseWrapper><ReviewsPage /></SuspenseWrapper>,
      },
      {
        path: '/login',
        element: <SuspenseWrapper><LoginPage /></SuspenseWrapper>,
      },
      {
        path: '/my-bookings',
        element: (
          <ProtectedRoute>
            <SuspenseWrapper><MyBookingsPage /></SuspenseWrapper>
          </ProtectedRoute>
        ),
      },
      {
        path: '/auth/naver/callback',
        element: <SuspenseWrapper><NaverCallbackPage /></SuspenseWrapper>,
      },
      {
        path: '/admin-setup',
        element: <SuspenseWrapper><AdminSetupPage /></SuspenseWrapper>,
      },
      {
        path: '*',
        element: <SuspenseWrapper><NotFoundPage /></SuspenseWrapper>,
      },
    ],
  },
  {
    path: '/admin',
    element: (
      <ProtectedRoute requiredRole={['admin', 'teacher']}>
        <AdminLayout />
      </ProtectedRoute>
    ),
    children: [
      {
        index: true,
        element: <SuspenseWrapper><AdminDashboard /></SuspenseWrapper>,
      },
      {
        path: 'availability',
        element: <SuspenseWrapper><AdminAvailability /></SuspenseWrapper>,
      },
      {
        path: 'bookings',
        element: <SuspenseWrapper><AdminBookings /></SuspenseWrapper>,
      },
      {
        path: 'blog',
        element: <SuspenseWrapper><AdminBlog /></SuspenseWrapper>,
      },
      {
        path: 'blog/:id/edit',
        element: <SuspenseWrapper><AdminBlogEdit /></SuspenseWrapper>,
      },
      {
        path: 'reviews',
        element: <SuspenseWrapper><AdminReviews /></SuspenseWrapper>,
      },
      {
        path: 'profile',
        element: <SuspenseWrapper><AdminProfile /></SuspenseWrapper>,
      },
      {
        path: 'users',
        element: <SuspenseWrapper><AdminUsers /></SuspenseWrapper>,
      },
      {
        path: 'teachers',
        element: <SuspenseWrapper><AdminTeachers /></SuspenseWrapper>,
      },
      {
        path: 'lessons',
        element: <SuspenseWrapper><AdminLessons /></SuspenseWrapper>,
      },
      {
        path: 'locations',
        element: <SuspenseWrapper><AdminLocations /></SuspenseWrapper>,
      },
      {
        path: 'settings',
        element: <SuspenseWrapper><AdminSettings /></SuspenseWrapper>,
      },
      {
        path: 'migration',
        element: <SuspenseWrapper><AdminMigration /></SuspenseWrapper>,
      },
    ],
  },
]);
