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
exports.setUserRole = void 0;
const https_1 = require("firebase-functions/v2/https");
const admin = __importStar(require("firebase-admin"));
/**
 * Sets a user's role via custom claims.
 * Can only be called by existing admins or with ADMIN_SETUP_KEY for first-time setup.
 */
exports.setUserRole = (0, https_1.onCall)(async (request) => {
    const { uid, role, setupKey } = request.data;
    if (!uid || !role) {
        throw new https_1.HttpsError("invalid-argument", "uid and role are required");
    }
    const validRoles = ["admin", "user"];
    if (!validRoles.includes(role)) {
        throw new https_1.HttpsError("invalid-argument", `Invalid role: ${role}`);
    }
    // Authorization: either admin or setup key
    if (request.auth) {
        const callerClaims = request.auth.token;
        if (callerClaims.role !== "admin") {
            throw new https_1.HttpsError("permission-denied", "Only admins can set roles");
        }
    }
    else if (setupKey) {
        const expectedKey = process.env.ADMIN_SETUP_KEY;
        if (!expectedKey || setupKey !== expectedKey) {
            throw new https_1.HttpsError("permission-denied", "Invalid setup key");
        }
    }
    else {
        throw new https_1.HttpsError("unauthenticated", "Must be authenticated or provide setup key");
    }
    await admin.auth().setCustomUserClaims(uid, { role });
    // Also update user doc
    await admin.firestore().doc(`users/${uid}`).update({
        role,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });
    return { success: true, uid, role };
});
//# sourceMappingURL=auth.js.map