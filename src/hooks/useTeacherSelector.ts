import { useState } from 'react';
import { useAuthStore } from '@/stores/authStore';
import { useAdminTeachers } from '@/hooks/useTeachers';

/**
 * Provides a teacherId for admin pages.
 * - Teacher role: their own profile, which lives at `teachers/{their uid}`
 * - Admin role: the profile picked in the dropdown, defaulting to their own
 *
 * The default is derived during render rather than written back with an effect:
 * setting state from an effect costs an extra render pass every time the teacher
 * list arrives, and React flags it for exactly that reason.
 */
export function useTeacherSelector() {
  const { role, teacherId: ownTeacherId } = useAuthStore();
  const { teachers, loading } = useAdminTeachers();
  const [selectedId, setSelectedId] = useState<string>('');

  if (role === 'teacher') {
    return {
      teacherId: ownTeacherId,
      teachers: [],
      loading: false,
      setTeacherId: () => {},
      isAdmin: false,
    };
  }

  // Their own profile if they also teach, else the first in the list.
  const ownIsListed = ownTeacherId && teachers.some((t) => t.id === ownTeacherId);
  const fallbackId = ownIsListed ? ownTeacherId : (teachers[0]?.id ?? '');

  return {
    teacherId: selectedId || fallbackId || null,
    teachers,
    loading,
    setTeacherId: setSelectedId,
    isAdmin: true,
  };
}
