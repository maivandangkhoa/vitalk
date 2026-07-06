import { useEffect, useState } from 'react';
import { doc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import type { MultiLangText } from '@/types';

const EMPTY: MultiLangText = { en: '', vi: '', ko: '', zh: '', ja: '' };

/** Reads the editable policy page content from siteConfig/policy. */
export function usePolicy() {
  const [content, setContent] = useState<MultiLangText>(EMPTY);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    getDoc(doc(db, 'siteConfig', 'policy'))
      .then((snap) => {
        if (cancelled) return;
        const data = snap.data() as { content?: MultiLangText } | undefined;
        if (data?.content) setContent({ ...EMPTY, ...data.content });
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return { content, loading };
}

export async function savePolicy(content: MultiLangText) {
  await setDoc(
    doc(db, 'siteConfig', 'policy'),
    { content, updatedAt: serverTimestamp() },
    { merge: true },
  );
}
