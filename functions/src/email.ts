import { Resend } from "resend";

let resendClient: Resend | null = null;

function getResend(): Resend {
  if (!resendClient) {
    const apiKey = process.env.RESEND_API_KEY;
    if (!apiKey) {
      throw new Error("RESEND_API_KEY not configured");
    }
    resendClient = new Resend(apiKey);
  }
  return resendClient;
}

const FROM_EMAIL = "ViTalk <noreply@vietalky.web.app>";
const TEACHER_EMAIL = process.env.TEACHER_EMAIL || "teacher@vietalky.web.app";

export async function sendEmail(params: {
  to: string;
  subject: string;
  html: string;
}): Promise<void> {
  const resend = getResend();
  await resend.emails.send({
    from: FROM_EMAIL,
    to: params.to,
    subject: params.subject,
    html: params.html,
  });
}

export async function sendToTeacher(params: {
  subject: string;
  html: string;
}): Promise<void> {
  await sendEmail({
    to: TEACHER_EMAIL,
    subject: params.subject,
    html: params.html,
  });
}

export async function sendToStudent(params: {
  to: string;
  subject: string;
  html: string;
}): Promise<void> {
  await sendEmail(params);
}
