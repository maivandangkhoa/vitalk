import { useCallback, useEffect, useState } from 'react';
import type { User } from 'firebase/auth';
import {
  collection,
  deleteDoc,
  doc,
  getCountFromServer,
  getDoc,
  getDocs,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
} from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { toDate } from '@/lib/blog';
import { useAuthStore } from '@/stores/authStore';
import type { BlogComment } from '@/types';

/** Tên hiển thị cạnh bình luận. Rules chặn quá 100 ký tự nên cắt tại đây. */
export function commentAuthorName(user: User): string {
  const name = user.displayName || user.email?.split('@')[0] || 'Reader';
  return name.slice(0, 100);
}

/** Rules chỉ nhận ảnh `https://` — provider nào trả về khác thì bỏ, dùng chữ cái đầu. */
function commentAuthorPhoto(user: User): string | null {
  return user.photoURL?.startsWith('https://') ? user.photoURL : null;
}

/**
 * Lượt thích của một bài viết.
 *
 * Id của document like chính là uid, nên không có chuyện like trùng và câu hỏi
 * "tôi đã thích chưa" chỉ tốn một `getDoc`. Tổng số đếm bằng aggregation query —
 * không nuôi counter trên `blogPosts` (client không có quyền ghi vào đó) và
 * cũng không thể lệch số.
 */
export function usePostLikes(postId: string | undefined) {
  const { user } = useAuthStore();
  const uid = user?.uid ?? null;
  const [count, setCount] = useState(0);
  const [liked, setLiked] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!postId) return;
    let cancelled = false;

    const load = async () => {
      setLoading(true);
      try {
        const likes = collection(db, 'blogPosts', postId, 'likes');
        const [total, mine] = await Promise.all([
          getCountFromServer(likes),
          uid ? getDoc(doc(likes, uid)) : Promise.resolve(null),
        ]);
        if (cancelled) return;
        setCount(total.data().count);
        setLiked(mine?.exists() ?? false);
      } catch (error) {
        // Đọc hỏng thì bài vẫn phải đọc được: giữ số 0 thay vì ném ra ngoài
        // effect thành unhandled rejection.
        console.warn('blog likes unavailable', error);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    load();

    return () => {
      cancelled = true;
    };
  }, [postId, uid]);

  /** Bật/tắt like, cập nhật lạc quan rồi trả lại trạng thái cũ nếu ghi hỏng. */
  const toggleLike = useCallback(async () => {
    if (!postId || !uid || saving) return;
    const next = !liked;
    const step = next ? 1 : -1;

    setLiked(next);
    setCount((c) => Math.max(0, c + step));
    setSaving(true);
    try {
      const ref = doc(db, 'blogPosts', postId, 'likes', uid);
      if (next) {
        await setDoc(ref, { createdAt: serverTimestamp() });
      } else {
        await deleteDoc(ref);
      }
    } catch (error) {
      setLiked(!next);
      setCount((c) => Math.max(0, c - step));
      throw error;
    } finally {
      setSaving(false);
    }
  }, [postId, uid, liked, saving]);

  return { count, liked, loading, saving, toggleLike };
}

/**
 * Bình luận của một bài viết: tải một lần rồi sửa danh sách tại chỗ khi thêm/xoá,
 * cùng lối một-lần-fetch với `useBlog.ts`. Blog không cần realtime, và như vậy
 * mỗi lượt đọc bài không phải giữ một listener mở.
 */
export function usePostComments(postId: string | undefined) {
  const [comments, setComments] = useState<BlogComment[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!postId) return;
    let cancelled = false;

    const load = async () => {
      setLoading(true);
      try {
        const snap = await getDocs(
          query(collection(db, 'blogPosts', postId, 'comments'), orderBy('createdAt', 'desc'))
        );
        if (cancelled) return;
        setComments(
          snap.docs.map((d) => {
            const data = d.data();
            return {
              id: d.id,
              authorId: data.authorId,
              authorName: data.authorName,
              authorPhoto: data.authorPhoto ?? null,
              text: data.text,
              createdAt: toDate(data.createdAt),
            } satisfies BlogComment;
          })
        );
      } catch (error) {
        console.warn('blog comments unavailable', error);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    load();

    return () => {
      cancelled = true;
    };
  }, [postId]);

  const addComment = useCallback(
    async (user: User, text: string) => {
      if (!postId) return;
      const ref = doc(collection(db, 'blogPosts', postId, 'comments'));
      const authorName = commentAuthorName(user);
      const authorPhoto = commentAuthorPhoto(user);

      await setDoc(ref, {
        authorId: user.uid,
        authorName,
        authorPhoto,
        text,
        createdAt: serverTimestamp(),
      });

      // `serverTimestamp()` chỉ có giá trị sau khi về tới server; hiển thị bằng
      // giờ máy để bình luận vừa gửi xuất hiện ngay, đúng vị trí đầu danh sách.
      setComments((list) => [
        { id: ref.id, authorId: user.uid, authorName, authorPhoto, text, createdAt: new Date() },
        ...list,
      ]);
    },
    [postId]
  );

  const removeComment = useCallback(
    async (commentId: string) => {
      if (!postId) return;
      await deleteDoc(doc(db, 'blogPosts', postId, 'comments', commentId));
      setComments((list) => list.filter((c) => c.id !== commentId));
    },
    [postId]
  );

  return { comments, loading, addComment, removeComment };
}
