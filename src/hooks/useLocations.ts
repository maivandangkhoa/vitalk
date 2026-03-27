import { useState, useEffect, useCallback } from 'react';
import {
  collection,
  doc,
  addDoc,
  updateDoc,
  deleteDoc,
  query,
  orderBy,
  getDocs,
  serverTimestamp,
} from 'firebase/firestore';
import { db } from '@/lib/firebase';
import type { Location } from '@/types';

/** Public: fetch active locations */
export function useLocations() {
  const [locations, setLocations] = useState<Location[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetch = async () => {
      setLoading(true);
      try {
        const q = query(collection(db, 'locations'), orderBy('sortOrder'));
        const snap = await getDocs(q);
        setLocations(
          snap.docs
            .map((d) => ({ id: d.id, ...d.data() }) as Location)
            .filter((l) => l.isActive)
        );
      } finally {
        setLoading(false);
      }
    };
    fetch();
  }, []);

  return { locations, loading };
}

/** Admin: fetch all locations */
export function useAdminLocations() {
  const [locations, setLocations] = useState<Location[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchLocations = useCallback(async () => {
    setLoading(true);
    try {
      const q = query(collection(db, 'locations'), orderBy('sortOrder'));
      const snap = await getDocs(q);
      setLocations(snap.docs.map((d) => ({ id: d.id, ...d.data() }) as Location));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchLocations();
  }, [fetchLocations]);

  return { locations, loading, refetch: fetchLocations };
}

/** Create a location */
export async function createLocation(data: Omit<Location, 'id' | 'createdAt'>) {
  await addDoc(collection(db, 'locations'), {
    ...data,
    createdAt: serverTimestamp(),
  });
}

/** Update a location */
export async function updateLocation(id: string, data: Partial<Omit<Location, 'id' | 'createdAt'>>) {
  await updateDoc(doc(db, 'locations', id), data);
}

/** Delete a location */
export async function deleteLocation(id: string) {
  await deleteDoc(doc(db, 'locations', id));
}
