import {
  addDoc,
  collection,
  doc,
  onSnapshot,
  query,
  runTransaction,
  serverTimestamp,
  updateDoc,
  where,
  type Unsubscribe,
} from 'firebase/firestore';
import { db } from './firebase';
import { PRESENCE_STALE_MS } from '@/types/call';
import type {
  Call,
  CallCandidate,
  CallStatus,
  ConnectionRoute,
  SessionDescriptionPayload,
} from '@/types/call';
import type { Booking } from '@/types';

export type CallRole = 'teacher' | 'student';

const callRef = (callId: string) => doc(db, 'calls', callId);
const candidatesRef = (callId: string) => collection(db, 'calls', callId, 'candidates');

export function roleOf(booking: Booking, uid: string): CallRole | null {
  if (booking.teacherId === uid) return 'teacher';
  if (booking.studentId === uid) return 'student';
  return null;
}

/** The field holding *this* role's lobby presence. */
export function readyFieldFor(role: CallRole) {
  return role === 'teacher' ? ('teacherReadyAt' as const) : ('studentReadyAt' as const);
}

/**
 * Is the other side actually sitting in the lobby right now?
 *
 * Firestore has no `onDisconnect`, so a closed tab leaves its presence behind.
 * The heartbeat's age is the only trustworthy answer — a flag alone would ring
 * the teacher's phone for a student who left twenty minutes ago.
 */
export function isPresent(readyAt: Call['teacherReadyAt']): boolean {
  if (!readyAt) return false;
  return Date.now() - readyAt.toMillis() < PRESENCE_STALE_MS;
}

/**
 * Opens the room for a booking, or returns the existing one untouched.
 *
 * Transactional because both peers call it on arrival: a plain
 * read-then-write would let the second arrival blank out an offer the first
 * had already published.
 */
