import * as nodemailer from "nodemailer";
import { google } from "googleapis";

const OAuth2 = google.auth.OAuth2;

let transporter: nodemailer.Transporter | null = null;

async function getTransporter(): Promise<nodemailer.Transporter> {
  if (transporter) return transporter;

  const clientId = process.env.GMAIL_CLIENT_ID;
  const clientSecret = process.env.GMAIL_CLIENT_SECRET;
  const refreshToken = process.env.GMAIL_REFRESH_TOKEN;
  const senderEmail = process.env.TEACHER_EMAIL;

  if (!clientId || !clientSecret || !refreshToken || !senderEmail) {
    throw new Error("Gmail OAuth2 credentials not configured");
  }

  const oauth2Client = new OAuth2(
    clientId,
    clientSecret,
    "https://developers.google.com/oauthplayground"
  );

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

export async function sendEmail(params: {
  to: string;
  subject: string;
  html: string;
}): Promise<void> {
  const mailer = await getTransporter();
  const senderEmail = process.env.TEACHER_EMAIL;
  await mailer.sendMail({
    from: `HaviTalk <${senderEmail}>`,
    to: params.to,
    subject: params.subject,
    html: params.html,
  });
}

export async function sendToTeacher(params: {
  to: string;
  subject: string;
  html: string;
}): Promise<void> {
  await sendEmail({
    to: params.to,
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
