"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.sendEmail = sendEmail;
exports.sendToTeacher = sendToTeacher;
exports.sendToStudent = sendToStudent;
const resend_1 = require("resend");
let resendClient = null;
function getResend() {
    if (!resendClient) {
        const apiKey = process.env.RESEND_API_KEY;
        if (!apiKey) {
            throw new Error("RESEND_API_KEY not configured");
        }
        resendClient = new resend_1.Resend(apiKey);
    }
    return resendClient;
}
const FROM_EMAIL = "ViTalk <noreply@vietalky.web.app>";
const TEACHER_EMAIL = process.env.TEACHER_EMAIL || "teacher@vietalky.web.app";
async function sendEmail(params) {
    const resend = getResend();
    await resend.emails.send({
        from: FROM_EMAIL,
        to: params.to,
        subject: params.subject,
        html: params.html,
    });
}
async function sendToTeacher(params) {
    await sendEmail({
        to: TEACHER_EMAIL,
        subject: params.subject,
        html: params.html,
    });
}
async function sendToStudent(params) {
    await sendEmail(params);
}
//# sourceMappingURL=email.js.map