import { useAuthStore } from '@/stores/authStore';
import { useAdminTeachers } from '@/hooks/useTeachers';
import { useState, useEffect } from 'react';

/**
 * Hook that provides a teacherId for admin pages.
 * - Teacher role: auto-returns their own teacherId
 * - Admin role: returns the selected teacherId from a dropdown
 */
export function useTeacherSelector() {
  const { role, teacherId: ownTeacherId } = useAuthStore();
  const { teachers, loading } = useAdminTeachers();
  const [selectedId, setSelectedId] = useState<string>('');

  // Auto-select first teacher for admin if none selected
  useEffect(() => {
    if (role === 'admin' && !selectedId && teachers.length > 0) {
      setSelectedId(teachers[0].id);
    }
  }, [role, selectedId, teachers]);

  if (role === 'teacher') {
    return {
      teacherId: ownTeacherId,
      teachers: [],
      loading: false,
      setTeacherId: () => {},
      isAdmin: false,
    };
  }

  return {
    teacherId: selectedId || null,
    teachers,
    loading,
    setTeacherId: setSelectedId,
    isAdmin: true,
  };
}

/** Dropdown UI for selecting a teacher (admin only) */
export function TeacherSelector({
  teacherId,
  teachers,
  onChange,
}: {
  teacherId: string | null;
  teachers: { id: string; name: string; slug: string }[];
  onChange: (id: string) => void;
}) {
  if (teachers.length === 0) return null;

  return (
    <select
      value={teacherId || ''}
      onChange={(e) => onChange(e.target.value)}
      className="h-10 rounded-lg border border-input bg-background px-3 text-sm font-medium outline-none transition-all focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20"
    >
      {teachers.map((t) => (
        <option key={t.id} value={t.id}>
          {t.name} ({t.slug})
        </option>
      ))}
    </select>
  );
}
