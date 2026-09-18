import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { POST } from "@/app/api/webhook/route";
import type { KenzaState } from "@/graph/state";

const invoke = vi.fn();
vi.mock("@/graph/graph", () => ({
  kenzaGraph: { invoke: (...args: unknown[]) => invoke(...args) },
  ensureCheckpointerReady: vi.fn().mockResolvedValue(undefined),
}));

function postRequest(body: unknown) {
  return new NextRequest("http://localhost/api/webhook", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "content-type": "application/json" },
  });
}

function baseState(overrides: Partial<KenzaState> = {}): Partial<KenzaState> {
  return {
    intent: "unknown",
    requiresEscalation: false,
    error: null,
    order: null,
    messages: [],
    explanation: "",
    ...overrides,
  };
}

describe("kenza webhook e2e acceptance scenarios", () => {
  beforeEach(() => {
    invoke.mockReset();
  });

  it("scenario 1: rejects a request missing phone", async () => {
    const response = await POST(postRequest({ text: "cherche huile d'argan" }));

    expect(response.status).toBe(400);
    expect(invoke).not.toHaveBeenCalled();
  });

  it("scenario 2: rejects a request missing text", async () => {
    const response = await POST(postRequest({ phone: "+212600000001" }));

    expect(response.status).toBe(400);
    expect(invoke).not.toHaveBeenCalled();
  });

  it("scenario 3: routes an inbound message through the graph and returns the reply", async () => {
    invoke.mockResolvedValue(
      baseState({
        intent: "search",
        messages: [
          { role: "user", content: "cherche huile d'argan" },
          { role: "assistant", content: "Nous avons de l'huile d'argan a 150 MAD" },
        ],
      }),
    );

    const response = await POST(
      postRequest({ phone: "+212600000001", text: "cherche huile d'argan" }),
    );
    const json = await response.json();

    expect(invoke).toHaveBeenCalledTimes(1);
    const [initialState, options] = invoke.mock.calls[0] as [
      Partial<KenzaState>,
      { configurable: { thread_id: string } },
    ];
    expect(initialState.customerPhone).toBe("+212600000001");
    expect(initialState.rawMessage).toBe("cherche huile d'argan");
    expect(options.configurable.thread_id).toBe("+212600000001");

    expect(response.status).toBe(200);
    expect(json).toEqual({
      request_id: initialState.conversationId,
      message: "Nous avons de l'huile d'argan a 150 MAD",
      intent: "search",
      workflow_status: "processed",
    });
  });

  it("scenario 4: reports workflow_status escalated when the graph flags an escalation", async () => {
    invoke.mockResolvedValue(
      baseState({
        intent: "escalation",
        requiresEscalation: true,
        messages: [{ role: "assistant", content: "Notre équipe vous recontacte" }],
      }),
    );

    const response = await POST(
      postRequest({ phone: "+212600000002", text: "je veux une facture société" }),
    );
    const json = await response.json();

    expect(json.workflow_status).toBe("escalated");
  });

  it("scenario 5: reports workflow_status completed when the graph places an order", async () => {
    invoke.mockResolvedValue(
      baseState({
        intent: "checkout",
        order: { orderId: "CMD-1", status: "en préparation", totalMad: 300 },
        messages: [{ role: "assistant", content: "Commande confirmée #CMD-1" }],
      }),
    );

    const response = await POST(postRequest({ phone: "+212600000003", text: "wach mizanya" }));
    const json = await response.json();

    expect(json.workflow_status).toBe("completed");
  });

  it("scenario 6: returns 500 when the graph invocation fails", async () => {
    invoke.mockRejectedValue(new Error("boom"));

    const response = await POST(postRequest({ phone: "+212600000004", text: "salut" }));

    expect(response.status).toBe(500);
    expect(await response.json()).toMatchObject({ error: "Graph error" });
  });
});
