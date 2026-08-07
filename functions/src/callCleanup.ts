import { onSchedule } from "firebase-functions/v2/scheduler";
import { logger } from "firebase-functions/v2";
import * as admin from "firebase-admin";

/** Signaling data is worthless once the lesson is over; keep a week for support. */
const RETENTION_DAYS = 7;

/**
 * Deletes finished call rooms and their ICE candidates.
 *
 * Candidates are the reason this exists: a single call writes a few dozen of
 * them, they are never read again after the connection is up, and nothing else
 * would ever remove them.
 */
export const cleanupOldCalls = onSchedule(
  { schedule: "30 3 * * *", timeZone: "Asia/Seoul" },
  async () => {
    const cutoff = admin.firestore.Timestamp.fromMillis(
      Date.now() - RETENTION_DAYS * 24 * 60 * 60 * 1000
    );

    const stale = await admin
      .firestore()
      .collection("calls")
      .where("updatedAt", "<", cutoff)
      .limit(300)
      .get();

    if (stale.empty) {
      logger.info("cleanupOldCalls: nothing to remove");
      return;
    }

    // recursiveDelete handles the subcollection, which a plain doc delete would
    // silently orphan.
    const firestore = admin.firestore();
    for (const doc of stale.docs) {
      await firestore.recursiveDelete(doc.ref);
    }

    logger.info(`cleanupOldCalls: removed ${stale.size} call rooms`);
  }
);
