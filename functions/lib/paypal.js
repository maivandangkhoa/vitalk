"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.capturePaypalOrder = exports.createPaypalOrder = void 0;
const https_1 = require("firebase-functions/v2/https");
const admin = __importStar(require("firebase-admin"));
// const PAYPAL_API_BASE = "https://api-m.paypal.com"; // Production
const PAYPAL_API_BASE = "https://api-m.sandbox.paypal.com"; // Sandbox for testing
async function getPaypalAccessToken() {
    const clientId = process.env.PAYPAL_CLIENT_ID;
    const clientSecret = process.env.PAYPAL_CLIENT_SECRET;
    if (!clientId || !clientSecret) {
        throw new https_1.HttpsError("failed-precondition", "PayPal credentials not configured");
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
    const data = await response.json();
    return data.access_token;
}
/**
 * Creates a PayPal order server-side to prevent price manipulation.
 * Called from client before showing PayPal button.
 */
exports.createPaypalOrder = (0, https_1.onCall)({ secrets: ["PAYPAL_CLIENT_ID", "PAYPAL_CLIENT_SECRET"], cors: true, invoker: "public" }, async (request) => {
    if (!request.auth) {
        throw new https_1.HttpsError("unauthenticated", "Must be logged in");
    }
    const { bookingId } = request.data;
    if (!bookingId) {
        throw new https_1.HttpsError("invalid-argument", "bookingId is required");
    }
    // Fetch booking to get the real amount
    const bookingSnap = await admin.firestore().doc(`bookings/${bookingId}`).get();
    if (!bookingSnap.exists) {
        throw new https_1.HttpsError("not-found", "Booking not found");
    }
    const booking = bookingSnap.data();
    if (booking.studentId !== request.auth.uid) {
        throw new https_1.HttpsError("permission-denied", "Not your booking");
    }
    if (booking.paymentStatus === "confirmed") {
        throw new https_1.HttpsError("already-exists", "Already paid");
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
    const order = await response.json();
    // Save PayPal order ID to booking
    await admin.firestore().doc(`bookings/${bookingId}`).update({
        paymentReference: order.id,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });
    return { orderId: order.id };
});
/**
 * Captures a PayPal order after student approves payment.
 * Updates booking payment status on success.
 */
exports.capturePaypalOrder = (0, https_1.onCall)({ secrets: ["PAYPAL_CLIENT_ID", "PAYPAL_CLIENT_SECRET"], cors: true, invoker: "public" }, async (request) => {
    if (!request.auth) {
        throw new https_1.HttpsError("unauthenticated", "Must be logged in");
    }
    const { orderId, bookingId } = request.data;
    if (!orderId || !bookingId) {
        throw new https_1.HttpsError("invalid-argument", "orderId and bookingId are required");
    }
    const accessToken = await getPaypalAccessToken();
    const response = await fetch(`${PAYPAL_API_BASE}/v2/checkout/orders/${orderId}/capture`, {
        method: "POST",
        headers: {
            "Authorization": `Bearer ${accessToken}`,
            "Content-Type": "application/json",
        },
    });
    const capture = await response.json();
    if (capture.status === "COMPLETED") {
        await admin.firestore().doc(`bookings/${bookingId}`).update({
            paymentStatus: "confirmed",
            status: "confirmed",
            paymentReference: orderId,
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        });
        return { success: true };
    }
    else {
        await admin.firestore().doc(`bookings/${bookingId}`).update({
            paymentStatus: "failed",
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        });
        throw new https_1.HttpsError("internal", "Payment capture failed");
    }
});
//# sourceMappingURL=paypal.js.map