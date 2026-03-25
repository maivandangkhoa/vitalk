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

/** Public: fetch visible reviews */
export function usePublicReviews() {
  const [reviews, setReviews] = useState<Review[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchReviews = async () => {
      setLoading(true);
      try {
        const q = query(
          collection(db, 'reviews'),
          where('isVisible', '==', true),
          orderBy('createdAt', 'desc')
        );
        const snap = await getDocs(q);
        setReviews(snap.docs.map((d) => ({ id: d.id, ...d.data() }) as Review));
      } finally {
        setLoading(false);
      }
    };
    fetchReviews();
  }, []);

  return { reviews, loading };
}

/** Admin: fetch all reviews */
export function useAdminReviews() {
  const [reviews, setReviews] = useState<Review[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchReviews = useCallback(async () => {
    setLoading(true);
    try {
      const q = query(collection(db, 'reviews'), orderBy('createdAt', 'desc'));
      const snap = await getDocs(q);
      setReviews(snap.docs.map((d) => ({ id: d.id, ...d.data() }) as Review));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchReviews();
  }, [fetchReviews]);

  return { reviews, loading, refetch: fetchReviews };
}

/** Toggle review visibility */
export async function toggleReviewVisibility(id: string, visible: boolean) {
  await updateDoc(doc(db, 'reviews', id), { isVisible: visible });
}

/** Delete review */
export async function deleteReview(id: string) {
  await deleteDoc(doc(db, 'reviews', id));
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
