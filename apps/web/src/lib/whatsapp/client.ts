import { normalizeIndianPhoneNumber } from "./phone-normalizer";
import { renderWhatsAppMessage } from "./templates";

export interface SendWhatsAppResult {
  success: boolean;
  providerMessageId?: string;
  isDryRun: boolean;
  messageText: string;
  normalizedPhone: string;
  error?: string;
}

export async function sendWhatsAppMessage(input: {
  phoneNumber: string;
  templateName: string;
  payload: Record<string, any>;
  millName?: string;
}): Promise<SendWhatsAppResult> {
  const isDryRun =
    process.env.WHATSAPP_DRY_RUN !== "false" ||
    !process.env.WHATSAPP_ACCESS_TOKEN ||
    !process.env.WHATSAPP_PHONE_NUMBER_ID;

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
  const apiVersion = process.env.WHATSAPP_API_VERSION || "v21.0";
  const phoneId = process.env.WHATSAPP_PHONE_NUMBER_ID;
  const token = process.env.WHATSAPP_ACCESS_TOKEN;

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
