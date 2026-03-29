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
exports.sendEmail = sendEmail;
exports.sendToTeacher = sendToTeacher;
exports.sendToStudent = sendToStudent;
const nodemailer = __importStar(require("nodemailer"));
const googleapis_1 = require("googleapis");
const OAuth2 = googleapis_1.google.auth.OAuth2;
let transporter = null;
async function getTransporter() {
    if (transporter)
        return transporter;
    const clientId = process.env.GMAIL_CLIENT_ID;
    const clientSecret = process.env.GMAIL_CLIENT_SECRET;
    const refreshToken = process.env.GMAIL_REFRESH_TOKEN;
    const senderEmail = process.env.TEACHER_EMAIL;
    if (!clientId || !clientSecret || !refreshToken || !senderEmail) {
        throw new Error("Gmail OAuth2 credentials not configured");
    }
    const oauth2Client = new OAuth2(clientId, clientSecret, "https://developers.google.com/oauthplayground");
    oauth2Client.setCredentials({ refresh_token: refreshToken });
    const { token } = await oauth2Client.getAccessToken();
    transporter = nodemailer.createTransport({
        service: "gmail",
        auth: {
            type: "OAuth2",
            user: senderEmail,
            clientId,
            clientSecret,
            refreshToken,
            accessToken: token || undefined,
        },
    });
    return transporter;
}
async function sendEmail(params) {
    const mailer = await getTransporter();
    const senderEmail = process.env.TEACHER_EMAIL;
    await mailer.sendMail({
        from: `haviTalk <${senderEmail}>`,
        to: params.to,
        subject: params.subject,
        html: params.html,
    });
}
async function sendToTeacher(params) {
    await sendEmail({
        to: params.to,
        subject: params.subject,
        html: params.html,
    });
}
async function sendToStudent(params) {
    await sendEmail(params);
}
//# sourceMappingURL=email.js.map