export async function ensureCallRoom(booking: Booking): Promise<void> {
  await runTransaction(db, async (tx) => {
    const ref = callRef(booking.id);
    const snap = await tx.get(ref);
    if (snap.exists()) return;

    tx.set(ref, {
      bookingId: booking.id,
      participants: [booking.teacherId, booking.studentId],
      teacherId: booking.teacherId,
      studentId: booking.studentId,
      status: 'idle' satisfies CallStatus,
      session: 0,
      offer: null,
      answer: null,
      teacherReadyAt: null,
      studentReadyAt: null,
      startedAt: null,
      endedAt: null,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  });
}

/** Claim (or release) a seat in the lobby. Also the heartbeat. */
export async function setPresence(
  callId: string,
  role: CallRole,
  present: boolean
): Promise<void> {
  await updateDoc(callRef(callId), {
    [readyFieldFor(role)]: present ? serverTimestamp() : null,
    updatedAt: serverTimestamp(),
  });
}

export async function setCallStatus(callId: string, status: CallStatus): Promise<void> {
  await updateDoc(callRef(callId), { status, updatedAt: serverTimestamp() });
}

/**
 * Publishes the teacher's offer and opens a new generation.
 *
 * Bumping `session` is what makes re-dialling safe: candidates from the
 * abandoned attempt keep their old number and are ignored from here on, so a
 * stale candidate can never be fed into the connection that replaced it.
 */
export async function publishOffer(
  callId: string,
  session: number,
  offer: SessionDescriptionPayload
): Promise<void> {
  await updateDoc(callRef(callId), {
    offer,
    answer: null,
    session,
    status: 'connecting' satisfies CallStatus,
    updatedAt: serverTimestamp(),
  });
}

/**
 * The DTLS fingerprint out of an SDP — the identity of the peer's
 * `RTCPeerConnection`.
 *
 * It is generated with the connection's certificate, so it survives an ICE
 * restart and changes the moment the other side builds a new connection. That
 * distinction matters: a restart must be adopted onto the live connection, but
 * a description carrying a *different* fingerprint cannot be — DTLS is already
 * established with the old one, and pointing the new description at it produces
 * a handshake that never completes and a call that sits on "connecting".
 */
export function dtlsFingerprint(sdp: string | undefined | null): string | null {
  if (!sdp) return null;
  const match = sdp.match(/^a=fingerprint:\s*\S+\s+(\S+)/m);
  return match ? match[1] : null;
}

export async function publishAnswer(
  callId: string,
  answer: SessionDescriptionPayload
): Promise<void> {
  await updateDoc(callRef(callId), {
    answer,
    status: 'connecting' satisfies CallStatus,
    updatedAt: serverTimestamp(),
  });
}

/**
 * Records how the media got through, once per call.
 *
 * Both peers observe the same answer and both write it, which is fine: the
 * value is identical, so the second write is a no-op in everything but cost.
 */
export async function recordRoute(callId: string, route: ConnectionRoute): Promise<void> {
  if (route === 'unknown') return;
  await updateDoc(callRef(callId), { route, updatedAt: serverTimestamp() });
}

export async function markCallActive(callId: string): Promise<void> {
  await updateDoc(callRef(callId), {
    status: 'active' satisfies CallStatus,
    startedAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
}

/** Hang up, and drop the SDP so the next attempt starts from a clean slate. */
export async function endCallRoom(
  callId: string,
  role: CallRole,
  status: Extract<CallStatus, 'ended' | 'rejected'> = 'ended'
): Promise<void> {
  await updateDoc(callRef(callId), {
    status,
    offer: null,
    answer: null,
    [readyFieldFor(role)]: null,
    endedAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
}

export async function addCandidate(
  callId: string,
  from: string,
  session: number,
  candidate: RTCIceCandidateInit
): Promise<void> {
  await addDoc(candidatesRef(callId), {
    from,
    session,
    candidate,
    createdAt: serverTimestamp(),
  });
}

export function watchCall(
  callId: string,
  onCall: (call: Call | null) => void,
  onError?: (err: Error) => void
): Unsubscribe {
  return onSnapshot(
    callRef(callId),
    (snap) => onCall(snap.exists() ? ({ id: snap.id, ...snap.data() } as Call) : null),
    (err) => onError?.(err)
  );
}

/**
 * The other peer's candidates for one generation. Filtering `from` in the
 * client rather than the query keeps this to a single-field index.
 */
export function watchRemoteCandidates(
  callId: string,
  session: number,
  myUid: string,
  onCandidate: (candidate: RTCIceCandidateInit) => void,
  onError?: (err: Error) => void
): Unsubscribe {
  const q = query(candidatesRef(callId), where('session', '==', session));
  return onSnapshot(
    q,
    (snap) => {
      snap.docChanges().forEach((change) => {
        if (change.type !== 'added') return;
        const data = change.doc.data() as Omit<CallCandidate, 'id'>;
        if (data.from === myUid) return;
        onCandidate(data.candidate);
      });
    },
    (err) => onError?.(err)
  );
}

/**
 * How the media actually got through — direct, via a reflexive address, or
 * relayed through TURN.
 *
 * Both ends of the chosen pair count, not just ours. A relay sits between two
 * peers, so one side can reach it from a plain reflexive address while the
 * other's own candidate *is* the relay — and reading only the local one had the
 * teacher showing amber while the student showed green for the very same media.
 * The route is a property of the path, so it is the more expensive of the two.
 *
 * Worth the thirty lines: the share of calls that end up on `relay` is the
 * number that decides whether relay bandwidth ever costs anything, and it is
 * pure guesswork until it is measured on real users' networks.
 */
export async function getConnectionRoute(pc: RTCPeerConnection): Promise<ConnectionRoute> {
  try {
    const stats = await pc.getStats();
    const candidates = new Map<string, { candidateType?: string }>();
    const pairs = new Map<
      string,
      { localCandidateId?: string; remoteCandidateId?: string }
    >();
    let selectedPairId: string | null = null;
    let nominatedPairId: string | null = null;
    let succeededPairId: string | null = null;

    stats.forEach((report) => {
      if (report.type === 'transport' && report.selectedCandidatePairId) {
        // The transport names its own pair, which is the answer browsers agree
        // on. `nominated` alone is set a beat later, and reading it too early
        // is what left one side of a relayed call reporting nothing at all.
        selectedPairId = report.selectedCandidatePairId as string;
      }
      if (report.type === 'candidate-pair') {
        pairs.set(
          report.id,
          report as { localCandidateId?: string; remoteCandidateId?: string }
        );
        if (report.state === 'succeeded') {
          succeededPairId ??= report.id;
          if (report.nominated) nominatedPairId = report.id;
        }
      }
      if (report.type === 'local-candidate' || report.type === 'remote-candidate') {
        candidates.set(report.id, report as { candidateType?: string });
      }
    });

    const pairId = selectedPairId ?? nominatedPairId ?? succeededPairId;
    const pair = pairId ? pairs.get(pairId) : undefined;
    if (!pair) return 'unknown';

    const ends = [pair.localCandidateId, pair.remoteCandidateId]
      .map((id) => (id ? candidates.get(id)?.candidateType : undefined))
      .filter((type): type is ConnectionRoute =>
        type === 'relay' || type === 'srflx' || type === 'host'
      );
    if (!ends.length) return 'unknown';
    // Whichever end travels furthest describes the path: one relay leg makes the
    // whole call relayed, whatever the other end is.
    if (ends.includes('relay')) return 'relay';
    if (ends.includes('srflx')) return 'srflx';
    return 'host';
  } catch {
    return 'unknown';
  }
}
