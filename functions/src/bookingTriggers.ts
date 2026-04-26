import { onDocumentCreated, onDocumentUpdated } from "firebase-functions/v2/firestore";
import { logger } from "firebase-functions/v2";
import * as admin from "firebase-admin";
import { sendToTeacher, sendToStudent } from "./email";
import { notifyBookingCreated } from "./notifications";
import {
  newBookingTeacher,
  bookingConfirmationStudent,
  paymentConfirmedStudent,
  cancelledBookingStudent,
  cancelledBookingTeacher,
} from "./templates/emails";

interface BookingData {
  studentId: string;
  studentName: string;
  studentEmail: string;
  teacherId: string;
  teacherName: string;
  lessonTypeId: string;
  lessonTypeName: { en: string; vi: string; ko: string; ja: string };
  date: string;
  startTime: string;
  endTime: string;
  format: string;
  platform: string | null;
  paymentMethod: string;
  paymentStatus: string;
  amount: number;
  currency: string;
  status: string;
  notes: string;
}

async function getTeacherEmail(teacherId: string): Promise<string | null> {
  const doc = await admin.firestore().doc(`teachers/${teacherId}`).get();
  return doc.exists ? (doc.data()?.email as string) || null : null;
}

function toEmailData(bookingId: string, data: BookingData) {
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
export const onBookingCreated = onDocumentCreated(
  {
    document: "bookings/{bookingId}",
    secrets: ["GMAIL_CLIENT_ID", "GMAIL_CLIENT_SECRET", "GMAIL_REFRESH_TOKEN"],
  },
  async (event) => {
    const data = event.data?.data() as BookingData | undefined;
    if (!data) return;

    const bookingId = event.params.bookingId;
    const emailData = toEmailData(bookingId, data);
    const teacherEmailAddr = await getTeacherEmail(data.teacherId);

    if (teacherEmailAddr) {
      try {
        // Email to teacher
        const teacherEmail = newBookingTeacher(emailData);
        await sendToTeacher({ to: teacherEmailAddr, ...teacherEmail });
        logger.info(`Sent new booking email to teacher for ${bookingId}`);
      } catch (err) {
        logger.error("Failed to send teacher email", err);
      }
    } else {
      logger.warn(`No email found for teacher ${data.teacherId}, skipping teacher notification`);
    }

    try {
      // Email to student
      const studentEmail = bookingConfirmationStudent(emailData);
      await sendToStudent({ to: data.studentEmail, ...studentEmail });
      logger.info(`Sent booking confirmation to ${data.studentEmail}`);
    } catch (err) {
      logger.error("Failed to send student email", err);
    }

    try {
      await notifyBookingCreated(bookingId, {
        teacherId: data.teacherId,
        studentName: data.studentName,
        lessonTypeName: data.lessonTypeName,
        date: data.date,
        startTime: data.startTime,
      });
    } catch (err) {
      logger.error("Failed to write/send booking notifications", err);
    }
  }
);

/**
 * When a booking is updated:
 * - Payment confirmed → email student
 * - Status cancelled → email both
 */
export const onBookingUpdated = onDocumentUpdated(
  {
    document: "bookings/{bookingId}",
    secrets: ["GMAIL_CLIENT_ID", "GMAIL_CLIENT_SECRET", "GMAIL_REFRESH_TOKEN"],
  },
  async (event) => {
    const before = event.data?.before.data() as BookingData | undefined;
    const after = event.data?.after.data() as BookingData | undefined;
    if (!before || !after) return;

    const bookingId = event.params.bookingId;
    const emailData = toEmailData(bookingId, after);

    // Payment confirmed
    if (
      before.paymentStatus !== "confirmed" &&
      after.paymentStatus === "confirmed"
    ) {
      try {
        const email = paymentConfirmedStudent(emailData);
        await sendToStudent({ to: after.studentEmail, ...email });
        logger.info(`Sent payment confirmation to ${after.studentEmail}`);
      } catch (err) {
        logger.error("Failed to send payment confirmation email", err);
      }
    }

    // Booking cancelled
    if (before.status !== "cancelled" && after.status === "cancelled") {
      try {
        const studentEmail = cancelledBookingStudent(emailData);
        await sendToStudent({ to: after.studentEmail, ...studentEmail });
        logger.info(`Sent cancellation email to ${after.studentEmail}`);
      } catch (err) {
        logger.error("Failed to send student cancellation email", err);
      }

      const teacherEmailAddr = await getTeacherEmail(after.teacherId);
      if (teacherEmailAddr) {
        try {
          const teacherEmail = cancelledBookingTeacher(emailData);
          await sendToTeacher({ to: teacherEmailAddr, ...teacherEmail });
          logger.info(`Sent cancellation email to teacher for ${bookingId}`);
        } catch (err) {
          logger.error("Failed to send teacher cancellation email", err);
        }
      } else {
        logger.warn(`No email found for teacher ${after.teacherId}, skipping teacher cancellation`);
      }
    }
  }
);
