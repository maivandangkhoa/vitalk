import { onCall, HttpsError } from "firebase-functions/v2/https";
import * as admin from "firebase-admin";

/**
 * Sets a user's role via custom claims.
 * Can only be called by existing admins or with ADMIN_SETUP_KEY for first-time setup.
 */
export const setUserRole = onCall(async (request) => {
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

  // Authorization: either admin or setup key
  if (request.auth) {
    const callerClaims = request.auth.token;
    if (callerClaims.role !== "admin") {
      throw new HttpsError("permission-denied", "Only admins can set roles");
    }
  } else if (setupKey) {
    const expectedKey = process.env.ADMIN_SETUP_KEY;
    if (!expectedKey || setupKey !== expectedKey) {
      throw new HttpsError("permission-denied", "Invalid setup key");
    }
  } else {
    throw new HttpsError("unauthenticated", "Must be authenticated or provide setup key");
  }

  await admin.auth().setCustomUserClaims(uid, { role });

  // Also update user doc
  await admin.firestore().doc(`users/${uid}`).update({
    role,
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  });

  return { success: true, uid, role };
});
