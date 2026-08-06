import type { Timestamp } from 'firebase/firestore';

export type MessageType = 'text' | 'image';

/** Hard cap on a single message, mirrored in firestore.rules. */
export const MAX_MESSAGE_LENGTH = 4000;

/**
 * A sender is blocked once this many of their messages sit unread by the other
 * side. Anti-flood for the open inbox — a student may DM any teacher, so the
 * only thing keeping a conversation civil is that the recipient has to read it
 * to unlock more. Mirrored in firestore.rules.
 */
export const UNREAD_SEND_LIMIT = 20;

export interface LastMessage {
  text: string;
  senderId: string;
  type: MessageType;
  createdAt: Timestamp | null;
}

/**
 * Lives at `conversations/{studentId}_{teacherId}`. The document id *is* the
 * pair, the same way a teacher profile id is its owner — so a pair can never
 * end up with two conversations, and the rules authorize without a lookup.
 */
export interface Conversation {
  id: string;
  participants: [string, string];
  studentId: string;
  teacherId: string;
  /** Denormalized so the conversation list renders from one read. */
  studentName: string;
  studentPhoto: string;
  teacherName: string;
  teacherPhoto: string;
  lastMessage?: LastMessage;
  /** Per-uid unread counter. Only Cloud Functions increment; a participant may
   *  reset their own to zero. */
  unread: Record<string, number>;
  createdAt: Timestamp | null;
  updatedAt: Timestamp | null;
}

export interface ChatMessage {
  id: string;
  senderId: string;
  type: MessageType;
  text: string;
  imageUrl?: string;
  /** Storage path, kept so the image can be deleted with the message later. */
  imagePath?: string;
  createdAt: Timestamp | null;
}
