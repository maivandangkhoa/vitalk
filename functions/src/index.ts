import * as admin from "firebase-admin";

admin.initializeApp();

// Payment functions
export { createPaypalOrder, capturePaypalOrder } from "./paypal";
export { confirmTossPayment } from "./toss";

// Auth
export { setUserRole } from "./auth";

// Email triggers (Firestore)
export { onBookingCreated, onBookingUpdated } from "./bookingTriggers";

// Scheduled tasks
export { sendLessonReminders } from "./reminders";

// Blog AI translation
export { translateBlogPost } from "./translateBlog";

// Naver blog import
export { scrapeNaverBlog } from "./scrapeNaver";

// italki review sync
export { syncItalkiReviews } from "./syncItalki";
