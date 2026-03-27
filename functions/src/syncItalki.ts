import { onCall, HttpsError } from "firebase-functions/v2/https";
import * as admin from "firebase-admin";

interface SyncRequest {
  teacherId?: string;
}

interface ItalkiReview {
  user_info: {
    user_id: number;
    nickname: string;
    avatar_file_name: string | null;
    origin_country_id: string;
  };
  comment_info: {
    comment_id: number;
    session_id: number;
    session_language: string;
    content: string;
    create_time: string;
    is_reviews_up: boolean;
  };
  comment_count: number;
  lesson_count: number;
  has_anonymous: number;
  allow_show: number;
}

interface ItalkiResponse {
  success: number;
  data: ItalkiReview[];
  has_next: number;
  total: number;
  page: number;
  page_size: number;
}

/**
 * Sync reviews from an italki teacher profile into Firestore.
 * Admin-only callable function.
 */
export const syncItalkiReviews = onCall(
  { cors: true, invoker: "public", timeoutSeconds: 60, memory: "256MiB" },
  async (request) => {
    // Auth check
    if (!request.auth) {
      throw new HttpsError("unauthenticated", "Login required");
    }

    const userDoc = await admin
      .firestore()
      .collection("users")
      .doc(request.auth.uid)
      .get();
    if (userDoc.data()?.role !== "admin") {
      throw new HttpsError("permission-denied", "Admin only");
    }

    const teacherId = (request.data as SyncRequest).teacherId || "12945599";

    // Fetch existing italki reviews to deduplicate
    const existingSnap = await admin
      .firestore()
      .collection("reviews")
      .where("source", "==", "italki")
      .get();
    const existingIds = new Set(
      existingSnap.docs.map((d) => d.data().externalId as string)
    );

    // Fetch reviews from italki API (paginated)
    const allReviews: ItalkiReview[] = [];
    let page = 1;
    let hasNext = true;

    while (hasNext) {
      const url = `https://api.italki.com/api/v2/teacher/${teacherId}/reviews?page=${page}&page_size=100`;
      const res = await fetch(url, {
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
          Accept: "application/json",
        },
      });

      if (!res.ok) {
        throw new HttpsError(
          "unavailable",
          `italki API returned ${res.status}`
        );
      }

      const json = (await res.json()) as ItalkiResponse;
      if (!json.success) {
        throw new HttpsError("unavailable", "italki API returned error");
      }

      allReviews.push(...json.data);
      hasNext = json.has_next === 1;
      page++;
    }

    // Filter new reviews and batch write
    let imported = 0;
    let skipped = 0;
    const batch = admin.firestore().batch();

    for (const review of allReviews) {
      const extId = String(review.comment_info.comment_id);

      if (existingIds.has(extId)) {
        skipped++;
        continue;
      }

      const ref = admin.firestore().collection("reviews").doc();
      batch.set(ref, {
        studentId: `italki_${review.user_info.user_id}`,
        studentName: review.user_info.nickname,
        studentAvatarUrl: null,
        rating: 5,
        content: review.comment_info.content,
        lessonType: "Vietnamese",
        language: "en",
        isVisible: true,
        createdAt: new Date(review.comment_info.create_time),
        source: "italki",
        externalId: extId,
      });
      imported++;
    }

    if (imported > 0) {
      await batch.commit();
    }

    return { imported, skipped, total: allReviews.length };
  }
);
