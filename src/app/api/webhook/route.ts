import { NextRequest, NextResponse } from "next/server";
import { kenzaGraph, ensureCheckpointerReady } from "@/graph/graph";
import { createInitialState } from "@/graph/state";
import { logger } from "@/lib/logger";

interface IncomingWebhookBody {
  phone?: string;
  text?: string;
  timestamp?: string;
}

type WorkflowStatus = "error" | "escalated" | "completed" | "processed";

function deriveWorkflowStatus(result: {
  error: string | null;
  requiresEscalation: boolean;
  order: { orderId: string } | null;
}): WorkflowStatus {
  if (result.error) return "error";
  if (result.requiresEscalation) return "escalated";
  if (result.order) return "completed";
  return "processed";
}

/**
 * Best-effort WhatsApp reply via Twilio's REST API. No-op when Twilio isn't
 * configured — sending the reply back to the customer is optional, the
 * webhook response itself always carries the message.
 */
async function sendViaTwilio(to: string, body: string): Promise<void> {
  const accountSid = process.env["TWILIO_ACCOUNT_SID"];
  const authToken = process.env["TWILIO_AUTH_TOKEN"];
  const fromNumber = process.env["TWILIO_PHONE_NUMBER"];

  if (!accountSid || !authToken || !fromNumber) {
    return;
  }

  const params = new URLSearchParams({
    To: `whatsapp:${to}`,
    From: `whatsapp:${fromNumber}`,
    Body: body,
  });

  const response = await fetch(
    `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`,
    {
      method: "POST",
      headers: {
        Authorization: `Basic ${Buffer.from(`${accountSid}:${authToken}`).toString("base64")}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: params.toString(),
    },
  );

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Twilio API error (${response.status}): ${errorText}`);
  }
}

export async function POST(request: NextRequest) {
  const requestId = crypto.randomUUID();

  let body: IncomingWebhookBody;
  try {
    body = (await request.json()) as IncomingWebhookBody;
  } catch {
    return NextResponse.json(
      { request_id: requestId, error: "Invalid JSON body" },
      { status: 400 },
    );
  }

  const { phone, text, timestamp } = body;

  if (!phone) {
    return NextResponse.json(
      { request_id: requestId, error: "phone is required" },
      { status: 400 },
    );
  }

  if (!text) {
    return NextResponse.json(
      { request_id: requestId, error: "text is required" },
      { status: 400 },
    );
  }

  logger.info(`[WEBHOOK] Received message from ${phone}`, { requestId, phone, timestamp });

  try {
    await ensureCheckpointerReady();
  } catch (err) {
    logger.error("[WEBHOOK] Database error", {
      requestId,
      error: err instanceof Error ? err.message : String(err),
    });
    return NextResponse.json(
      { request_id: requestId, error: "Database error" },
      { status: 500 },
    );
  }

  const initialState = createInitialState(requestId, phone, text);

  let result;
  try {
    result = await kenzaGraph.invoke(initialState, {
      configurable: { thread_id: phone },
    });
  } catch (err) {
    logger.error("[WEBHOOK] Graph error", {
      requestId,
      error: err instanceof Error ? err.message : String(err),
    });
    return NextResponse.json(
      { request_id: requestId, error: "Graph error" },
      { status: 500 },
    );
  }

  const responseText = result.messages.at(-1)?.content ?? result.explanation ?? "";
  const workflowStatus = deriveWorkflowStatus(result);

  logger.info(`[WEBHOOK] Intent: ${result.intent}`, { requestId });
  logger.info(`[WEBHOOK] Response: ${responseText}`, { requestId });

  if (responseText) {
    try {
      await sendViaTwilio(phone, responseText);
    } catch (err) {
      logger.warn("[WEBHOOK] Failed to send WhatsApp reply via Twilio", {
        requestId,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  return NextResponse.json({
    request_id: requestId,
    message: responseText,
    intent: result.intent,
    workflow_status: workflowStatus,
  });
}
