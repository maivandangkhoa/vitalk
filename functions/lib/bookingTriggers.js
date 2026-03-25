"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.onBookingUpdated = exports.onBookingCreated = void 0;
const firestore_1 = require("firebase-functions/v2/firestore");
const v2_1 = require("firebase-functions/v2");
const email_1 = require("./email");
const emails_1 = require("./templates/emails");
function toEmailData(bookingId, data) {
    return {
        studentName: data.studentName,
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
    secrets: ["RESEND_API_KEY", "TEACHER_EMAIL"],
}, async (event) => {
    const data = event.data?.data();
    if (!data)
        return;
    const bookingId = event.params.bookingId;
    const emailData = toEmailData(bookingId, data);
    try {
        // Email to teacher
        const teacherEmail = (0, emails_1.newBookingTeacher)(emailData);
        await (0, email_1.sendToTeacher)(teacherEmail);
        v2_1.logger.info(`Sent new booking email to teacher for ${bookingId}`);
    }
    catch (err) {
        v2_1.logger.error("Failed to send teacher email", err);
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
    secrets: ["RESEND_API_KEY", "TEACHER_EMAIL"],
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
        try {
            const teacherEmail = (0, emails_1.cancelledBookingTeacher)(emailData);
            await (0, email_1.sendToTeacher)(teacherEmail);
            v2_1.logger.info(`Sent cancellation email to teacher for ${bookingId}`);
        }
        catch (err) {
            v2_1.logger.error("Failed to send teacher cancellation email", err);
        }
    }
});
//# sourceMappingURL=bookingTriggers.js.map