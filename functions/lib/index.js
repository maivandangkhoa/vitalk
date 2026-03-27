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
exports.syncItalkiReviews = exports.scrapeNaverBlog = exports.translateBlogPost = exports.sendLessonReminders = exports.onBookingUpdated = exports.onBookingCreated = exports.setUserRole = exports.confirmTossPayment = exports.capturePaypalOrder = exports.createPaypalOrder = void 0;
const admin = __importStar(require("firebase-admin"));
admin.initializeApp();
// Payment functions
var paypal_1 = require("./paypal");
Object.defineProperty(exports, "createPaypalOrder", { enumerable: true, get: function () { return paypal_1.createPaypalOrder; } });
Object.defineProperty(exports, "capturePaypalOrder", { enumerable: true, get: function () { return paypal_1.capturePaypalOrder; } });
var toss_1 = require("./toss");
Object.defineProperty(exports, "confirmTossPayment", { enumerable: true, get: function () { return toss_1.confirmTossPayment; } });
// Auth
var auth_1 = require("./auth");
Object.defineProperty(exports, "setUserRole", { enumerable: true, get: function () { return auth_1.setUserRole; } });
// Email triggers (Firestore)
var bookingTriggers_1 = require("./bookingTriggers");
Object.defineProperty(exports, "onBookingCreated", { enumerable: true, get: function () { return bookingTriggers_1.onBookingCreated; } });
Object.defineProperty(exports, "onBookingUpdated", { enumerable: true, get: function () { return bookingTriggers_1.onBookingUpdated; } });
// Scheduled tasks
var reminders_1 = require("./reminders");
Object.defineProperty(exports, "sendLessonReminders", { enumerable: true, get: function () { return reminders_1.sendLessonReminders; } });
// Blog AI translation
var translateBlog_1 = require("./translateBlog");
Object.defineProperty(exports, "translateBlogPost", { enumerable: true, get: function () { return translateBlog_1.translateBlogPost; } });
// Naver blog import
var scrapeNaver_1 = require("./scrapeNaver");
Object.defineProperty(exports, "scrapeNaverBlog", { enumerable: true, get: function () { return scrapeNaver_1.scrapeNaverBlog; } });
// italki review sync
var syncItalki_1 = require("./syncItalki");
Object.defineProperty(exports, "syncItalkiReviews", { enumerable: true, get: function () { return syncItalki_1.syncItalkiReviews; } });
//# sourceMappingURL=index.js.map