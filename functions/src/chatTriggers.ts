import { onDocumentCreated } from "firebase-functions/v2/firestore";
import { onSchedule } from "firebase-functions/v2/scheduler";
import { logger } from "firebase-functions/v2";
import * as admin from "firebase-admin";
import { notifyNewMessage } from "./notifications";
import { sendEmail } from "./email";
import { unreadMessagesEmail } from "./templates/emails";

interface MessageData {
  senderId: string;
  type: "text" | "image";
  text?: string;
  imageUrl?: string;
}

interface ConversationData {
  participants: string[];
  studentId: string;
  teacherId: string;
  studentName: string;
  teacherName: string;
  unread?: Record<string, number>;
  lastPushAt?: admin.firestore.Timestamp;
}

/** Don't re-push for every message in a burst. */
const PUSH_COOLDOWN_MS = 5 * 60 * 1000;

function previewOf(message: MessageData): string {
  if (message.text) return message.text.slice(0, 120);
  return message.type === "image" ? "📷 Photo" : "";
}

/**
 * The client may only write the message itself. Everything derived from it —
 * the conversation's `lastMessage`, `updatedAt`, and the recipient's unread
 * counter — is written here, so a sender can never talk their own counter down
 * to dodge the anti-flood rule.
 */
export const onChatMessageCreated = onDocumentCreated(
  { document: "conversations/{conversationId}/messages/{messageId}" },
  async (event) => {
    const message = event.data?.data() as MessageData | undefined;
    if (!message) return;

    const { conversationId } = event.params;
    const convoRef = admin.firestore().doc(`conversations/${conversationId}`);
    const convoSnap = await convoRef.get();
    const convo = convoSnap.data() as ConversationData | undefined;
    if (!convo) {
      logger.warn(`Message in missing conversation ${conversationId}`);
      return;
    }

    const recipient = convo.participants.find((uid) => uid !== message.senderId);
    if (!recipient) {
      logger.warn(`No recipient for message in ${conversationId}`);
      return;
    }

    const preview = previewOf(message);
    const unreadBefore = convo.unread?.[recipient] ?? 0;
    const lastPushMs = convo.lastPushAt ? convo.lastPushAt.toMillis() : 0;
    // A burst starts when the recipient had nothing waiting; only then does a
    // new bell entry appear. Within a burst we re-push at most every 5 minutes.
    const startsBurst = unreadBefore === 0;
    const shouldPush = startsBurst || Date.now() - lastPushMs > PUSH_COOLDOWN_MS;

    const update: Record<string, unknown> = {
      lastMessage: {
        text: preview,
        senderId: message.senderId,
        type: message.type,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
      },
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      [`unread.${recipient}`]: admin.firestore.FieldValue.increment(1),
    };
    if (shouldPush) {
      update.lastPushAt = admin.firestore.FieldValue.serverTimestamp();
    }
    if (startsBurst) {
      // Picked up by the sweep in `reminders.ts` if it is still unread later.
      update.emailPendingFor = recipient;
      update.emailPendingSince = admin.firestore.FieldValue.serverTimestamp();
    }
    await convoRef.update(update);

    const senderName =
      message.senderId === convo.studentId ? convo.studentName : convo.teacherName;

    await notifyNewMessage({
      conversationId,
      recipientId: recipient,
      recipientIsTeacher: recipient === convo.teacherId,
      senderName,
      preview,
      createNotificationDoc: startsBurst,
      sendPushNotification: shouldPush,
    });
  }
);

/**
 * Push is the primary channel; this is the fallback for a recipient who never
 * granted notification permission or is simply away. A conversation is marked
 * pending when an unread burst starts, and swept here once the message has sat
 * unread long enough to be worth an email.
 */
const EMAIL_AFTER_MS = 15 * 60 * 1000;

async function emailAddressFor(uid: string): Promise<string | null> {
  const userDoc = await admin.firestore().doc(`users/${uid}`).get();
  const fromDoc = userDoc.data()?.email as string | undefined;
  if (fromDoc) return fromDoc;
  try {
    return (await admin.auth().getUser(uid)).email || null;
  } catch {
    return null;
  }
}

export const sweepUnreadMessageEmails = onSchedule(
  {
    schedule: "*/5 * * * *",
    secrets: [
      "GMAIL_CLIENT_ID",
      "GMAIL_CLIENT_SECRET",
      "GMAIL_REFRESH_TOKEN",
      "TEACHER_EMAIL",
    ],
  },
  async () => {
    const cutoff = admin.firestore.Timestamp.fromMillis(Date.now() - EMAIL_AFTER_MS);
    const snapshot = await admin
      .firestore()
      .collection("conversations")
      .where("emailPendingSince", "<=", cutoff)
      .limit(200)
      .get();

    if (snapshot.empty) return;
    logger.info(`Sweeping ${snapshot.size} conversation(s) for unread email`);

    for (const doc of snapshot.docs) {
      const convo = doc.data() as ConversationData & {
        emailPendingFor?: string;
        lastMessage?: { text?: string; senderId?: string };
      };
      // Clear the flag whatever happens, so a conversation is never swept twice
      // for the same burst.
      const clear = {
        emailPendingFor: admin.firestore.FieldValue.delete(),
        emailPendingSince: admin.firestore.FieldValue.delete(),
      };

      const recipient = convo.emailPendingFor;
      const unread = recipient ? convo.unread?.[recipient] ?? 0 : 0;
      if (!recipient || unread === 0) {
        // Already read — nothing to chase.
        await doc.ref.update(clear);
        continue;
      }

      try {
        const to = await emailAddressFor(recipient);
        if (!to) {
          logger.warn(`No email for ${recipient}, skipping unread email`);
        } else {
          const isTeacher = recipient === convo.teacherId;
          const senderName = isTeacher ? convo.studentName : convo.teacherName;
          const link = isTeacher
            ? `/admin/messages/${doc.id}`
            : `/messages/${doc.id}`;
          const mail = unreadMessagesEmail({
            senderName,
            preview: convo.lastMessage?.text || "",
            count: unread,
            link,
          });
          await sendEmail({ to, ...mail });
          logger.info(`Sent unread-message email to ${to} for ${doc.id}`);
        }
      } catch (err) {
        logger.error(`Failed unread-message email for ${doc.id}`, err);
      }

      await doc.ref.update(clear);
    }
  }
);
