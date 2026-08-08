import { onSchedule } from "firebase-functions/v2/scheduler";
import { logger } from "firebase-functions/v2";
import * as admin from "firebase-admin";

/** Mirrors DEFAULT_TIMEZONE in src/lib/constants.ts and convertTime()'s fallback. */
const DEFAULT_TIMEZONE = "Asia/Seoul";

/**
 * How long past the scheduled end before a lesson counts as done. Lessons run
 * over, and a review prompt appearing while the two are still talking is worse
 * than one appearing a few minutes late.
 */
const GRACE_MINUTES = 15;

/** Firestore caps a write batch at 500. */
const BATCH_LIMIT = 500;

/** How far ahead of UTC a zone is at a given instant, in milliseconds. */
function zoneOffsetMs(at: Date, timeZone: string): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hour12: false,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(at);
  const get = (type: string) =>
    Number(parts.find((p) => p.type === type)?.value ?? NaN);
  const asIfUtc = Date.UTC(
    get("year"),
    get("month") - 1,
    get("day"),
    // `hour12: false` reports midnight as 24 on some ICU builds.
    get("hour") % 24,
    get("minute"),
    get("second")
  );
  return asIfUtc - at.getTime();
}

/**
 * The UTC instant of a wall-clock `date` + `time` read in `timeZone`.
 *
 * A booking's date/startTime/endTime are stored in the *teacher's* zone — they
 * index that teacher's availability document — so converting through their zone
 * is the only way to know when the lesson actually ended. The offset is applied
 * twice because the first reading is taken at the wrong instant, which only
 * matters across a DST boundary but is wrong by an hour when it does.
 */
function zonedToUtc(date: string, time: string, timeZone: string): Date | null {
  const naive = Date.parse(`${date}T${time}:00Z`);
  if (Number.isNaN(naive)) return null;
  const firstPass = naive - zoneOffsetMs(new Date(naive), timeZone);
  const utc = naive - zoneOffsetMs(new Date(firstPass), timeZone);
  return Number.isNaN(utc) ? null : new Date(utc);
}

/**
 * Moves confirmed bookings to `completed` once their lesson has ended.
 *
 * Without this the status only ever changed when an admin clicked it in
 * /admin/bookings, and nobody did — every past booking sat at `confirmed`. That
 * matters beyond bookkeeping: the "write a review" button in /my-bookings is
 * gated on `completed`, so the whole review flow was unreachable and every
 * review on the site had come from the italki importer instead of a student.
 */
export const markBookingsCompleted = onSchedule(
  { schedule: "*/30 * * * *", timeZone: DEFAULT_TIMEZONE, timeoutSeconds: 300 },
  async () => {
    const db = admin.firestore();

    // Equality on status plus a range on date would need a composite index, and
    // the collection is small, so the date test happens here instead.
    const snap = await db
      .collection("bookings")
      .where("status", "==", "confirmed")
      .get();

    if (snap.empty) {
      logger.info("markBookingsCompleted: no confirmed bookings");
      return;
    }

    const zoneCache = new Map<string, string>();
    const zoneFor = async (teacherId?: string): Promise<string> => {
      if (!teacherId) return DEFAULT_TIMEZONE;
      const cached = zoneCache.get(teacherId);
      if (cached) return cached;
      const doc = await db.doc(`teachers/${teacherId}`).get();
      const zone = (doc.data()?.timezone as string) || DEFAULT_TIMEZONE;
      zoneCache.set(teacherId, zone);
      return zone;
    };

    const now = Date.now();
    const due: string[] = [];
    let unreadable = 0;

    for (const doc of snap.docs) {
      const booking = doc.data() as {
        teacherId?: string;
        date?: string;
        endTime?: string;
      };
      if (!booking.date || !booking.endTime) {
        unreadable++;
        continue;
      }

      const ended = zonedToUtc(
        booking.date,
        booking.endTime,
        await zoneFor(booking.teacherId)
      );
      if (!ended) {
        unreadable++;
        continue;
      }

      if (now >= ended.getTime() + GRACE_MINUTES * 60_000) {
        due.push(doc.id);
      }
    }

    if (unreadable > 0) {
      logger.warn(
        `markBookingsCompleted: ${unreadable} booking(s) had no usable date/endTime`
      );
    }

    for (let i = 0; i < due.length; i += BATCH_LIMIT) {
      const batch = db.batch();
      for (const id of due.slice(i, i + BATCH_LIMIT)) {
        batch.update(db.doc(`bookings/${id}`), {
          status: "completed",
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        });
      }
      await batch.commit();
    }

    logger.info(
      `markBookingsCompleted: ${due.length} of ${snap.size} confirmed booking(s) completed`
    );
  }
);
