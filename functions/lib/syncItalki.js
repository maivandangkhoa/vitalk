"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.syncItalkiReviews = void 0;
const https_1 = require("firebase-functions/v2/https");
const admin = __importStar(require("firebase-admin"));
/**
 * Sync reviews from an italki teacher profile into Firestore.
 * Admin-only callable function.
 */
exports.syncItalkiReviews = (0, https_1.onCall)({ cors: true, invoker: "public", timeoutSeconds: 60, memory: "256MiB" }, async (request) => {
    // Auth check
    if (!request.auth) {
        throw new https_1.HttpsError("unauthenticated", "Login required");
    }
    const userDoc = await admin
        .firestore()
        .collection("users")
        .doc(request.auth.uid)
        .get();
    if (userDoc.data()?.role !== "admin") {
        throw new https_1.HttpsError("permission-denied", "Admin only");
    }
    const { teacherId: firestoreTeacherId } = request.data;
    if (!firestoreTeacherId) {
        throw new https_1.HttpsError("invalid-argument", "teacherId is required");
    }
    // Look up the italki teacher ID from the teacher document
    const teacherDoc = await admin.firestore().doc(`teachers/${firestoreTeacherId}`).get();
    const italkiTeacherId = teacherDoc.data()?.italkiId || "12945599";
    // Fetch existing italki reviews to deduplicate
    const existingSnap = await admin
        .firestore()
        .collection("reviews")
        .where("source", "==", "italki")
        .get();
    const existingIds = new Set(existingSnap.docs.map((d) => d.data().externalId));
    // Fetch reviews from italki API (paginated)
    const allReviews = [];
    let page = 1;
    let hasNext = true;
    while (hasNext) {
        const url = `https://api.italki.com/api/v2/teacher/${italkiTeacherId}/reviews?page=${page}&page_size=100`;
        const res = await fetch(url, {
            headers: {
                "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
                Accept: "application/json",
            },
        });
        if (!res.ok) {
            throw new https_1.HttpsError("unavailable", `italki API returned ${res.status}`);
        }
        const json = (await res.json());
        if (!json.success) {
            throw new https_1.HttpsError("unavailable", "italki API returned error");
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
            teacherId: firestoreTeacherId,
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
});
//# sourceMappingURL=syncItalki.js.map