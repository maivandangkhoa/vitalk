import { onCall, HttpsError } from "firebase-functions/v2/https";
import * as admin from "firebase-admin";

/**
 * Prefixes whose objects are public by design — Storage rules already grant an
 * unauthenticated `allow read` on every one of them, so a public ACL widens
 * nothing. `chat-images/` is deliberately absent: those are private messages
 * between a student and a teacher.
 */
const PUBLIC_PREFIXES = [
  "teacher-profiles/",
  "teacher-qr/",
  "blog-images/",
  "blog-covers/",
];

/**
 * A year, immutable. Safe because every upload lands on a fresh timestamped
 * path — nothing is ever replaced in place, so no cached copy can go stale.
 */
export const PUBLIC_CACHE_CONTROL = "public, max-age=31536000, immutable";

interface PublishRequest {
  path: string;
}

/**
 * Marks a freshly uploaded object public and gives it a long cache lifetime.
 *
 * This is what lets the app serve images from `storage.googleapis.com`, which
 * Google edge-caches, rather than the `firebasestorage.googleapis.com` download
 * endpoint, which is a plain API frontend — measured at 0.8-2.4s TTFB against
 * 67ms for the same bucket through the public URL.
 *
 * It has to live server-side: the web SDK can set object metadata but not an
 * object ACL.
 */
export const publishUpload = onCall(
  { cors: true, invoker: "public", timeoutSeconds: 30, memory: "256MiB" },
  async (request): Promise<{ url: string }> => {
    if (!request.auth) {
      throw new HttpsError("unauthenticated", "Login required");
    }

    const userDoc = await admin
      .firestore()
      .doc(`users/${request.auth.uid}`)
      .get();
    if (userDoc.data()?.role !== "admin") {
      throw new HttpsError("permission-denied", "Admin only");
    }

    const { path } = (request.data ?? {}) as PublishRequest;
    if (!path || typeof path !== "string") {
      throw new HttpsError("invalid-argument", "path is required");
    }

    // GCS object names are literal strings — a "../" in one addresses a
    // different (non-existent) object rather than escaping the prefix — so a
    // plain prefix test is a sufficient guard here.
    if (!PUBLIC_PREFIXES.some((prefix) => path.startsWith(prefix))) {
      throw new HttpsError(
        "invalid-argument",
        `Refusing to publish "${path}": not under a public prefix`
      );
    }

    const file = admin.storage().bucket().file(path);
    const [exists] = await file.exists();
    if (!exists) {
      throw new HttpsError("not-found", `No object at "${path}"`);
    }

    await file.setMetadata({ cacheControl: PUBLIC_CACHE_CONTROL });
    await file.makePublic();

    return {
      url: `https://storage.googleapis.com/${file.bucket.name}/${path}`,
    };
  }
);
