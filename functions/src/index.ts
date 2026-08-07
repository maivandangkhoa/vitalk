import * as admin from "firebase-admin";
import * as path from "path";

const serviceAccountPath = path.join(__dirname, "../service-account.json");
// eslint-disable-next-line @typescript-eslint/no-var-requires
const serviceAccount = require(serviceAccountPath);

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  storageBucket: "havitalk",
});

// Payment functions
export { createPaypalOrder, capturePaypalOrder } from "./paypal";
export { confirmTossPayment } from "./toss";

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

// Blog AI translation
export { translateBlogPost } from "./translateBlog";

// Naver blog import
export { scrapeNaverBlog } from "./scrapeNaver";

// italki review sync
export { syncItalkiReviews } from "./syncItalki";

// italki teacher profile import
export { scrapeItalkiProfile } from "./scrapeItalki";
