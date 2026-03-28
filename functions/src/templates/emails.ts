interface BookingEmailData {
  studentName: string;
  teacherName: string;
  lessonName: string;
  date: string;
  startTime: string;
  endTime: string;
  format: string;
  platform: string | null;
  amount: number;
  currency: string;
  paymentMethod: string;
  bookingId: string;
  notes?: string;
}

function baseLayout(content: string, teacherName?: string): string {
  const footerText = teacherName
    ? `ViTalk - Vietnamese Language Lessons with ${teacherName}`
    : "ViTalk - Vietnamese Language Lessons";
  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; margin: 0; padding: 0; background: #f5f5f5; }
    .container { max-width: 560px; margin: 0 auto; padding: 24px; }
    .card { background: #fff; border-radius: 12px; padding: 32px; box-shadow: 0 1px 3px rgba(0,0,0,0.1); }
    .header { text-align: center; margin-bottom: 24px; }
    .logo { font-size: 24px; font-weight: 700; color: #2563eb; }
    .detail-row { display: flex; justify-content: space-between; padding: 8px 0; border-bottom: 1px solid #f0f0f0; }
    .detail-label { color: #6b7280; font-size: 14px; }
    .detail-value { font-weight: 500; font-size: 14px; }
    .highlight { background: #eff6ff; border-radius: 8px; padding: 16px; margin: 16px 0; }
    .btn { display: inline-block; background: #2563eb; color: #fff; padding: 12px 24px; border-radius: 8px; text-decoration: none; font-weight: 600; }
    .footer { text-align: center; margin-top: 24px; color: #9ca3af; font-size: 12px; }
    .status-pending { color: #d97706; font-weight: 600; }
    .status-confirmed { color: #059669; font-weight: 600; }
    .status-cancelled { color: #dc2626; font-weight: 600; }
  </style>
</head>
<body>
  <div class="container">
    <div class="card">
      <div class="header"><span class="logo">ViTalk</span></div>
      ${content}
    </div>
    <div class="footer">
      <p>${footerText}</p>
      <p>Seoul, South Korea</p>
    </div>
  </div>
</body>
</html>`;
}

function bookingDetails(data: BookingEmailData): string {
  const formatDisplay = data.format === "online"
    ? `Online${data.platform ? ` (${data.platform.replace("_", " ")})` : ""}`
    : "In-person";
  const paymentDisplay = data.paymentMethod.replace("_", " ");

  return `
    <table style="width:100%; border-collapse:collapse; margin: 16px 0;">
      <tr><td style="padding:8px 0; border-bottom:1px solid #f0f0f0; color:#6b7280; font-size:14px;">Student</td><td style="padding:8px 0; border-bottom:1px solid #f0f0f0; text-align:right; font-weight:500; font-size:14px;">${data.studentName}</td></tr>
      <tr><td style="padding:8px 0; border-bottom:1px solid #f0f0f0; color:#6b7280; font-size:14px;">Lesson</td><td style="padding:8px 0; border-bottom:1px solid #f0f0f0; text-align:right; font-weight:500; font-size:14px;">${data.lessonName}</td></tr>
      <tr><td style="padding:8px 0; border-bottom:1px solid #f0f0f0; color:#6b7280; font-size:14px;">Date</td><td style="padding:8px 0; border-bottom:1px solid #f0f0f0; text-align:right; font-weight:500; font-size:14px;">${data.date}</td></tr>
      <tr><td style="padding:8px 0; border-bottom:1px solid #f0f0f0; color:#6b7280; font-size:14px;">Time</td><td style="padding:8px 0; border-bottom:1px solid #f0f0f0; text-align:right; font-weight:500; font-size:14px;">${data.startTime} - ${data.endTime} KST</td></tr>
      <tr><td style="padding:8px 0; border-bottom:1px solid #f0f0f0; color:#6b7280; font-size:14px;">Format</td><td style="padding:8px 0; border-bottom:1px solid #f0f0f0; text-align:right; font-weight:500; font-size:14px;">${formatDisplay}</td></tr>
      <tr><td style="padding:8px 0; border-bottom:1px solid #f0f0f0; color:#6b7280; font-size:14px;">Payment</td><td style="padding:8px 0; border-bottom:1px solid #f0f0f0; text-align:right; font-weight:500; font-size:14px;">${paymentDisplay}</td></tr>
      <tr><td style="padding:8px 0; color:#6b7280; font-size:14px; font-weight:600;">Total</td><td style="padding:8px 0; text-align:right; font-weight:700; font-size:16px;">$${data.amount} ${data.currency}</td></tr>
    </table>
    ${data.notes ? `<div class="highlight"><strong>Notes:</strong> ${data.notes}</div>` : ""}`;
}

// --- Teacher emails ---

export function newBookingTeacher(data: BookingEmailData): { subject: string; html: string } {
  return {
    subject: `New Booking: ${data.studentName} - ${data.date} ${data.startTime}`,
    html: baseLayout(`
      <h2 style="margin:0 0 8px; font-size:20px;">New Booking Received!</h2>
      <p style="color:#6b7280; margin:0 0 16px;">A student has booked a lesson with you.</p>
      ${bookingDetails(data)}
      <div style="text-align:center; margin-top:24px;">
        <a href="https://vietalky.web.app/admin/bookings" class="btn">View in Dashboard</a>
      </div>
    `, data.teacherName),
  };
}

export function cancelledBookingTeacher(data: BookingEmailData): { subject: string; html: string } {
  return {
    subject: `Booking Cancelled: ${data.studentName} - ${data.date}`,
    html: baseLayout(`
      <h2 style="margin:0 0 8px; font-size:20px;">Booking Cancelled</h2>
      <p style="color:#6b7280; margin:0 0 16px;">The following booking has been cancelled.</p>
      ${bookingDetails(data)}
    `, data.teacherName),
  };
}

// --- Student emails ---

export function bookingConfirmationStudent(data: BookingEmailData): { subject: string; html: string } {
  const isPending = data.paymentMethod === "bank_transfer";
  return {
    subject: `Booking ${isPending ? "Received" : "Confirmed"} - Lesson with ${data.teacherName} on ${data.date}`,
    html: baseLayout(`
      <h2 style="margin:0 0 8px; font-size:20px;">
        ${isPending ? "Booking Received!" : "Booking Confirmed!"}
      </h2>
      <p style="color:#6b7280; margin:0 0 16px;">
        ${isPending
          ? `Your booking with ${data.teacherName} has been received. It will be confirmed once payment is verified.`
          : `Your lesson with ${data.teacherName} has been booked successfully.`}
      </p>
      ${bookingDetails(data)}
      ${isPending ? `
        <div class="highlight">
          <strong>Payment pending:</strong> Please complete your bank transfer with reference <strong>${data.bookingId.substring(0, 8).toUpperCase()}</strong>
        </div>
      ` : ""}
      <div style="text-align:center; margin-top:24px;">
        <a href="https://vietalky.web.app/my-bookings" class="btn">View My Bookings</a>
      </div>
    `, data.teacherName),
  };
}

export function paymentConfirmedStudent(data: BookingEmailData): { subject: string; html: string } {
  return {
    subject: `Payment Confirmed - Lesson with ${data.teacherName} on ${data.date}`,
    html: baseLayout(`
      <h2 style="margin:0 0 8px; font-size:20px;">Payment Confirmed!</h2>
      <p style="color:#6b7280; margin:0 0 16px;">Your payment has been confirmed and your lesson with ${data.teacherName} is all set.</p>
      ${bookingDetails(data)}
      <div class="highlight">
        ${data.teacherName} will send you the meeting link before the lesson. Check your bookings page for updates.
      </div>
      <div style="text-align:center; margin-top:24px;">
        <a href="https://vietalky.web.app/my-bookings" class="btn">View My Bookings</a>
      </div>
    `, data.teacherName),
  };
}

export function cancelledBookingStudent(data: BookingEmailData): { subject: string; html: string } {
  return {
    subject: `Booking Cancelled - Lesson with ${data.teacherName} on ${data.date}`,
    html: baseLayout(`
      <h2 style="margin:0 0 8px; font-size:20px;">Booking Cancelled</h2>
      <p style="color:#6b7280; margin:0 0 16px;">Your booking with ${data.teacherName} has been cancelled.</p>
      ${bookingDetails(data)}
      <p style="color:#6b7280; font-size:14px; margin-top:16px;">
        If you did not request this cancellation, please contact us.
      </p>
      <div style="text-align:center; margin-top:24px;">
        <a href="https://vietalky.web.app/book" class="btn">Book Another Lesson</a>
      </div>
    `, data.teacherName),
  };
}

export function lessonReminderStudent(data: BookingEmailData & { meetingLink?: string | null }): { subject: string; html: string } {
  return {
    subject: `Reminder: Lesson with ${data.teacherName} tomorrow - ${data.date} ${data.startTime} KST`,
    html: baseLayout(`
      <h2 style="margin:0 0 8px; font-size:20px;">Lesson Reminder</h2>
      <p style="color:#6b7280; margin:0 0 16px;">Your lesson with ${data.teacherName} is coming up tomorrow!</p>
      ${bookingDetails(data)}
      ${data.meetingLink ? `
        <div class="highlight" style="text-align:center;">
          <p style="margin:0 0 8px; font-weight:600;">Join your lesson:</p>
          <a href="${data.meetingLink}" class="btn">Join Meeting</a>
        </div>
      ` : `
        <div class="highlight">
          ${data.teacherName} will share the meeting link before the lesson.
        </div>
      `}
    `, data.teacherName),
  };
}

export function lessonReminderTeacher(data: BookingEmailData): { subject: string; html: string } {
  return {
    subject: `Reminder: Lesson tomorrow with ${data.studentName} - ${data.startTime} KST`,
    html: baseLayout(`
      <h2 style="margin:0 0 8px; font-size:20px;">Lesson Tomorrow</h2>
      <p style="color:#6b7280; margin:0 0 16px;">You have a lesson coming up tomorrow.</p>
      ${bookingDetails(data)}
      <div style="text-align:center; margin-top:24px;">
        <a href="https://vietalky.web.app/admin/bookings" class="btn">View in Dashboard</a>
      </div>
    `, data.teacherName),
  };
}
