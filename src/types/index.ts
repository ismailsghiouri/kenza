export interface WhatsAppInboundMessage {
  from: string;
  id: string;
  timestamp: string;
  type: "text" | "image" | "audio" | "document" | "interactive";
  text?: { body: string };
}

export interface WhatsAppWebhookPayload {
  object: string;
  entry: Array<{
    id: string;
    changes: Array<{
      field: string;
      value: {
        messaging_product: "whatsapp";
        metadata: { display_phone_number: string; phone_number_id: string };
        messages?: WhatsAppInboundMessage[];
      };
    }>;
  }>;
}

export interface CustomerProfile {
  id: string;
  phone: string;
  name?: string;
  createdAt: Date;
}

export interface AgentState {
  customerPhone: string;
  conversationId: string;
  messages: Array<{ role: "user" | "assistant"; content: string }>;
  cart: Array<{ productId: string; quantity: number }>;
}
