import { create } from 'zustand';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import type { TeacherProfile } from '@/types';

interface ProfileState {
  profile: TeacherProfile | null;
  isLoading: boolean;
  fetchProfile: () => Promise<void>;
}

export const useProfileStore = create<ProfileState>((set, get) => ({
  profile: null,
  isLoading: false,
  fetchProfile: async () => {
    if (get().profile) return;
    set({ isLoading: true });
    try {
      const snap = await getDoc(doc(db, 'profile', 'teacher'));
      if (snap.exists()) {
        set({ profile: snap.data() as TeacherProfile });
      }
    } finally {
      set({ isLoading: false });
    }
  },
}));
