import { create } from 'zustand';
import type { User } from 'firebase/auth';
import type { UserRole } from '@/types';

interface AuthState {
  user: User | null;
  role: UserRole;
  teacherId: string | null;
  isLoading: boolean;
  setUser: (user: User | null) => void;
  setRole: (role: UserRole) => void;
  setTeacherId: (teacherId: string | null) => void;
  setLoading: (loading: boolean) => void;
  isAdmin: () => boolean;
  isTeacher: () => boolean;
}

export const useAuthStore = create<AuthState>((set, get) => ({
  user: null,
  role: 'user',
  teacherId: null,
  isLoading: true,
  setUser: (user) => set({ user }),
  setRole: (role) => set({ role }),
  setTeacherId: (teacherId) => set({ teacherId }),
  setLoading: (isLoading) => set({ isLoading }),
  isAdmin: () => get().role === 'admin',
  isTeacher: () => get().role === 'teacher',
}));
