import { onSchedule } from "firebase-functions/v2/scheduler";
import { logger } from "firebase-functions/v2";
import * as admin from "firebase-admin";

/** Signaling data is worthless once the lesson is over; keep a week for support. */
const RETENTION_DAYS = 7;

/** Rooms removed per run, and how many of them are deleted at once. */
const BATCH_SIZE = 300;
const CONCURRENCY = 10;

/**
 * Deletes finished call rooms and their ICE candidates.
 *
 * Candidates are the reason this exists: a single call writes a few dozen of
 * them, they are never read again after the connection is up, and nothing else
 * would ever remove them.
 */
export const cleanupOldCalls = onSchedule(
  // A recursive delete is several round trips, and the default minute was not
  // enough for a full batch of them — the run died part-way through and the
  // rest of the rooms waited for tomorrow, every day.
  { schedule: "30 3 * * *", timeZone: "Asia/Seoul", timeoutSeconds: 540 },
  async () => {
    const cutoff = admin.firestore.Timestamp.fromMillis(
      Date.now() - RETENTION_DAYS * 24 * 60 * 60 * 1000
    );

    const stale = await admin
      .firestore()
      .collection("calls")
      .where("updatedAt", "<", cutoff)
      .limit(BATCH_SIZE)
      .get();

    if (stale.empty) {
      logger.info("cleanupOldCalls: nothing to remove");
      return;
    }

    // recursiveDelete handles the subcollection, which a plain doc delete would
    // silently orphan. A few at a time rather than one after another: each is
    // latency, not work, and strictly sequential was what put a full batch past
    // the timeout.
    const firestore = admin.firestore();
    let removed = 0;
    for (let i = 0; i < stale.docs.length; i += CONCURRENCY) {
      const chunk = stale.docs.slice(i, i + CONCURRENCY);
      const results = await Promise.allSettled(
        chunk.map((doc) => firestore.recursiveDelete(doc.ref))
      );
      // One room that refuses to go must not take the rest of the run with it.
      for (const result of results) {
        if (result.status === "fulfilled") removed++;
        else logger.error("cleanupOldCalls: deleting a room failed", result.reason);
      }
    }

    logger.info(`cleanupOldCalls: removed ${removed}/${stale.size} call rooms`);
  }
);
