import * as admin from "firebase-admin";
import { logger } from "firebase-functions/v2";

interface MultiLang {
  en: string;
  vi: string;
  ko: string;
  ja: string;
}

interface BookingCreatedInput {
  teacherId: string;
  studentName: string;
  lessonTypeName: MultiLang;
  date: string;
  startTime: string;
}

async function getTeacherUid(teacherId: string): Promise<string | null> {
  // A teacher profile is stored under its owner's uid, so the id *is* the uid.
  // An unclaimed profile has no owner account and nobody to notify.
  const user = await admin.firestore().doc(`users/${teacherId}`).get();
  return user.exists ? teacherId : null;
}

async function getAdminUserIds(): Promise<string[]> {
  const snap = await admin
    .firestore()
    .collection("users")
    .where("role", "==", "admin")
    .get();
  return snap.docs.map((d) => d.id);
}

async function getFcmTokens(userIds: string[]): Promise<{ uid: string; tokens: string[] }[]> {
  if (userIds.length === 0) return [];
  const reads = await Promise.all(
    userIds.map((uid) => admin.firestore().doc(`users/${uid}`).get())
  );
  return reads
    .map((snap) => {
      const tokens = (snap.data()?.fcmTokens as string[] | undefined) || [];
      return { uid: snap.id, tokens };
    })
    .filter((x) => x.tokens.length > 0);
}

async function pruneInvalidTokens(
  perUser: { uid: string; tokens: string[] }[],
  invalid: Set<string>
) {
  if (invalid.size === 0) return;
  const batch = admin.firestore().batch();
  for (const { uid, tokens } of perUser) {
    const dead = tokens.filter((t) => invalid.has(t));
    if (dead.length === 0) continue;
    batch.update(admin.firestore().doc(`users/${uid}`), {
      fcmTokens: admin.firestore.FieldValue.arrayRemove(...dead),
    });
  }
  await batch.commit();
}

async function sendPush(
  userIds: string[],
  payload: { title: string; body: string; link: string }
) {
  const perUser = await getFcmTokens(userIds);
  const allTokens = perUser.flatMap((x) => x.tokens);
  if (allTokens.length === 0) return;

  const res = await admin.messaging().sendEachForMulticast({
    tokens: allTokens,
    notification: { title: payload.title, body: payload.body },
    data: { link: payload.link },
    webpush: {
      fcmOptions: { link: payload.link },
      notification: { icon: "/apple-touch-icon.png" },
    },
  });

  const invalid = new Set<string>();
  res.responses.forEach((r, i) => {
    if (r.success) return;
    const code = r.error?.code;
    if (
      code === "messaging/registration-token-not-registered" ||
      code === "messaging/invalid-registration-token" ||
      code === "messaging/invalid-argument"
    ) {
      invalid.add(allTokens[i]);
    } else {
      logger.warn("FCM send error", { code, message: r.error?.message });
    }
  });
  await pruneInvalidTokens(perUser, invalid);

  logger.info(`FCM sent: ${res.successCount}/${allTokens.length}`);
}

interface NewMessageInput {
  conversationId: string;
  recipientId: string;
  recipientIsTeacher: boolean;
  senderName: string;
  preview: string;
  /** True only when the recipient's unread counter went from zero. */
  createNotificationDoc: boolean;
  sendPushNotification: boolean;
}

/**
 * One bell entry per unread burst, not per message — a chat would otherwise
 * bury every other notification. `onChatMessageCreated` decides when a burst
 * starts and how often to re-push.
 */
export async function notifyNewMessage(input: NewMessageInput) {
  const title = `New message from ${input.senderName}`;
  const body = input.preview;
  // Teachers and admins answer from the admin shell; students from the public one.
  const link = input.recipientIsTeacher
    ? `/admin/messages/${input.conversationId}`
    : `/messages/${input.conversationId}`;

  if (input.createNotificationDoc) {
    await admin.firestore().collection("notifications").add({
      userId: input.recipientId,
      type: "new_message",
      conversationId: input.conversationId,
      link,
      title,
      body,
      meta: { senderName: input.senderName },
      read: false,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });
  }

  if (input.sendPushNotification) {
    await sendPush([input.recipientId], { title, body, link });
  }
}

export async function notifyBookingCreated(
  bookingId: string,
  input: BookingCreatedInput
) {
  const teacherUid = await getTeacherUid(input.teacherId);
  const adminUids = await getAdminUserIds();

  const recipients = new Set<string>();
  if (teacherUid) recipients.add(teacherUid);
  adminUids.forEach((uid) => recipients.add(uid));
  if (recipients.size === 0) {
    logger.warn(`No notification recipients for booking ${bookingId}`);
    return;
  }

  const title = `New booking from ${input.studentName}`;
  const body = `${input.lessonTypeName.en} on ${input.date} at ${input.startTime}`;
  const link = `/admin/bookings`;

  const batch = admin.firestore().batch();
  recipients.forEach((uid) => {
    const ref = admin.firestore().collection("notifications").doc();
    batch.set(ref, {
      userId: uid,
      type: "booking_created",
      bookingId,
      title,
      body,
      meta: {
        studentName: input.studentName,
        lessonName: input.lessonTypeName,
        date: input.date,
        startTime: input.startTime,
        teacherId: input.teacherId,
      },
      read: false,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });
  });
  await batch.commit();
  logger.info(`Wrote ${recipients.size} notification(s) for booking ${bookingId}`);

  await sendPush(Array.from(recipients), { title, body, link });
}
