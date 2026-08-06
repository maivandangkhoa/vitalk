import {
  addDoc,
  collection,
  doc,
  getDoc,
  serverTimestamp,
  setDoc,
  updateDoc,
} from 'firebase/firestore';
import { getDownloadURL, ref, uploadBytes } from 'firebase/storage';
import { db, storage } from './firebase';
import { MAX_MESSAGE_LENGTH } from '@/types/chat';
import type { Conversation, TeacherProfile } from '@/types';

/**
 * A conversation's id is its pair. Deriving it instead of querying means the
 * "open a chat" button never creates a second thread for the same two people,
 * even if it is clicked twice on two devices.
 */
export function conversationIdFor(studentId: string, teacherId: string): string {
  return `${studentId}_${teacherId}`;
}

/** The participant who is not `uid`. */
export function otherParticipant(convo: Conversation, uid: string): string {
  return convo.participants[0] === uid ? convo.participants[1] : convo.participants[0];
}

/** How the other side should be labelled in `uid`'s inbox. */
export function counterpartOf(convo: Conversation, uid: string) {
  const isStudent = convo.studentId === uid;
  return {
    uid: isStudent ? convo.teacherId : convo.studentId,
    name: isStudent ? convo.teacherName : convo.studentName,
    photo: isStudent ? convo.teacherPhoto : convo.studentPhoto,
  };
}

export function unreadFor(convo: Conversation, uid: string): number {
  return convo.unread?.[uid] ?? 0;
}

interface OpenConversationInput {
  studentId: string;
  studentName: string;
  studentPhoto?: string;
  teacher: Pick<TeacherProfile, 'id' | 'name' | 'profileImageUrl'>;
}

/**
 * Return the id of the pair's conversation, creating it if this is the first
 * contact. Safe to call on every "Message" click.
 */
export async function openConversation({
  studentId,
  studentName,
  studentPhoto,
  teacher,
}: OpenConversationInput): Promise<string> {
  const id = conversationIdFor(studentId, teacher.id);
  const convoRef = doc(db, 'conversations', id);
  const existing = await getDoc(convoRef);
  if (existing.exists()) return id;

  // Shape must match the create rule exactly: no lastMessage, both counters at
  // zero, participants in [student, teacher] order.
  await setDoc(convoRef, {
    participants: [studentId, teacher.id],
    studentId,
    teacherId: teacher.id,
    studentName,
    studentPhoto: studentPhoto || '',
    teacherName: teacher.name,
    teacherPhoto: teacher.profileImageUrl || '',
    unread: { [studentId]: 0, [teacher.id]: 0 },
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });

  return id;
}

/**
 * `lastMessage`, `updatedAt` and the recipient's unread counter are written by
 * the `onChatMessageCreated` trigger — the client is not allowed to touch them,
 * so a counter can never be talked down by the person doing the sending.
 */
export async function sendTextMessage(
  conversationId: string,
  senderId: string,
  text: string
): Promise<void> {
  const trimmed = text.trim();
  if (!trimmed) return;

  await addDoc(collection(db, 'conversations', conversationId, 'messages'), {
    senderId,
    type: 'text',
    text: trimmed.slice(0, MAX_MESSAGE_LENGTH),
    createdAt: serverTimestamp(),
  });
}

function extensionOf(file: File): string {
  const fromName = file.name.split('.').pop();
  if (fromName && fromName.length <= 5) return fromName.toLowerCase();
  return file.type.split('/')[1] || 'jpg';
}

export async function sendImageMessage(
  conversationId: string,
  senderId: string,
  file: File,
  caption = ''
): Promise<void> {
  // The file name is the only thing standing between an attachment and any
  // signed-in user who guesses its path, so make it unguessable.
  const path = `chat-images/${conversationId}/${crypto.randomUUID()}.${extensionOf(file)}`;
  const snapshot = await uploadBytes(ref(storage, path), file);
  const imageUrl = await getDownloadURL(snapshot.ref);

  await addDoc(collection(db, 'conversations', conversationId, 'messages'), {
    senderId,
    type: 'image',
    text: caption.trim().slice(0, MAX_MESSAGE_LENGTH),
    imageUrl,
    imagePath: path,
    createdAt: serverTimestamp(),
  });
}

/**
 * Clear my own unread counter. The rule lets a participant zero their own key
 * and nothing else, so this is the whole "mark as read" story.
 */
export async function markConversationRead(
  convo: Conversation,
  uid: string
): Promise<void> {
  if (unreadFor(convo, uid) === 0) return;
  await updateDoc(doc(db, 'conversations', convo.id), { [`unread.${uid}`]: 0 });
}
