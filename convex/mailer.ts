// Sends transactional email. It uses whichever provider is configured in the Convex environment, in this order:
//   1. EMAIL_WEBHOOK_URL (+ EMAIL_WEBHOOK_SECRET)  a Google Apps Script that sends from your own Gmail
//   2. BREVO_API_KEY (+ EMAIL_FROM)                Brevo (free tier, needs one verified sender address)
//   3. RESEND_API_KEY (+ EMAIL_FROM)               Resend (the original setup keeps working)

export type OutgoingEmail = { to: string; subject: string; html: string };

export function emailProvider(): "webhook" | "brevo" | "resend" | null {
  if (process.env.EMAIL_WEBHOOK_URL) return "webhook";
  if (process.env.BREVO_API_KEY && process.env.EMAIL_FROM) return "brevo";
  if (process.env.RESEND_API_KEY && process.env.EMAIL_FROM) return "resend";
  return null;
}

export async function sendEmail(message: OutgoingEmail) {
  const provider = emailProvider();
  if (!provider) {
    throw new Error("Email is not configured. Set EMAIL_WEBHOOK_URL, or BREVO_API_KEY with EMAIL_FROM, or RESEND_API_KEY with EMAIL_FROM in the Convex environment variables.");
  }

  let response: Response;
  if (provider === "webhook") {
    response = await fetch(process.env.EMAIL_WEBHOOK_URL as string, {
      method: "POST",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify({ secret: process.env.EMAIL_WEBHOOK_SECRET ?? "", to: message.to, subject: message.subject, html: message.html })
    });
    const reply = (await response.text().catch(() => "")).trim();
    if (!response.ok || reply !== "ok") {
      console.error("Kinda email webhook failed:", response.status, reply.slice(0, 200));
      throw new Error("We couldn't send the email. Please try again later.");
    }
    return;
  }

  if (provider === "brevo") {
    response = await fetch("https://api.brevo.com/v3/smtp/email", {
      method: "POST",
      headers: { "api-key": process.env.BREVO_API_KEY as string, "Content-Type": "application/json", accept: "application/json" },
      body: JSON.stringify({
        sender: { email: process.env.EMAIL_FROM, name: process.env.EMAIL_FROM_NAME ?? "Kinda" },
        to: [{ email: message.to }],
        subject: message.subject,
        htmlContent: message.html
      })
    });
  } else {
    response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from: process.env.EMAIL_FROM, to: [message.to], subject: message.subject, html: message.html })
    });
  }
  if (!response.ok) {
    const details = await response.text().catch(() => "");
    console.error(`Kinda email (${provider}) failed:`, response.status, details.slice(0, 300));
    throw new Error("We couldn't send the email. Please try again later.");
  }
}
