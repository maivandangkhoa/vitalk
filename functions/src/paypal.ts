import { onCall, HttpsError } from "firebase-functions/v2/https";
import * as admin from "firebase-admin";

const PAYPAL_API_BASE = "https://api-m.paypal.com"; // Change to sandbox for testing
// const PAYPAL_API_BASE = "https://api-m.sandbox.paypal.com";

async function getPaypalAccessToken(): Promise<string> {
  const clientId = process.env.PAYPAL_CLIENT_ID;
  const clientSecret = process.env.PAYPAL_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    throw new HttpsError("failed-precondition", "PayPal credentials not configured");
  }

  const auth = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");
  const response = await fetch(`${PAYPAL_API_BASE}/v1/oauth2/token`, {
    method: "POST",
    headers: {
      "Authorization": `Basic ${auth}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: "grant_type=client_credentials",
  });

  const data = await response.json() as { access_token: string };
  return data.access_token;
}

/**
 * Creates a PayPal order server-side to prevent price manipulation.
 * Called from client before showing PayPal button.
 */
export const createPaypalOrder = onCall(
  { secrets: ["PAYPAL_CLIENT_ID", "PAYPAL_CLIENT_SECRET"] },
  async (request) => {
    if (!request.auth) {
      throw new HttpsError("unauthenticated", "Must be logged in");
    }

    const { bookingId } = request.data as { bookingId: string };
    if (!bookingId) {
      throw new HttpsError("invalid-argument", "bookingId is required");
    }

    // Fetch booking to get the real amount
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

    const accessToken = await getPaypalAccessToken();

    const response = await fetch(`${PAYPAL_API_BASE}/v2/checkout/orders`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        intent: "CAPTURE",
        purchase_units: [
          {
            reference_id: bookingId,
            amount: {
              currency_code: booking.currency || "USD",
              value: String(booking.amount),
            },
            description: `ViTalk Lesson - ${booking.date} ${booking.startTime}`,
          },
        ],
      }),
    });

    const order = await response.json() as { id: string; status: string };

    // Save PayPal order ID to booking
    await admin.firestore().doc(`bookings/${bookingId}`).update({
      paymentReference: order.id,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    return { orderId: order.id };
  }
);

/**
 * Captures a PayPal order after student approves payment.
 * Updates booking payment status on success.
 */
export const capturePaypalOrder = onCall(
  { secrets: ["PAYPAL_CLIENT_ID", "PAYPAL_CLIENT_SECRET"] },
  async (request) => {
    if (!request.auth) {
      throw new HttpsError("unauthenticated", "Must be logged in");
    }

    const { orderId, bookingId } = request.data as {
      orderId: string;
      bookingId: string;
    };

    if (!orderId || !bookingId) {
      throw new HttpsError("invalid-argument", "orderId and bookingId are required");
    }

    const accessToken = await getPaypalAccessToken();

    const response = await fetch(
      `${PAYPAL_API_BASE}/v2/checkout/orders/${orderId}/capture`,
      {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
      }
    );

    const capture = await response.json() as { status: string };

    if (capture.status === "COMPLETED") {
      await admin.firestore().doc(`bookings/${bookingId}`).update({
        paymentStatus: "confirmed",
        status: "confirmed",
        paymentReference: orderId,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });

      return { success: true };
    } else {
      await admin.firestore().doc(`bookings/${bookingId}`).update({
        paymentStatus: "failed",
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });

      throw new HttpsError("internal", "Payment capture failed");
    }
  }
);
