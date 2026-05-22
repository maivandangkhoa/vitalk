import { useState, useEffect } from 'react';
import { collection, getDocs, query, orderBy } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { ALLOWED_DURATIONS, type AllowedDuration } from '@/lib/constants';
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
          const allowed = Array.isArray(data.allowedDurations) && data.allowedDurations.length > 0
            ? (data.allowedDurations.filter((n: number) =>
                (ALLOWED_DURATIONS as readonly number[]).includes(n),
              ) as AllowedDuration[])
            : ([...ALLOWED_DURATIONS] as AllowedDuration[]);
          return {
            id: d.id,
            ...data,
            allowedDurations: allowed,
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
