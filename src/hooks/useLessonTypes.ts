import { useState, useEffect } from 'react';
import { collection, getDocs, query, orderBy } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import type { LessonType } from '@/types/lesson';

export function useLessonTypes() {
  const [lessonTypes, setLessonTypes] = useState<LessonType[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetch = async () => {
      try {
        const snap = await getDocs(
          query(collection(db, 'lessonTypes'), orderBy('sortOrder', 'asc')),
        );
        const all = snap.docs.map((d) => {
          const data = d.data();
          return {
            id: d.id,
            ...data,
            prices: data.prices ?? { USD: data.price ?? 14 },
          } as LessonType;
        });
        setLessonTypes(all.filter((l) => l.isActive));
      } finally {
        setLoading(false);
      }
    };
    fetch();
  }, []);

  return { lessonTypes, loading };
}
