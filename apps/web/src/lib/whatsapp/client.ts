import { normalizeIndianPhoneNumber } from "./phone-normalizer";
import { renderWhatsAppMessage } from "./templates";

function resolveCreds(credentials?: WhatsAppCredentials | null) {
  const accessToken = credentials?.accessToken || process.env.WHATSAPP_ACCESS_TOKEN;
  const phoneNumberId = credentials?.phoneNumberId || process.env.WHATSAPP_PHONE_NUMBER_ID;
  const apiVersion = credentials?.apiVersion || process.env.WHATSAPP_API_VERSION || "v21.0";
  const isDryRun = process.env.WHATSAPP_DRY_RUN !== "false" || !accessToken || !phoneNumberId;
  return { accessToken, phoneNumberId, apiVersion, isDryRun };
}

/**
 * Sends a plain freeform text reply — valid within WhatsApp's 24-hour
 * "customer service window" after the user last messaged in (which is always
 * true for an AI reply to an inbound message), unlike `sendWhatsAppMessage`'s
 * pre-approved business templates required for mill-initiated notifications.
 */
export async function sendWhatsAppText(input: {
  phoneNumber: string;
  text: string;
  credentials?: WhatsAppCredentials | null;
}): Promise<SendWhatsAppResult> {
  const { accessToken, phoneNumberId, apiVersion, isDryRun } = resolveCreds(input.credentials);
  const normalizedPhone = normalizeIndianPhoneNumber(input.phoneNumber);

  if (isDryRun) {
    const mockWamid = `dry_run_wamid_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
    console.log(`[WHATSAPP DRY-RUN] To: +${normalizedPhone} | Text: "${input.text}"\nMock Provider ID: ${mockWamid}`);
    return { success: true, providerMessageId: mockWamid, isDryRun: true, messageText: input.text, normalizedPhone };
  }

  try {
    const res = await fetch(`https://graph.facebook.com/${apiVersion}/${phoneNumberId}/messages`, {
      method: "POST",
      headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        recipient_type: "individual",
        to: normalizedPhone,
        type: "text",
        text: { preview_url: false, body: input.text },
      }),
    });
    const data: any = await res.json();
    if (!res.ok || data.error) {
      return {
        success: false,
        isDryRun: false,
        messageText: input.text,
        normalizedPhone,
        error: `Meta Graph API error: ${data.error ? data.error.message : `HTTP ${res.status}`}`,
      };
    }
    return {
      success: true,
      providerMessageId: data.messages?.[0]?.id || `wamid_${Date.now()}`,
      isDryRun: false,
      messageText: input.text,
      normalizedPhone,
    };
  } catch (err: any) {
    return {
      success: false,
      isDryRun: false,
      messageText: input.text,
      normalizedPhone,
      error: err.message || "Failed to reach WhatsApp Cloud API",
    };
  }
}

/**
 * Uploads a small text/CSV file to Meta's Media endpoint so it can be
 * referenced by id in a "document" message. Same dry-run kill switch as
 * `sendWhatsAppMessage` — nothing uploads for real until WHATSAPP_DRY_RUN is
 * explicitly "false" and per-tenant credentials are configured.
 */
export async function uploadWhatsAppMedia(input: {
  content: string;
  filename: string;
  mimeType: string;
  credentials?: WhatsAppCredentials | null;
}): Promise<{ mediaId: string; isDryRun: boolean; error?: string }> {
  const { accessToken, phoneNumberId, apiVersion, isDryRun } = resolveCreds(input.credentials);

  if (isDryRun) {
    console.log(`[WHATSAPP DRY-RUN] Would upload media "${input.filename}" (${input.mimeType}, ${input.content.length} bytes)`);
    return { mediaId: `dry_run_media_${Date.now()}`, isDryRun: true };
  }

  try {
    const blob = new Blob([input.content], { type: input.mimeType });
    const form = new FormData();
    form.append("messaging_product", "whatsapp");
    form.append("type", input.mimeType);
    form.append("file", blob, input.filename);

    const res = await fetch(`https://graph.facebook.com/${apiVersion}/${phoneNumberId}/media`, {
      method: "POST",
      headers: { Authorization: `Bearer ${accessToken}` },
      body: form,
    });
    const data: any = await res.json();
    if (!res.ok || data.error) {
      return { mediaId: "", isDryRun: false, error: data.error?.message || `HTTP ${res.status}` };
    }
    return { mediaId: data.id, isDryRun: false };
  } catch (err: any) {
    return { mediaId: "", isDryRun: false, error: err.message || "Failed to upload media" };
  }
}

