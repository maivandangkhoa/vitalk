import { onDocumentWritten } from "firebase-functions/v2/firestore";
import { logger } from "firebase-functions/v2";
import * as admin from "firebase-admin";
import { notifyCallWaiting } from "./notifications";

interface CallData {
  bookingId: string;
  teacherId: string;
  studentId: string;
  status: string;
  teacherReadyAt: admin.firestore.Timestamp | null;
  studentReadyAt: admin.firestore.Timestamp | null;
}

/** Someone who was not in the lobby before is in it now. */
function justArrived(
  before: CallData | undefined,
  after: CallData,
  key: "teacherReadyAt" | "studentReadyAt"
): boolean {
  return !before?.[key] && !!after[key];
}

async function displayName(uid: string, fallback: string): Promise<string> {
  const snap = await admin.firestore().doc(`users/${uid}`).get();
  return (snap.data()?.displayName as string) || fallback;
}

/**
 * Nudges the absent half of a lesson.
 *
 * Only fires when one peer enters an empty lobby: once both are present the
 * ringing happens in the browser, and pushing then would just buzz a phone
 * that is already in the call.
 */
export const onCallWritten = onDocumentWritten("calls/{callId}", async (event) => {
  const before = event.data?.before.data() as CallData | undefined;
  const after = event.data?.after.data() as CallData | undefined;
  if (!after) return;

  const teacherArrived = justArrived(before, after, "teacherReadyAt");
  const studentArrived = justArrived(before, after, "studentReadyAt");

  try {
    if (teacherArrived && !after.studentReadyAt) {
      await notifyCallWaiting({
        bookingId: after.bookingId,
        recipientId: after.studentId,
        waiterName: await displayName(after.teacherId, "Your teacher"),
      });
    } else if (studentArrived && !after.teacherReadyAt) {
      await notifyCallWaiting({
        bookingId: after.bookingId,
        recipientId: after.teacherId,
        waiterName: await displayName(after.studentId, "Your student"),
      });
    }
  } catch (err) {
    // A failed push must not take the signaling document down with it.
    logger.error("onCallWritten: push failed", err);
  }
});
