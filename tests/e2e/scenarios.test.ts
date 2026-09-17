import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { GET, POST } from "@/app/api/webhook/route";
import type { KenzaState } from "@/graph/state";

const invoke = vi.fn();
vi.mock("@/graph/graph", () => ({
  kenzaGraph: { invoke: (...args: unknown[]) => invoke(...args) },
}));

const sendWhatsAppMessage = vi.fn();
vi.mock("@/lib/whatsapp", async () => {
  const actual = await vi.importActual<typeof import("@/lib/whatsapp")>("@/lib/whatsapp");
  return {
    ...actual,
    sendWhatsAppMessage: (...args: [string, string]) => sendWhatsAppMessage(...args),
  };
});

function webhookPayload(message: Record<string, unknown> | null) {
  return {
    object: "whatsapp_business_account",
    entry: [
      {
        id: "entry-1",
        changes: [
          {
            field: "messages",
            value: {
              messaging_product: "whatsapp",
              metadata: { display_phone_number: "212600000000", phone_number_id: "pn-1" },
              messages: message ? [message] : undefined,
            },
          },
        ],
      },
    ],
  };
}

function postRequest(body: unknown) {
  return new NextRequest("http://localhost/api/webhook", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "content-type": "application/json" },
  });
}

describe("kenza webhook e2e acceptance scenarios", () => {
  beforeEach(() => {
    invoke.mockReset();
    sendWhatsAppMessage.mockReset().mockResolvedValue(undefined);
    process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN = "test-verify-token";
  });

  it("scenario 1: confirms the Meta webhook subscription with a valid verify token", () => {
    const request = new NextRequest(
      "http://localhost/api/webhook?hub.mode=subscribe&hub.verify_token=test-verify-token&hub.challenge=challenge-123",
    );

    const response = GET(request);

    expect(response.status).toBe(200);
  });

  it("scenario 2: rejects the webhook subscription when the verify token is wrong", () => {
    const request = new NextRequest(
      "http://localhost/api/webhook?hub.mode=subscribe&hub.verify_token=wrong-token&hub.challenge=challenge-123",
    );

    const response = GET(request);

    expect(response.status).toBe(403);
  });

  it("scenario 3: routes an inbound text message through the graph and replies on WhatsApp", async () => {
    const finalState: Partial<KenzaState> = {
      messages: [
        { role: "user", content: "cherche huile d'argan" },
        { role: "assistant", content: "Nous avons de l'huile d'argan a 150 MAD" },
      ],
    };
    invoke.mockResolvedValue(finalState);

    const response = await POST(
      postRequest(
        webhookPayload({
          from: "+212600000001",
          id: "msg-1",
          timestamp: "1700000000",
          type: "text",
          text: { body: "cherche huile d'argan" },
        }),
      ),
    );

    expect(invoke).toHaveBeenCalledWith({
      customerPhone: "+212600000001",
      conversationId: "+212600000001",
      rawMessage: "cherche huile d'argan",
    });
    expect(sendWhatsAppMessage).toHaveBeenCalledWith(
      "+212600000001",
      "Nous avons de l'huile d'argan a 150 MAD",
    );
    expect(await response.json()).toEqual({ status: "ok" });
  });

  it("scenario 4: ignores non-text messages without invoking the graph", async () => {
    const response = await POST(
      postRequest(
        webhookPayload({
          from: "+212600000002",
          id: "msg-2",
          timestamp: "1700000001",
          type: "image",
        }),
      ),
    );

    expect(invoke).not.toHaveBeenCalled();
    expect(sendWhatsAppMessage).not.toHaveBeenCalled();
    expect(await response.json()).toEqual({ status: "ignored" });
  });

  it("scenario 5: skips sending a WhatsApp reply when the graph produces no assistant message", async () => {
    invoke.mockResolvedValue({ messages: [{ role: "user", content: "salut" }] });

    const response = await POST(
      postRequest(
        webhookPayload({
          from: "+212600000003",
          id: "msg-3",
          timestamp: "1700000002",
          type: "text",
          text: { body: "salut" },
        }),
      ),
    );

    expect(sendWhatsAppMessage).not.toHaveBeenCalled();
    expect(await response.json()).toEqual({ status: "ok" });
  });
});
