"use server";

const RESEND_API_URL = "https://api.resend.com/emails";

export async function sendEmail(input: {
  to: string;
  subject: string;
  html: string;
}): Promise<{ ok: boolean; error?: string }> {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.EMAIL_FROM || "PaperMill ERP <onboarding@resend.dev>";

  if (!apiKey) {
    return {
      ok: false,
      error:
        "Email is not configured. An administrator needs to set the RESEND_API_KEY secret (npx wrangler secret put RESEND_API_KEY).",
    };
  }
  if (!input.to) {
    return { ok: false, error: "Recipient has no email address on file." };
  }

  const res = await fetch(RESEND_API_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ from, to: input.to, subject: input.subject, html: input.html }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    return { ok: false, error: `Email provider error (${res.status}): ${body.slice(0, 200)}` };
  }
  return { ok: true };
}
