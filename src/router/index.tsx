import { createBrowserRouter, Navigate } from 'react-router-dom';
import { PublicLayout } from '@/components/layout/PublicLayout';
import { AdminLayout } from '@/components/layout/AdminLayout';
import { ProtectedRoute } from '@/components/shared/ProtectedRoute';
import { SuspenseWrapper } from './SuspenseWrapper';
import { lazyWithRetry } from '@/lib/lazyWithRetry';
import { SUPPORTED_LANGUAGES } from '@/lib/constants';

// Lazy load pages
const HomePage = lazyWithRetry(() => import('@/pages/HomePage'));
const LessonsPage = lazyWithRetry(() => import('@/pages/LessonsPage'));
const BookingPage = lazyWithRetry(() => import('@/pages/BookingPage'));
const BlogListPage = lazyWithRetry(() => import('@/pages/BlogListPage'));
const BlogPostPage = lazyWithRetry(() => import('@/pages/BlogPostPage'));
const ReviewsPage = lazyWithRetry(() => import('@/pages/ReviewsPage'));
const PolicyPage = lazyWithRetry(() => import('@/pages/PolicyPage'));
const LoginPage = lazyWithRetry(() => import('@/pages/LoginPage'));
const MyBookingsPage = lazyWithRetry(() => import('@/pages/MyBookingsPage'));
const MessagesPage = lazyWithRetry(() => import('@/pages/MessagesPage'));
const CallPage = lazyWithRetry(() => import('@/pages/CallPage'));
const NotFoundPage = lazyWithRetry(() => import('@/pages/NotFoundPage'));
const AdminSetupPage = lazyWithRetry(() => import('@/pages/AdminSetupPage'));
const NaverCallbackPage = lazyWithRetry(() => import('@/pages/NaverCallbackPage'));
const KakaoCallbackPage = lazyWithRetry(() => import('@/pages/KakaoCallbackPage'));

// Admin pages
const AdminDashboard = lazyWithRetry(() => import('@/pages/admin/AdminDashboard'));
const AdminAvailability = lazyWithRetry(() => import('@/pages/admin/AdminAvailability'));
const AdminBookings = lazyWithRetry(() => import('@/pages/admin/AdminBookings'));
const AdminBlog = lazyWithRetry(() => import('@/pages/admin/AdminBlog'));
const AdminBlogEdit = lazyWithRetry(() => import('@/pages/admin/AdminBlogEdit'));
const AdminReviews = lazyWithRetry(() => import('@/pages/admin/AdminReviews'));
const AdminProfile = lazyWithRetry(() => import('@/pages/admin/AdminProfile'));
const AdminUsers = lazyWithRetry(() => import('@/pages/admin/AdminUsers'));
const AdminLessons = lazyWithRetry(() => import('@/pages/admin/AdminLessons'));
const AdminLocations = lazyWithRetry(() => import('@/pages/admin/AdminLocations'));
const AdminSettings = lazyWithRetry(() => import('@/pages/admin/AdminSettings'));
const AdminTeachers = lazyWithRetry(() => import('@/pages/admin/AdminTeachers'));
const AdminPolicy = lazyWithRetry(() => import('@/pages/admin/AdminPolicy'));
const AdminMessages = lazyWithRetry(() => import('@/pages/admin/AdminMessages'));

// Public teacher pages
const TeachersListPage = lazyWithRetry(() => import('@/pages/TeachersListPage'));
const TeacherProfilePage = lazyWithRetry(() => import('@/pages/TeacherProfilePage'));

/**
 * Blog có URL riêng cho từng ngôn ngữ — `/ko/blog/<slug>` là bản tiếng Hàn của
 * bài viết. Xem `src/lib/localeRoutes.ts` để biết vì sao.
 *
 * Sinh route tường minh cho từng mã chứ không dùng `/:lang/blog`: tham số tự do
 * sẽ nhận luôn `/bất-kỳ-thứ-gì/blog`, và một URL sai chính tả sẽ hiện ra trang
 * blog thay vì trang 404.
 */
const localizedBlogRoutes = SUPPORTED_LANGUAGES.flatMap(({ code }) => [
  {
    path: `/${code}/blog`,
    element: <SuspenseWrapper><BlogListPage /></SuspenseWrapper>,
  },
  {
    path: `/${code}/blog/:slug`,
    element: <SuspenseWrapper><BlogPostPage /></SuspenseWrapper>,
  },
]);

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
      ...localizedBlogRoutes,
      {
        path: '/reviews',
        element: <SuspenseWrapper><ReviewsPage /></SuspenseWrapper>,
      },
      {
        path: '/policy',
        element: <SuspenseWrapper><PolicyPage /></SuspenseWrapper>,
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
        path: '/messages',
        element: (
          <ProtectedRoute>
            <SuspenseWrapper><MessagesPage /></SuspenseWrapper>
          </ProtectedRoute>
        ),
      },
      {
        path: '/messages/:conversationId',
        element: (
          <ProtectedRoute>
            <SuspenseWrapper><MessagesPage /></SuspenseWrapper>
          </ProtectedRoute>
        ),
      },
      {
        // The classroom is the same URL for both sides — teachers reach it from
        // the admin shell, students from their bookings, and the page decides
        // which role you are from the booking itself.
        path: '/call/:bookingId',
        element: (
          <ProtectedRoute>
            <SuspenseWrapper><CallPage /></SuspenseWrapper>
          </ProtectedRoute>
        ),
      },
      {
        path: '/auth/naver/callback',
        element: <SuspenseWrapper><NaverCallbackPage /></SuspenseWrapper>,
      },
      {
        path: '/auth/kakao/callback',
        element: <SuspenseWrapper><KakaoCallbackPage /></SuspenseWrapper>,
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
        path: 'messages',
        element: <SuspenseWrapper><AdminMessages /></SuspenseWrapper>,
      },
      {
        path: 'messages/:conversationId',
        element: <SuspenseWrapper><AdminMessages /></SuspenseWrapper>,
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
        path: 'policy',
        element: <SuspenseWrapper><AdminPolicy /></SuspenseWrapper>,
      },
    ],
  },
]);
