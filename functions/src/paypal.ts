import { onCall, HttpsError } from "firebase-functions/v2/https";
import * as admin from "firebase-admin";

const PAYPAL_API_BASE = "https://api-m.paypal.com";

async function getPaypalAccessToken(): Promise<string> {
  const clientId = process.env.PAYPAL_CLIENT_ID;
  const clientSecret = process.env.PAYPAL_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    console.error("PayPal credentials missing:", { hasClientId: !!clientId, hasSecret: !!clientSecret });
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

  if (!response.ok) {
    const errorText = await response.text();
    console.error("PayPal token error:", response.status, errorText);
    throw new HttpsError("internal", `PayPal auth failed: ${response.status}`);
  }

  const data = await response.json() as { access_token: string };
  if (!data.access_token) {
    console.error("PayPal token response missing access_token:", data);
    throw new HttpsError("internal", "PayPal auth returned no token");
  }
  return data.access_token;
}

/**
 * Creates a PayPal order server-side to prevent price manipulation.
 * Called from client before showing PayPal button.
 */
export const createPaypalOrder = onCall(
  { cors: true, invoker: "public" },
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

    let accessToken: string;
    try {
      accessToken = await getPaypalAccessToken();
    } catch (err) {
      console.error("Failed to get PayPal access token:", err);
      if (err instanceof HttpsError) throw err;
      throw new HttpsError("internal", "PayPal authentication failed");
    }

    const orderPayload = {
      intent: "CAPTURE",
      purchase_units: [
        {
          reference_id: bookingId,
          amount: {
            currency_code: booking.currency || "USD",
            value: String(booking.amount),
          },
          description: `HaviTalk Lesson - ${booking.date} ${booking.startTime}`,
        },
      ],
    };

    console.log("Creating PayPal order:", JSON.stringify(orderPayload));

    const response = await fetch(`${PAYPAL_API_BASE}/v2/checkout/orders`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(orderPayload),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("PayPal create order error:", response.status, errorText);
      throw new HttpsError("internal", `PayPal order creation failed: ${response.status}`);
    }

    const order = await response.json() as { id: string; status: string };
    console.log("PayPal order created:", order.id, order.status);

    if (!order.id) {
      console.error("PayPal order response missing id:", order);
      throw new HttpsError("internal", "PayPal returned no order ID");
    }

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
  { cors: true, invoker: "public" },
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
