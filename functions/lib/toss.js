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
exports.confirmTossPayment = void 0;
const https_1 = require("firebase-functions/v2/https");
const admin = __importStar(require("firebase-admin"));
const TOSS_API_BASE = "https://api.tosspayments.com/v1";
// Test: https://api.tosspayments.com/v1 (same URL, use test secret key)
/**
 * Confirms a Toss payment after redirect from Toss widget.
 * Client sends paymentKey, orderId, amount after Toss redirect.
 * Server verifies with Toss API and updates booking.
 */
exports.confirmTossPayment = (0, https_1.onCall)({ secrets: ["TOSS_SECRET_KEY"], cors: true, invoker: "public" }, async (request) => {
    if (!request.auth) {
        throw new https_1.HttpsError("unauthenticated", "Must be logged in");
    }
    const { paymentKey, orderId, amount, bookingId } = request.data;
    if (!paymentKey || !orderId || !amount || !bookingId) {
        throw new https_1.HttpsError("invalid-argument", "paymentKey, orderId, amount, and bookingId are required");
    }
    // Verify booking exists and belongs to user
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
    const secretKey = process.env.TOSS_SECRET_KEY;
    if (!secretKey) {
        throw new https_1.HttpsError("failed-precondition", "Toss secret key not configured");
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
    const result = await response.json();
    if (response.ok && result.status === "DONE") {
        await admin.firestore().doc(`bookings/${bookingId}`).update({
            paymentStatus: "confirmed",
            status: "confirmed",
            paymentReference: paymentKey,
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        });
        return { success: true };
    }
    else {
        await admin.firestore().doc(`bookings/${bookingId}`).update({
            paymentStatus: "failed",
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        });
        throw new https_1.HttpsError("internal", `Toss payment failed: ${result.message || "Unknown error"}`);
    }
});
//# sourceMappingURL=toss.js.map