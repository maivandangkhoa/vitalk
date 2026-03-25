import { onCall, HttpsError } from "firebase-functions/v2/https";
import * as admin from "firebase-admin";

/**
 * Sets a user's role via custom claims.
 * Can only be called by existing admins or with ADMIN_SETUP_KEY for first-time setup.
 */
export const setUserRole = onCall({ secrets: ["ADMIN_SETUP_KEY"], cors: true, invoker: "public" }, async (request) => {
  const { uid, role, setupKey } = request.data as {
    uid: string;
    role: string;
    setupKey?: string;
  };

  if (!uid || !role) {
    throw new HttpsError("invalid-argument", "uid and role are required");
  }

  const validRoles = ["admin", "user"];
  if (!validRoles.includes(role)) {
    throw new HttpsError("invalid-argument", `Invalid role: ${role}`);
  }

  // Authorization: setup key OR existing admin
  if (setupKey) {
    const expectedKey = process.env.ADMIN_SETUP_KEY;
    if (!expectedKey || setupKey !== expectedKey) {
      throw new HttpsError("permission-denied", "Invalid setup key");
    }
  } else if (request.auth) {
    const callerClaims = request.auth.token;
    if (callerClaims.role !== "admin") {
      throw new HttpsError("permission-denied", "Only admins can set roles");
    }
  } else {
    throw new HttpsError("unauthenticated", "Must be authenticated or provide setup key");
  }

  // Update user doc in Firestore (use set+merge in case doc doesn't exist yet)
  await admin.firestore().doc(`users/${uid}`).set({
    role,
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  }, { merge: true });

  return { success: true, uid, role };
});
