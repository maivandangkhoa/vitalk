import type { Timestamp } from 'firebase/firestore';

/**
 * Lifecycle of a lesson's video call, mirrored between the two peers through
 * `calls/{bookingId}`.
 *
 * - `idle`       nobody is waiting; the room exists but is quiet
 * - `ringing`    both sides are in the lobby, the teacher is being asked to start
 * - `connecting` an offer is on the wire, ICE is still negotiating
 * - `active`     media is flowing
 * - `ended`      somebody hung up
 * - `rejected`   the teacher declined, or the ring timed out
 */
export type CallStatus =
  | 'idle'
  | 'ringing'
  | 'connecting'
  | 'active'
  | 'ended'
  | 'rejected';

/** An SDP, flattened so it survives a Firestore round-trip. */
export interface SessionDescriptionPayload {
  type: 'offer' | 'answer';
  sdp: string;
}

/**
 * Lives at `calls/{bookingId}`. One booking is one room: the id is derived, the
 * same way a conversation id is its pair — so two people can never end up in
 * two different rooms for the same lesson, and the rules authorize straight off
 * the booking without a second reference that could disagree.
 *
 * Signaling rides on this document instead of a WebSocket because HaviTalk has
 * no long-lived server to hold one. Firestore's realtime listener does the same
 * job and already knows who the caller is.
 */
export interface CallDoc {
  bookingId: string;
  /** `[teacherId, studentId]`, in that order. */
  participants: [string, string];
  teacherId: string;
  studentId: string;
  status: CallStatus;

  /**
   * Bumped every time the teacher (re-)offers. ICE candidates carry the
   * generation they belong to, so a candidate left over from an abandoned
   * attempt can never be fed into the connection that replaced it.
   */
  session: number;

  /** The teacher always offers and the student always answers — see
   *  `docs`/plan: fixing the roles is what makes glare impossible without
   *  perfect-negotiation machinery. */
  offer: SessionDescriptionPayload | null;
  answer: SessionDescriptionPayload | null;

  /**
   * Lobby presence. Refreshed on a heartbeat while a peer waits, so a tab that
   * was closed without cleaning up stops looking present after
   * `PRESENCE_STALE_MS`. Firestore has no `onDisconnect`, so the timestamp is
   * the only honest signal here.
   */
  teacherReadyAt: Timestamp | null;
  studentReadyAt: Timestamp | null;

  /**
   * How the media actually got through, recorded once the connection is up.
   * Kept so the share of lessons that needed TURN is a measured number rather
   * than an industry rule of thumb.
   */
  route?: ConnectionRoute;

  startedAt: Timestamp | null;
  endedAt: Timestamp | null;
  createdAt: Timestamp | null;
  updatedAt: Timestamp | null;
}

export interface Call extends CallDoc {
  id: string;
}

/** One end's ICE candidate, tagged with the generation that produced it. */
export interface CallCandidate {
  id: string;
  from: string;
  session: number;
  candidate: RTCIceCandidateInit;
  createdAt: Timestamp | null;
}

/**
 * Which fields a peer may touch on an existing call document. Mirrored in
 * firestore.rules — keep the two in step.
 */
export const CALL_MUTABLE_FIELDS = [
  'status',
  'session',
  'offer',
  'answer',
  'teacherReadyAt',
  'studentReadyAt',
  'route',
  'startedAt',
  'endedAt',
  'updatedAt',
] as const;

/** How often a waiting peer refreshes its `*ReadyAt`. */
export const PRESENCE_HEARTBEAT_MS = 20_000;

/** A `*ReadyAt` older than this means that tab is gone. */
export const PRESENCE_STALE_MS = 60_000;

/**
 * How long to let a `disconnected` ICE state heal on its own before spending a
 * renegotiation on it. Most brief drops recover inside this window.
 */
export const ICE_RECOVERY_GRACE_MS = 4_000;

/** How long the teacher's incoming-call prompt rings before auto-declining. */
export const RING_TIMEOUT_MS = 30_000;

/** The room opens this long before the lesson starts. */
export const JOIN_WINDOW_BEFORE_MS = 10 * 60_000;

/** …and stays open this long after it was due to end. */
export const JOIN_WINDOW_AFTER_MS = 15 * 60_000;

/**
 * Which kind of ICE candidate pair carried the call. Recorded once per call so
 * the share of connections that actually needed TURN stops being a guess —
 * that number is what decides whether relay bandwidth ever costs anything.
 */
export type ConnectionRoute = 'host' | 'srflx' | 'relay' | 'unknown';

export interface IceServersResponse {
  iceServers: RTCIceServer[];
  /** Unix ms at which the TURN credentials stop working. */
  expiresAt: number;
}
