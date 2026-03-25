import { onCall, HttpsError } from "firebase-functions/v2/https";
import * as admin from "firebase-admin";

const TOSS_API_BASE = "https://api.tosspayments.com/v1";
// Test: https://api.tosspayments.com/v1 (same URL, use test secret key)

/**
 * Confirms a Toss payment after redirect from Toss widget.
 * Client sends paymentKey, orderId, amount after Toss redirect.
 * Server verifies with Toss API and updates booking.
 */
export const confirmTossPayment = onCall(
  { secrets: ["TOSS_SECRET_KEY"] },
  async (request) => {
    if (!request.auth) {
      throw new HttpsError("unauthenticated", "Must be logged in");
    }

    const { paymentKey, orderId, amount, bookingId } = request.data as {
      paymentKey: string;
      orderId: string;
      amount: number;
      bookingId: string;
    };

    if (!paymentKey || !orderId || !amount || !bookingId) {
      throw new HttpsError(
        "invalid-argument",
        "paymentKey, orderId, amount, and bookingId are required"
      );
    }

    // Verify booking exists and belongs to user
    const bookingSnap = await admin.firestore().doc(`bookings/${bookingId}`).get();
    if (!bookingSnap.exists) {
      throw new HttpsError("not-found", "Booking not found");
    }

    const booking = bookingSnap.data()!;
    if (booking.studentId !== request.auth.uid) {
      throw new HttpsError("permission-denied", "Not your booking");
    }

    if (booking.paymentStatus === "confirmed") {
      throw new HttpsError("already-exists", "Already paid");
    }

    const secretKey = process.env.TOSS_SECRET_KEY;
    if (!secretKey) {
      throw new HttpsError("failed-precondition", "Toss secret key not configured");
    }

    // Confirm payment with Toss API
    const auth = Buffer.from(`${secretKey}:`).toString("base64");
    const response = await fetch(`${TOSS_API_BASE}/payments/confirm`, {
      method: "POST",
      headers: {
        "Authorization": `Basic ${auth}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ paymentKey, orderId, amount }),
    });

    const result = await response.json() as {
      status: string;
      code?: string;
      message?: string;
    };

    if (response.ok && result.status === "DONE") {
      await admin.firestore().doc(`bookings/${bookingId}`).update({
        paymentStatus: "confirmed",
        status: "confirmed",
        paymentReference: paymentKey,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });

      return { success: true };
    } else {
      await admin.firestore().doc(`bookings/${bookingId}`).update({
        paymentStatus: "failed",
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });

      throw new HttpsError(
        "internal",
        `Toss payment failed: ${result.message || "Unknown error"}`
      );
    }
  }
);
