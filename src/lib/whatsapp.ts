const WHATSAPP_API_VERSION = "v21.0";

function getConfig() {
  const token = process.env.WHATSAPP_API_TOKEN;
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;

  if (!token || !phoneNumberId) {
    throw new Error("WhatsApp API credentials are not set");
  }

  return { token, phoneNumberId };
}

export async function sendWhatsAppMessage(to: string, body: string): Promise<void> {
  const { token, phoneNumberId } = getConfig();

  const response = await fetch(
    `https://graph.facebook.com/${WHATSAPP_API_VERSION}/${phoneNumberId}/messages`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        to,
        type: "text",
        text: { body },
      }),
    },
  );

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`WhatsApp API error (${response.status}): ${errorText}`);
  }
}

export function verifyWebhookChallenge(
  mode: string | null,
  token: string | null,
  challenge: string | null,
): string | null {
  const expectedToken = process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN;

  if (mode === "subscribe" && token === expectedToken && challenge) {
    return challenge;
  }

  return null;
}
