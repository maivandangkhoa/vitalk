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
exports.onBookingUpdated = exports.onBookingCreated = void 0;
const firestore_1 = require("firebase-functions/v2/firestore");
const v2_1 = require("firebase-functions/v2");
const admin = __importStar(require("firebase-admin"));
const email_1 = require("./email");
const emails_1 = require("./templates/emails");
async function getTeacherEmail(teacherId) {
    const doc = await admin.firestore().doc(`teachers/${teacherId}`).get();
    return doc.exists ? doc.data()?.email || null : null;
}
function toEmailData(bookingId, data) {
    return {
        studentName: data.studentName,
        teacherName: data.teacherName,
        lessonName: data.lessonTypeName.en,
        date: data.date,
        startTime: data.startTime,
        endTime: data.endTime,
        format: data.format,
        platform: data.platform,
        amount: data.amount,
        currency: data.currency,
        paymentMethod: data.paymentMethod,
        bookingId,
        notes: data.notes || undefined,
    };
}
/**
 * When a new booking is created:
 * - Send notification email to teacher
 * - Send confirmation email to student
 */
exports.onBookingCreated = (0, firestore_1.onDocumentCreated)({
    document: "bookings/{bookingId}",
    secrets: ["GMAIL_CLIENT_ID", "GMAIL_CLIENT_SECRET", "GMAIL_REFRESH_TOKEN"],
}, async (event) => {
    const data = event.data?.data();
    if (!data)
        return;
    const bookingId = event.params.bookingId;
    const emailData = toEmailData(bookingId, data);
    const teacherEmailAddr = await getTeacherEmail(data.teacherId);
    if (teacherEmailAddr) {
        try {
            // Email to teacher
            const teacherEmail = (0, emails_1.newBookingTeacher)(emailData);
            await (0, email_1.sendToTeacher)({ to: teacherEmailAddr, ...teacherEmail });
            v2_1.logger.info(`Sent new booking email to teacher for ${bookingId}`);
        }
        catch (err) {
            v2_1.logger.error("Failed to send teacher email", err);
        }
    }
    else {
        v2_1.logger.warn(`No email found for teacher ${data.teacherId}, skipping teacher notification`);
    }
    try {
        // Email to student
        const studentEmail = (0, emails_1.bookingConfirmationStudent)(emailData);
        await (0, email_1.sendToStudent)({ to: data.studentEmail, ...studentEmail });
        v2_1.logger.info(`Sent booking confirmation to ${data.studentEmail}`);
    }
    catch (err) {
        v2_1.logger.error("Failed to send student email", err);
    }
});
/**
 * When a booking is updated:
 * - Payment confirmed → email student
 * - Status cancelled → email both
 */
exports.onBookingUpdated = (0, firestore_1.onDocumentUpdated)({
    document: "bookings/{bookingId}",
    secrets: ["GMAIL_CLIENT_ID", "GMAIL_CLIENT_SECRET", "GMAIL_REFRESH_TOKEN"],
}, async (event) => {
    const before = event.data?.before.data();
    const after = event.data?.after.data();
    if (!before || !after)
        return;
    const bookingId = event.params.bookingId;
    const emailData = toEmailData(bookingId, after);
    // Payment confirmed
    if (before.paymentStatus !== "confirmed" &&
        after.paymentStatus === "confirmed") {
        try {
            const email = (0, emails_1.paymentConfirmedStudent)(emailData);
            await (0, email_1.sendToStudent)({ to: after.studentEmail, ...email });
            v2_1.logger.info(`Sent payment confirmation to ${after.studentEmail}`);
        }
        catch (err) {
            v2_1.logger.error("Failed to send payment confirmation email", err);
        }
    }
    // Booking cancelled
    if (before.status !== "cancelled" && after.status === "cancelled") {
        try {
            const studentEmail = (0, emails_1.cancelledBookingStudent)(emailData);
            await (0, email_1.sendToStudent)({ to: after.studentEmail, ...studentEmail });
            v2_1.logger.info(`Sent cancellation email to ${after.studentEmail}`);
        }
        catch (err) {
            v2_1.logger.error("Failed to send student cancellation email", err);
        }
        const teacherEmailAddr = await getTeacherEmail(after.teacherId);
        if (teacherEmailAddr) {
            try {
                const teacherEmail = (0, emails_1.cancelledBookingTeacher)(emailData);
                await (0, email_1.sendToTeacher)({ to: teacherEmailAddr, ...teacherEmail });
                v2_1.logger.info(`Sent cancellation email to teacher for ${bookingId}`);
            }
            catch (err) {
                v2_1.logger.error("Failed to send teacher cancellation email", err);
            }
        }
        else {
            v2_1.logger.warn(`No email found for teacher ${after.teacherId}, skipping teacher cancellation`);
        }
    }
});
//# sourceMappingURL=bookingTriggers.js.map