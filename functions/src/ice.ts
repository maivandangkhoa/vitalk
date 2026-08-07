import { onCall, HttpsError } from "firebase-functions/v2/https";
import { logger } from "firebase-functions/v2";
import * as admin from "firebase-admin";
import * as crypto from "crypto";

/** How long a minted TURN credential stays valid. Longer than any lesson, so a
 *  call never dies mid-sentence because the credential aged out. */
const CREDENTIAL_TTL_SECONDS = 4 * 60 * 60;

const STUN_FALLBACK = [
  { urls: "stun:stun.l.google.com:19302" },
  { urls: "stun:stun1.l.google.com:19302" },
];

/**
 * Time-limited TURN credentials, coturn's `use-auth-secret` scheme:
 *
 *   username   = "<unix expiry>:<uid>"
 *   credential = base64( HMAC-SHA1( shared secret, username ) )
 *
 * The secret never leaves the server. A static username/password baked into
 * the bundle would be a public TURN relay within a week — anyone can read a
 * frontend build, and relay bandwidth is the one thing here that costs money.
 */
function mintTurnCredential(secret: string, uid: string, ttlSeconds: number) {
  const expiry = Math.floor(Date.now() / 1000) + ttlSeconds;
  const username = `${expiry}:${uid}`;
  const credential = crypto
    .createHmac("sha1", secret)
    .update(username)
    .digest("base64");
  return { username, credential, expiresAt: expiry * 1000 };
}

/**
 * Returns the ICE servers for one lesson's call.
 *
 * Behind this callable sits either a hosted TURN provider or our own coturn VM
 * — the client cannot tell, which is the point: switching between them is two
 * secret values, not a frontend release.
 *
 * Secrets:
 *   TURN_URLS   comma-separated, e.g.
 *               "turn:turn.havitalk.com:3478?transport=udp,turns:turn.havitalk.com:443?transport=tcp"
 *   TURN_SECRET the coturn `static-auth-secret`
 *
 * With neither set, callers get STUN only. That is a usable development setup
 * and a degraded production one: the ~20-30% of pairs behind symmetric NAT or
 * a UDP-blocking firewall simply will not connect.
 */
export const getIceServers = onCall(
  { secrets: ["TURN_URLS", "TURN_SECRET"], cors: true, invoker: "public" },
  async (request) => {
    if (!request.auth) {
      throw new HttpsError("unauthenticated", "Must be logged in");
    }

    const { bookingId } = (request.data ?? {}) as { bookingId?: string };
    if (!bookingId) {
      throw new HttpsError("invalid-argument", "bookingId is required");
    }

    // Credentials are scoped to a real lesson the caller belongs to, so a
    // signed-in stranger cannot mint relay capacity for themselves.
    const snap = await admin.firestore().doc(`bookings/${bookingId}`).get();
    if (!snap.exists) {
      throw new HttpsError("not-found", "Booking not found");
    }
    const booking = snap.data()!;
    const uid = request.auth.uid;
    if (booking.teacherId !== uid && booking.studentId !== uid) {
      throw new HttpsError("permission-denied", "Not a participant of this lesson");
    }
    if (booking.status !== "confirmed" && booking.status !== "completed") {
      throw new HttpsError("failed-precondition", "Lesson is not confirmed");
    }

    const urls = (process.env.TURN_URLS || "")
      .split(",")
      .map((u) => u.trim())
      .filter(Boolean);
    const secret = process.env.TURN_SECRET || "";

    if (urls.length === 0 || !secret) {
      logger.warn("getIceServers: TURN not configured, returning STUN only");
      return {
        iceServers: STUN_FALLBACK,
        expiresAt: Date.now() + CREDENTIAL_TTL_SECONDS * 1000,
      };
    }

    const { username, credential, expiresAt } = mintTurnCredential(
      secret,
      uid,
      CREDENTIAL_TTL_SECONDS
    );

    return {
      iceServers: [...STUN_FALLBACK, { urls, username, credential }],
      expiresAt,
    };
  }
);
