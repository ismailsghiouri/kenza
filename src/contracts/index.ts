import { z } from "zod";

// ---------------------------------------------------------------------------
// WhatsApp webhook boundary
// ---------------------------------------------------------------------------

export const whatsAppInboundMessageSchema = z.object({
  from: z.string(),
  id: z.string(),
  timestamp: z.string(),
  type: z.enum(["text", "image", "audio", "document", "interactive"]),
  text: z.object({ body: z.string() }).optional(),
});

export const whatsAppWebhookPayloadSchema = z.object({
  object: z.string(),
  entry: z.array(
    z.object({
      id: z.string(),
      changes: z.array(
        z.object({
          field: z.string(),
          value: z.object({
            messaging_product: z.literal("whatsapp"),
            metadata: z.object({
              display_phone_number: z.string(),
              phone_number_id: z.string(),
            }),
            messages: z.array(whatsAppInboundMessageSchema).optional(),
          }),
        }),
      ),
    }),
  ),
});

export type WhatsAppInboundMessage = z.infer<typeof whatsAppInboundMessageSchema>;
export type WhatsAppWebhookPayload = z.infer<typeof whatsAppWebhookPayloadSchema>;

// ---------------------------------------------------------------------------
// Agent domain contracts (mirrors src/graph/state.ts)
// ---------------------------------------------------------------------------

export const kenzaIntentSchema = z.enum(["search", "checkout", "question", "unknown"]);

export const kenzaCartItemSchema = z.object({
  productId: z.string(),
  quantity: z.number().int().positive(),
});

export const kenzaProductResultSchema = z.object({
  id: z.string(),
  name: z.string(),
  priceCents: z.number().int().nonnegative(),
  stock: z.number().int().nonnegative(),
});

export const orderStatusSchema = z.enum([
  "pending",
  "confirmed",
  "shipped",
  "delivered",
  "cancelled",
]);

export const kenzaOrderResultSchema = z.object({
  orderId: z.string(),
  status: orderStatusSchema,
  totalCents: z.number().int().nonnegative(),
});

export type KenzaIntent = z.infer<typeof kenzaIntentSchema>;
export type KenzaCartItem = z.infer<typeof kenzaCartItemSchema>;
export type KenzaProductResult = z.infer<typeof kenzaProductResultSchema>;
export type OrderStatus = z.infer<typeof orderStatusSchema>;
export type KenzaOrderResult = z.infer<typeof kenzaOrderResultSchema>;

// ---------------------------------------------------------------------------
// Agent invocation contract — what triggers the graph and what it returns
// ---------------------------------------------------------------------------

export const agentInputSchema = z.object({
  customerPhone: z.string(),
  conversationId: z.string(),
  rawMessage: z.string(),
});

export const agentOutputSchema = z.object({
  intent: kenzaIntentSchema,
  explanation: z.string(),
  order: kenzaOrderResultSchema.nullable(),
  report: z.string(),
  error: z.string().nullable(),
});

export type AgentInput = z.infer<typeof agentInputSchema>;
export type AgentOutput = z.infer<typeof agentOutputSchema>;
