import { useState, useEffect, useCallback } from 'react';
import {
  collection,
  doc,
  addDoc,
  updateDoc,
  deleteDoc,
  query,
  where,
  orderBy,
  getDocs,
  getDoc,
  serverTimestamp,
} from 'firebase/firestore';
import { db } from '@/lib/firebase';
import type { TeacherProfile } from '@/types';

/** Public: fetch active teachers */
export function useTeachers() {
  const [teachers, setTeachers] = useState<TeacherProfile[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetch = async () => {
      setLoading(true);
      try {
        const q = query(collection(db, 'teachers'), orderBy('sortOrder'));
        const snap = await getDocs(q);
        setTeachers(
          snap.docs
            .map((d) => ({ ...d.data(), id: d.id }) as TeacherProfile)
            .filter((t) => t.isActive)
        );
      } finally {
        setLoading(false);
      }
    };
    fetch();
  }, []);

  return { teachers, loading };
}

/** Public: fetch teacher by slug */
export function useTeacherBySlug(slug: string | undefined) {
  const [teacher, setTeacher] = useState<TeacherProfile | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!slug) {
      setTeacher(null);
      setLoading(false);
      return;
    }

    const fetch = async () => {
      setLoading(true);
      try {
        const q = query(
          collection(db, 'teachers'),
          where('slug', '==', slug)
        );
        const snap = await getDocs(q);
        const found = snap.docs
          .map((d) => ({ ...d.data(), id: d.id }) as TeacherProfile)
          .find((t) => t.isActive);
        setTeacher(found ?? null);
      } finally {
        setLoading(false);
      }
    };
    fetch();
  }, [slug]);

  return { teacher, loading };
}

/** Fetch teacher by ID */
export function useTeacherById(teacherId: string | null) {
  const [teacher, setTeacher] = useState<TeacherProfile | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!teacherId) {
      setTeacher(null);
      setLoading(false);
      return;
    }

    const fetch = async () => {
      setLoading(true);
      try {
        const snap = await getDoc(doc(db, 'teachers', teacherId));
        if (snap.exists()) {
          setTeacher({ ...snap.data(), id: snap.id } as TeacherProfile);
        } else {
          setTeacher(null);
        }
      } finally {
        setLoading(false);
      }
    };
    fetch();
  }, [teacherId]);

  return { teacher, loading };
}

/** Admin: fetch all teachers */
export function useAdminTeachers() {
  const [teachers, setTeachers] = useState<TeacherProfile[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchTeachers = useCallback(async () => {
    setLoading(true);
    try {
      const q = query(collection(db, 'teachers'), orderBy('sortOrder'));
      const snap = await getDocs(q);
      setTeachers(snap.docs.map((d) => ({ ...d.data(), id: d.id }) as TeacherProfile));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchTeachers();
  }, [fetchTeachers]);

  return { teachers, loading, refetch: fetchTeachers };
}

/** Create a new teacher profile */
export async function createTeacher(
  data: Omit<TeacherProfile, 'id' | 'createdAt' | 'updatedAt'>
): Promise<string> {
  const ref = await addDoc(collection(db, 'teachers'), {
    ...data,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  return ref.id;
}

/** Update a teacher profile */
export async function updateTeacher(
  teacherId: string,
  data: Partial<Omit<TeacherProfile, 'id' | 'createdAt'>>
): Promise<void> {
  await updateDoc(doc(db, 'teachers', teacherId), {
    ...data,
    updatedAt: serverTimestamp(),
  });
}

/** Delete a teacher profile */
export async function deleteTeacher(teacherId: string): Promise<void> {
  await deleteDoc(doc(db, 'teachers', teacherId));
}
