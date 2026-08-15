import * as admin from "firebase-admin";
import * as path from "path";
import { readFileSync } from "fs";

// Read rather than import: the file sits outside rootDir, so a JSON import
// would not survive the build.
const serviceAccountPath = path.join(__dirname, "../service-account.json");
const serviceAccount = JSON.parse(readFileSync(serviceAccountPath, "utf8"));

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  storageBucket: "havitalk",
});

// Payment functions
export { createPaypalOrder, capturePaypalOrder } from "./paypal";
export { confirmTossPayment } from "./toss";

// Image uploads (public ACL + long cache, so images serve from the GCS edge)
export { publishUpload } from "./publishUpload";

// Auth
export { setUserRole } from "./auth";
export { naverLogin } from "./naverAuth";
export { kakaoLogin } from "./kakaoAuth";

// Email triggers (Firestore)
export { onBookingCreated, onBookingUpdated } from "./bookingTriggers";

// In-app chat
export { onChatMessageCreated, sweepUnreadMessageEmails } from "./chatTriggers";

// Video call (WebRTC)
export { getIceServers } from "./ice";
export { onCallWritten } from "./callTriggers";

// Scheduled tasks
export { sendLessonReminders } from "./reminders";
export { cleanupOldCalls } from "./callCleanup";
export { markBookingsCompleted } from "./completeBookings";
export { sweepOrphanImages } from "./sweepOrphanImages";

// Blog link previews (per-post Open Graph tags for crawlers)
export { blogMeta } from "./ogBlog";

// Blog AI translation
export { translateBlogPost } from "./translateBlog";

// Blog AI illustration (Fechtin AI Gateway → Cloudflare Workers AI)
export { generateBlogImage } from "./generateImage";

// Blog AI writing assistant (Fechtin AI Gateway → Claude Opus)
export { writeBlogPost } from "./writeBlogPost";

// Sửa prompt ảnh theo lời nhắn của người viết
export { refineImagePrompt } from "./refineImagePrompt";

// Naver blog import
export { scrapeNaverBlog } from "./scrapeNaver";

// italki review sync
export { syncItalkiReviews } from "./syncItalki";

// italki teacher profile import
export { scrapeItalkiProfile } from "./scrapeItalki";
