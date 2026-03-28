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
exports.sendLessonReminders = void 0;
const scheduler_1 = require("firebase-functions/v2/scheduler");
const v2_1 = require("firebase-functions/v2");
const admin = __importStar(require("firebase-admin"));
const email_1 = require("./email");
const emails_1 = require("./templates/emails");
/**
 * Runs daily at 9 AM KST (0:00 UTC) to send reminders
 * for lessons happening the next day.
 */
exports.sendLessonReminders = (0, scheduler_1.onSchedule)({
    schedule: "0 0 * * *", // midnight UTC = 9 AM KST
    timeZone: "Asia/Seoul",
    secrets: ["GMAIL_CLIENT_ID", "GMAIL_CLIENT_SECRET", "GMAIL_REFRESH_TOKEN"],
}, async () => {
    // Calculate tomorrow's date in KST
    const now = new Date();
    const kstOffset = 9 * 60 * 60 * 1000;
    const kstNow = new Date(now.getTime() + kstOffset);
    const tomorrow = new Date(kstNow);
    tomorrow.setDate(tomorrow.getDate() + 1);
    const tomorrowStr = tomorrow.toISOString().split("T")[0]; // "YYYY-MM-DD"
    v2_1.logger.info(`Checking for lessons on ${tomorrowStr}`);
    // Query confirmed bookings for tomorrow
    const snapshot = await admin
        .firestore()
        .collection("bookings")
        .where("date", "==", tomorrowStr)
        .where("status", "==", "confirmed")
        .get();
    if (snapshot.empty) {
        v2_1.logger.info("No lessons tomorrow to remind about");
        return;
    }
    v2_1.logger.info(`Found ${snapshot.size} lessons to remind about`);
    for (const doc of snapshot.docs) {
        const data = doc.data();
        const emailData = {
            studentName: data.studentName,
            teacherName: data.teacherName || "Your teacher",
            lessonName: data.lessonTypeName?.en || "Vietnamese Lesson",
            date: data.date,
            startTime: data.startTime,
            endTime: data.endTime,
            format: data.format,
            platform: data.platform,
            amount: data.amount,
            currency: data.currency,
            paymentMethod: data.paymentMethod,
            bookingId: doc.id,
            meetingLink: data.meetingLink || null,
        };
        // Remind student
        try {
            const studentEmail = (0, emails_1.lessonReminderStudent)(emailData);
            await (0, email_1.sendToStudent)({ to: data.studentEmail, ...studentEmail });
            v2_1.logger.info(`Sent reminder to ${data.studentEmail} for ${doc.id}`);
        }
        catch (err) {
            v2_1.logger.error(`Failed to send student reminder for ${doc.id}`, err);
        }
        // Remind teacher
        try {
            let teacherEmailAddr = null;
            if (data.teacherId) {
                const teacherDoc = await admin.firestore().doc(`teachers/${data.teacherId}`).get();
                teacherEmailAddr = teacherDoc.exists ? teacherDoc.data()?.email || null : null;
            }
            if (teacherEmailAddr) {
                const teacherEmail = (0, emails_1.lessonReminderTeacher)(emailData);
                await (0, email_1.sendToTeacher)({ to: teacherEmailAddr, ...teacherEmail });
                v2_1.logger.info(`Sent teacher reminder for ${doc.id}`);
            }
            else {
                v2_1.logger.warn(`No teacher email found for booking ${doc.id}, skipping teacher reminder`);
            }
        }
        catch (err) {
            v2_1.logger.error(`Failed to send teacher reminder for ${doc.id}`, err);
        }
    }
});
//# sourceMappingURL=reminders.js.map