import { create } from 'zustand';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import type { TeacherProfile } from '@/types';

interface ProfileState {
  profile: TeacherProfile | null;
  isLoading: boolean;
  fetchProfile: (teacherId: string) => Promise<void>;
}

export const useProfileStore = create<ProfileState>((set, get) => ({
  profile: null,
  isLoading: false,
  fetchProfile: async (teacherId: string) => {
    if (get().profile?.id === teacherId) return;
    set({ isLoading: true });
    try {
      const snap = await getDoc(doc(db, 'teachers', teacherId));
      if (snap.exists()) {
        set({ profile: { ...snap.data(), id: snap.id } as TeacherProfile });
      }
    } finally {
      set({ isLoading: false });
    }
  },
}));