/** Sends a previously-uploaded media id as a document message. */
export async function sendWhatsAppDocument(input: {
  phoneNumber: string;
  mediaId: string;
  filename: string;
  caption?: string;
  credentials?: WhatsAppCredentials | null;
}): Promise<SendWhatsAppResult> {
  const { accessToken, phoneNumberId, apiVersion, isDryRun } = resolveCreds(input.credentials);
  const normalizedPhone = normalizeIndianPhoneNumber(input.phoneNumber);

  if (isDryRun) {
    const mockWamid = `dry_run_wamid_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
    console.log(
      `[WHATSAPP DRY-RUN] To: +${normalizedPhone} | Document: ${input.filename} (media ${input.mediaId})\nMock Provider ID: ${mockWamid}`
    );
    return {
      success: true,
      providerMessageId: mockWamid,
      isDryRun: true,
      messageText: `[document: ${input.filename}]`,
      normalizedPhone,
    };
  }

  try {
    const res = await fetch(`https://graph.facebook.com/${apiVersion}/${phoneNumberId}/messages`, {
      method: "POST",
      headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        recipient_type: "individual",
        to: normalizedPhone,
        type: "document",
        document: { id: input.mediaId, filename: input.filename, caption: input.caption },
      }),
    });
    const data: any = await res.json();
    if (!res.ok || data.error) {
      return {
        success: false,
        isDryRun: false,
        messageText: `[document: ${input.filename}]`,
        normalizedPhone,
        error: `Meta Graph API error: ${data.error ? data.error.message : `HTTP ${res.status}`}`,
      };
    }
    return {
      success: true,
      providerMessageId: data.messages?.[0]?.id || `wamid_${Date.now()}`,
      isDryRun: false,
      messageText: `[document: ${input.filename}]`,
      normalizedPhone,
    };
  } catch (err: any) {
    return {
      success: false,
      isDryRun: false,
      messageText: `[document: ${input.filename}]`,
      normalizedPhone,
      error: err.message || "Failed to reach WhatsApp Cloud API",
    };
  }
}

export interface SendWhatsAppResult {
  success: boolean;
  providerMessageId?: string;
  isDryRun: boolean;
  messageText: string;
  normalizedPhone: string;
  error?: string;
}

export interface WhatsAppCredentials {
  accessToken?: string | null;
  phoneNumberId?: string | null;
  apiVersion?: string | null;
}

export async function sendWhatsAppMessage(input: {
  phoneNumber: string;
  templateName: string;
  payload: Record<string, any>;
  millName?: string;
  /** Per-tenant WhatsApp Cloud API credentials, configured by TWJ platform admins. Falls back to the global env vars when omitted. */
  credentials?: WhatsAppCredentials | null;
}): Promise<SendWhatsAppResult> {
  const accessToken = input.credentials?.accessToken || process.env.WHATSAPP_ACCESS_TOKEN;
  const phoneNumberId = input.credentials?.phoneNumberId || process.env.WHATSAPP_PHONE_NUMBER_ID;

  // WHATSAPP_DRY_RUN is a global kill switch: even with valid per-tenant
  // credentials, nothing sends for real until it's explicitly set to "false".
  const isDryRun = process.env.WHATSAPP_DRY_RUN !== "false" || !accessToken || !phoneNumberId;

  // 1. Normalize and validate Indian mobile phone
  const normalizedPhone = normalizeIndianPhoneNumber(input.phoneNumber);

  // 2. Render message text
  const messageText = renderWhatsAppMessage(
    input.templateName,
    input.payload,
    input.millName || "HRA Paper Mill"
  );

  // 3. DRY RUN MODE: Do not call Meta API, log and return simulated successful provider ID
  if (isDryRun) {
    const mockWamid = `dry_run_wamid_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
    console.log(
      `[WHATSAPP DRY-RUN] To: +${normalizedPhone} | Template: ${input.templateName}\nMessage: "${messageText}"\nMock Provider ID: ${mockWamid}`
    );

    return {
      success: true,
      providerMessageId: mockWamid,
      isDryRun: true,
      messageText,
      normalizedPhone,
    };
  }

  // 4. PRODUCTION MODE: Call Meta Graph API
  const apiVersion = input.credentials?.apiVersion || process.env.WHATSAPP_API_VERSION || "v21.0";
  const phoneId = phoneNumberId;
  const token = accessToken;

  const url = `https://graph.facebook.com/${apiVersion}/${phoneId}/messages`;

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        recipient_type: "individual",
        to: normalizedPhone,
        type: "text",
        text: {
          preview_url: false,
          body: messageText,
        },
      }),
    });

    const data = await response.json();

    if (!response.ok || data.error) {
      const errDetail = data.error ? data.error.message : `HTTP ${response.status}`;
      return {
        success: false,
        isDryRun: false,
        messageText,
        normalizedPhone,
        error: `Meta Graph API error: ${errDetail}`,
      };
    }

    const providerMessageId = data.messages?.[0]?.id || `wamid_${Date.now()}`;
    return {
      success: true,
      providerMessageId,
      isDryRun: false,
      messageText,
      normalizedPhone,
    };
  } catch (err: any) {
    return {
      success: false,
      isDryRun: false,
      messageText,
      normalizedPhone,
      error: err.message || "Failed to reach WhatsApp Cloud API",
    };
  }
}
