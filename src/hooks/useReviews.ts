import { useState, useEffect, useCallback } from 'react';
import {
  collection,
  doc,
  setDoc,
  updateDoc,
  deleteDoc,
  query,
  where,
  orderBy,
  getDocs,
  serverTimestamp,
} from 'firebase/firestore';
import { db } from '@/lib/firebase';
import type { Review } from '@/types';

/** Public: fetch visible reviews, optionally filtered by teacher */
export function usePublicReviews(teacherId?: string) {
  const [reviews, setReviews] = useState<Review[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchReviews = async () => {
      setLoading(true);
      try {
        // Fetch all visible reviews, then filter client-side if teacherId provided
        // (avoids composite index requirement for isVisible + teacherId + createdAt)
        const q = query(
          collection(db, 'reviews'),
          where('isVisible', '==', true),
          orderBy('createdAt', 'desc')
        );
        const snap = await getDocs(q);
        let result = snap.docs.map((d) => ({ id: d.id, ...d.data() }) as Review);
        if (teacherId) {
          result = result.filter((r) => r.teacherId === teacherId);
        }
        setReviews(result);
      } finally {
        setLoading(false);
      }
    };
    fetchReviews();
  }, [teacherId]);

  return { reviews, loading };
}

/** Admin: fetch all reviews, optionally filtered by teacher */
export function useAdminReviews(teacherId?: string) {
  const [reviews, setReviews] = useState<Review[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchReviews = useCallback(async () => {
    setLoading(true);
    try {
      const q = query(collection(db, 'reviews'), orderBy('createdAt', 'desc'));
      const snap = await getDocs(q);
      let result = snap.docs.map((d) => ({ id: d.id, ...d.data() }) as Review);
      if (teacherId) {
        result = result.filter((r) => r.teacherId === teacherId);
      }
      setReviews(result);
    } finally {
      setLoading(false);
    }
  }, [teacherId]);

  useEffect(() => {
    fetchReviews();
  }, [fetchReviews]);

  return { reviews, loading, refetch: fetchReviews };
}

/** Toggle review visibility */
export async function toggleReviewVisibility(id: string, visible: boolean) {
  await updateDoc(doc(db, 'reviews', id), { isVisible: visible });
}

/** Update review fields */
export async function updateReview(id: string, data: { studentName?: string; content?: string; rating?: number }) {
  await updateDoc(doc(db, 'reviews', id), data);
}

/** Delete review */
export async function deleteReview(id: string) {
  await deleteDoc(doc(db, 'reviews', id));
}

/** Check which bookings already have reviews */
const NO_REVIEWS: ReadonlySet<string> = new Set();

/**
 * Which of these booking ids already have a review. Kept free of state so the
 * effect below stays a plain "fetch, then store the result" — Firestore's `in`
 * operator caps at 30 values, hence the batching.
 */
async function fetchReviewedIds(key: string): Promise<Set<string>> {
  const idList = key ? key.split(',') : [];
  const ids = new Set<string>();
  for (let i = 0; i < idList.length; i += 30) {
    const batch = idList.slice(i, i + 30);
    const q = query(collection(db, 'reviews'), where('bookingId', 'in', batch));
    const snap = await getDocs(q);
    snap.docs.forEach((d) => {
      const bookingId = d.data().bookingId;
      if (bookingId) ids.add(bookingId);
    });
  }
  return ids;
}

export function useBookingReviewStatus(bookingIds: string[]) {
  // Tagged with the key it was fetched for, so a stale result is ignored by
  // derivation instead of being cleared from inside the effect.
  const [result, setResult] = useState<{ key: string; ids: Set<string> } | null>(
    null
  );

  // Callers rebuild the array every render, so its identity is useless as a
  // dependency; the contents are what matter. Deriving the ids back out of the
  // key keeps the dependency list honest and statically checkable.
  const key = bookingIds.join(',');

  const refetch = useCallback(async () => {
    setResult({ key, ids: await fetchReviewedIds(key) });
  }, [key]);

  useEffect(() => {
    let cancelled = false;
    fetchReviewedIds(key).then((ids) => {
      if (!cancelled) setResult({ key, ids });
    });
    return () => {
      cancelled = true;
    };
  }, [key]);

  const reviewedIds = result?.key === key ? result.ids : NO_REVIEWS;

  return { reviewedIds, refetch };
}

/** Submit a review (student) */
export async function submitReview(data: Omit<Review, 'id' | 'createdAt' | 'isVisible'>) {
  const ref = doc(collection(db, 'reviews'));
  await setDoc(ref, {
    ...data,
    isVisible: true,
    createdAt: serverTimestamp(),
  });
  return ref.id;
}
