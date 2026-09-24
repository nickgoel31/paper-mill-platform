import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { runAgentTurnToCompletion } from "@/server/services/whatsapp-ai-agent";
import { sendWhatsAppText } from "@/lib/whatsapp/client";

export const dynamic = "force-dynamic";

/**
 * WhatsApp Cloud API webhook. Public (see middleware.ts) — Meta calls this
 * directly with no session. Security is the POST signature check below, not
 * auth middleware.
 *
 * GET is Meta's one-time subscription handshake:
 * https://developers.facebook.com/docs/graph-api/webhooks/getting-started#verification-requests
 */
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const mode = searchParams.get("hub.mode");
  const token = searchParams.get("hub.verify_token");
  const challenge = searchParams.get("hub.challenge");

  const verifyToken = process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN;
  if (verifyToken && mode === "subscribe" && token === verifyToken) {
    return new NextResponse(challenge || "", { status: 200 });
  }
  return new NextResponse("Forbidden", { status: 403 });
}

/** Constant-time-ish hex compare (timing-safe enough for a webhook signature). */
function safeEqualHex(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

async function verifySignature(rawBody: string, signatureHeader: string | null, appSecret: string): Promise<boolean> {
  if (!signatureHeader?.startsWith("sha256=")) return false;
  const expected = signatureHeader.slice(7);
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(appSecret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const sigBuf = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(rawBody));
  const computed = Array.from(new Uint8Array(sigBuf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  return safeEqualHex(computed, expected);
}

async function downloadWhatsAppMedia(
  mediaId: string,
  accessToken: string,
  apiVersion: string
): Promise<{ base64: string; mimeType: string } | null> {
  const metaRes = await fetch(`https://graph.facebook.com/${apiVersion}/${mediaId}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!metaRes.ok) return null;
  const meta: any = await metaRes.json();
  if (!meta.url) return null;

  const fileRes = await fetch(meta.url, { headers: { Authorization: `Bearer ${accessToken}` } });
  if (!fileRes.ok) return null;
  const buf = new Uint8Array(await fileRes.arrayBuffer());

  let binary = "";
  const chunkSize = 8192;
  for (let i = 0; i < buf.length; i += chunkSize) {
    binary += String.fromCharCode(...buf.subarray(i, i + chunkSize));
  }
  return { base64: btoa(binary), mimeType: meta.mime_type || "application/octet-stream" };
}

export async function POST(req: NextRequest) {
  const rawBody = await req.text();

  const appSecret = process.env.WHATSAPP_APP_SECRET;
  if (appSecret) {
    const valid = await verifySignature(rawBody, req.headers.get("x-hub-signature-256"), appSecret);
    if (!valid) {
      return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
    }
  } else {
    // No app secret configured yet — refuse rather than silently accept
    // unverified webhook calls that could create orders.
    console.error("[WhatsApp webhook] WHATSAPP_APP_SECRET is not set; refusing inbound message.");
    return NextResponse.json({ error: "Webhook not configured" }, { status: 503 });
  }

  let payload: any;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ success: true });
  }

  const messages: any[] = [];
  for (const entry of payload.entry || []) {
    for (const change of entry.changes || []) {
      for (const msg of change.value?.messages || []) {
        messages.push(msg);
      }
    }
  }

  // Always ack 200 once signature-verified — Meta retries aggressively on
  // non-200, and per-message failures are logged rather than surfaced here.
  for (const msg of messages) {
    try {
      await processInboundMessage(msg);
    } catch (err) {
      console.error("[WhatsApp webhook] failed to process message", err);
    }
  }

  return NextResponse.json({ success: true });
}

async function processInboundMessage(msg: any) {
  const waMessageId: string | undefined = msg.id;
  const fromPhone: string = String(msg.from || "");
  const messageType: string = msg.type || "unknown";

  if (!waMessageId || !fromPhone) return;

  // Idempotency — Meta redelivers on any non-200 or timeout.
  const already = await db.whatsAppInboundMessage.findFirst({ where: { waMessageId } });
  if (already) return;

  const sender = await db.whatsAppAllowedSender.findFirst({
    where: { phoneNumber: fromPhone, isActive: true },
    include: { tenant: true, actAsUser: true },
  });

  const rawText: string | null = msg.text?.body || msg.image?.caption || msg.document?.caption || null;

  if (!sender || !sender.tenant.isActive || !sender.actAsUser.isActive) {
    await db.whatsAppInboundMessage.create({
      data: { waMessageId, fromPhone, messageType, matched: false, rawText },
    });
    // Best-effort polite reply with no tenant credentials known yet — uses
    // the global fallback WHATSAPP_* env vars if set, else logs dry-run.
    await sendWhatsAppText({
      phoneNumber: fromPhone,
      text: "This number isn't registered for the PaperMill AI assistant. Ask your mill admin to add it under Platform > (your mill) > WhatsApp AI.",
    }).catch(() => {});
    return;
  }

  const credentials = {
    accessToken: sender.tenant.whatsappAccessToken,
    phoneNumberId: sender.tenant.whatsappPhoneNumberId,
    apiVersion: sender.tenant.whatsappApiVersion,
  };

  const files: Array<{ name: string; type: string; base64: string }> = [];
  if ((messageType === "image" || messageType === "document") && credentials.accessToken && credentials.phoneNumberId) {
    const media = msg.image || msg.document;
    if (media?.id) {
      const downloaded = await downloadWhatsAppMedia(
        media.id,
        credentials.accessToken,
        credentials.apiVersion || "v21.0"
      );
      if (downloaded) {
        files.push({ name: msg.document?.filename || `whatsapp-${media.id}`, type: downloaded.mimeType, base64: downloaded.base64 });
      }
    }
  }

  const userMessage = `[Message received via WhatsApp from ${sender.label || `+${fromPhone}`}]\n${rawText || ""}`;

  let replyText = "Sorry, something went wrong processing that.";
  let errorMessage: string | null = null;
  try {
    const result = await runAgentTurnToCompletion({
      tenantCtx: { tenantId: sender.tenantId, isPlatform: false, userId: sender.actAsUser.id, role: sender.actAsUser.role },
      userName: sender.actAsUser.name,
      userRole: sender.actAsUser.role,
      userMessage,
      files,
      replyToPhone: fromPhone,
      whatsappCredentials: credentials,
    });
    replyText = result.replyText;
  } catch (err: any) {
    errorMessage = err?.message || String(err);
    replyText = "Sorry, I ran into an error handling that request. A staff member has been notified.";
  }

  await db.whatsAppInboundMessage.create({
    data: {
      waMessageId,
      tenantId: sender.tenantId,
      fromPhone,
      messageType,
      rawText,
      matched: true,
      replyText,
      errorMessage,
    },
  });

  await sendWhatsAppText({ phoneNumber: fromPhone, text: replyText, credentials }).catch((err) => {
    console.error("[WhatsApp webhook] failed to send reply", err);
  });
}
