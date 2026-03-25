import { onSchedule } from "firebase-functions/v2/scheduler";
import { logger } from "firebase-functions/v2";
import * as admin from "firebase-admin";
import { sendToTeacher, sendToStudent } from "./email";
import { lessonReminderStudent, lessonReminderTeacher } from "./templates/emails";

/**
 * Runs daily at 9 AM KST (0:00 UTC) to send reminders
 * for lessons happening the next day.
 */
export const sendLessonReminders = onSchedule(
  {
    schedule: "0 0 * * *", // midnight UTC = 9 AM KST
    timeZone: "Asia/Seoul",
    secrets: ["RESEND_API_KEY", "TEACHER_EMAIL"],
  },
  async () => {
    // Calculate tomorrow's date in KST
    const now = new Date();
    const kstOffset = 9 * 60 * 60 * 1000;
    const kstNow = new Date(now.getTime() + kstOffset);
    const tomorrow = new Date(kstNow);
    tomorrow.setDate(tomorrow.getDate() + 1);
    const tomorrowStr = tomorrow.toISOString().split("T")[0]; // "YYYY-MM-DD"

    logger.info(`Checking for lessons on ${tomorrowStr}`);

    // Query confirmed bookings for tomorrow
    const snapshot = await admin
      .firestore()
      .collection("bookings")
      .where("date", "==", tomorrowStr)
      .where("status", "==", "confirmed")
      .get();

    if (snapshot.empty) {
      logger.info("No lessons tomorrow to remind about");
      return;
    }

    logger.info(`Found ${snapshot.size} lessons to remind about`);

    for (const doc of snapshot.docs) {
      const data = doc.data();
      const emailData = {
        studentName: data.studentName,
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
        const studentEmail = lessonReminderStudent(emailData);
        await sendToStudent({ to: data.studentEmail, ...studentEmail });
        logger.info(`Sent reminder to ${data.studentEmail} for ${doc.id}`);
      } catch (err) {
        logger.error(`Failed to send student reminder for ${doc.id}`, err);
      }

      // Remind teacher
      try {
        const teacherEmail = lessonReminderTeacher(emailData);
        await sendToTeacher(teacherEmail);
        logger.info(`Sent teacher reminder for ${doc.id}`);
      } catch (err) {
        logger.error(`Failed to send teacher reminder for ${doc.id}`, err);
      }
    }
  }
);
