import { useState, useEffect, useCallback } from 'react';
import {
  collection,
  doc,
  getDoc,
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
import type { BlogPost } from '@/types';

/** Fetch published blog posts (public) */
export function usePublishedPosts() {
  const [posts, setPosts] = useState<BlogPost[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchPosts = async () => {
      setLoading(true);
      try {
        const q = query(
          collection(db, 'blogPosts'),
          where('isPublished', '==', true),
          orderBy('publishedAt', 'desc')
        );
        const snap = await getDocs(q);
        setPosts(snap.docs.map((d) => ({ id: d.id, ...d.data() }) as BlogPost));
      } finally {
        setLoading(false);
      }
    };
    fetchPosts();
  }, []);

  return { posts, loading };
}

/** Fetch single blog post by slug (public) */
export function useBlogPost(slug: string) {
  const [post, setPost] = useState<BlogPost | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!slug) return;

    const fetchPost = async () => {
      setLoading(true);
      try {
        // Query by slug
        const q = query(
          collection(db, 'blogPosts'),
          where('slug', '==', slug),
          where('isPublished', '==', true)
        );
        const snap = await getDocs(q);
        if (!snap.empty) {
          const doc = snap.docs[0];
          setPost({ id: doc.id, ...doc.data() } as BlogPost);
        } else {
          setPost(null);
        }
      } finally {
        setLoading(false);
      }
    };
    fetchPost();
  }, [slug]);

  return { post, loading };
}

/** Admin: fetch single blog post by slug (preview, no isPublished filter) */
export function useBlogPostPreview(slug: string) {
  const [post, setPost] = useState<BlogPost | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!slug) return;

    const fetchPost = async () => {
      setLoading(true);
      try {
        const q = query(
          collection(db, 'blogPosts'),
          where('slug', '==', slug)
        );
        const snap = await getDocs(q);
        if (!snap.empty) {
          const d = snap.docs[0];
          setPost({ id: d.id, ...d.data() } as BlogPost);
        } else {
          setPost(null);
        }
      } finally {
        setLoading(false);
      }
    };
    fetchPost();
  }, [slug]);

  return { post, loading };
}

/** Admin: fetch all blog posts */
export function useAdminBlogPosts() {
  const [posts, setPosts] = useState<BlogPost[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchPosts = useCallback(async () => {
    setLoading(true);
    try {
      const q = query(collection(db, 'blogPosts'), orderBy('createdAt', 'desc'));
      const snap = await getDocs(q);
      setPosts(snap.docs.map((d) => ({ id: d.id, ...d.data() }) as BlogPost));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchPosts();
  }, [fetchPosts]);

  return { posts, loading, refetch: fetchPosts };
}

/** Admin: fetch single blog post by ID for editing */
export function useAdminBlogPost(id: string | undefined) {
  const [post, setPost] = useState<BlogPost | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!id || id === 'new') {
      setPost(null);
      setLoading(false);
      return;
    }

    const fetchPost = async () => {
      setLoading(true);
      try {
        const snap = await getDoc(doc(db, 'blogPosts', id));
        if (snap.exists()) {
          setPost({ id: snap.id, ...snap.data() } as BlogPost);
        } else {
          setPost(null);
        }
      } finally {
        setLoading(false);
      }
    };
    fetchPost();
  }, [id]);

  return { post, loading };
}

/** Admin: save blog post (create or update) */
export function useSaveBlogPost() {
  const [loading, setLoading] = useState(false);

  const saveBlogPost = useCallback(
    async (
      id: string | null,
      data: Omit<BlogPost, 'id' | 'createdAt' | 'updatedAt' | 'viewCount'>
    ): Promise<string> => {
      setLoading(true);
      try {
        if (id) {
          // Update
          await updateDoc(doc(db, 'blogPosts', id), {
            ...data,
            updatedAt: serverTimestamp(),
          });
          return id;
        } else {
          // Create
          const ref = doc(collection(db, 'blogPosts'));
          await setDoc(ref, {
            ...data,
            viewCount: 0,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          });
          return ref.id;
        }
      } finally {
        setLoading(false);
      }
    },
    []
  );

  return { saveBlogPost, loading };
}

/** Admin: delete blog post */
export async function deleteBlogPost(id: string) {
  await deleteDoc(doc(db, 'blogPosts', id));
}

/** Admin: toggle publish */
export async function togglePublish(id: string, publish: boolean) {
  await updateDoc(doc(db, 'blogPosts', id), {
    isPublished: publish,
    publishedAt: publish ? serverTimestamp() : null,
    updatedAt: serverTimestamp(),
  });
}
