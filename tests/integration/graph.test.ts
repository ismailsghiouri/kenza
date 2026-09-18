import { describe, it, expect } from "vitest";
import { buildKenzaGraph } from "@/graph/graph";
import type { KenzaOrderResult, KenzaProductResult } from "@/graph/state";

describe("kenza orchestration graph", () => {
  it("routes a search intent through search and explainer to a report", async () => {
    const results: KenzaProductResult[] = [
      { id: "p1", name: "Huile d'argan", priceMad: 150, stock: 10 },
    ];

    const graph = buildKenzaGraph({
      classifier: { classify: async () => "search" },
      search: { search: async () => results },
      explainer: { explain: async (state) => `Found ${state.searchResults.length} products` },
    });

    const final = await graph.invoke({
      customerPhone: "+212600000000",
      conversationId: "conv-1",
      rawMessage: "cherche huile d'argan",
    });

    expect(final.intent).toBe("search");
    expect(final.searchResults).toEqual(results);
    expect(final.explanation).toBe("Found 1 products");
    expect(final.order).toBeNull();
    expect(final.report).toBe("intent=search | results=1");
    expect(final.messages).toEqual([
      { role: "user", content: "cherche huile d'argan" },
      { role: "assistant", content: "Found 1 products" },
    ]);
  });

  it("routes a valid checkout through the validator and checkout node to a report", async () => {
    const order: KenzaOrderResult = { orderId: "order-1", status: "en préparation", totalMad: 300 };

    const graph = buildKenzaGraph({
      classifier: { classify: async () => "checkout" },
      validator: { getStock: async () => [{ id: "p1", stock: 5 }] },
      checkout: { placeOrder: async () => order },
    });

    const final = await graph.invoke({
      customerPhone: "+212600000000",
      conversationId: "conv-2",
      rawMessage: "je veux commander",
      cart: [{ productId: "p1", quantity: 2 }],
    });

    expect(final.validation).toEqual({ valid: true, issues: [] });
    expect(final.order).toEqual(order);
    expect(final.report).toBe("intent=checkout | validation=ok | order=order-1");
  });

  it("routes an invalid checkout to the explainer instead of placing an order", async () => {
    const graph = buildKenzaGraph({
      classifier: { classify: async () => "checkout" },
      validator: { getStock: async () => [{ id: "p1", stock: 1 }] },
      explainer: { explain: async () => "Il ne reste pas assez de stock" },
    });

    const final = await graph.invoke({
      customerPhone: "+212600000000",
      conversationId: "conv-3",
      rawMessage: "je veux commander",
      cart: [{ productId: "p1", quantity: 5 }],
    });

    expect(final.validation).toEqual({
      valid: false,
      issues: [{ productId: "p1", requested: 5, available: 1 }],
    });
    expect(final.order).toBeNull();
    expect(final.explanation).toBe("Il ne reste pas assez de stock");
    expect(final.report).toBe("intent=checkout | validation=failed");
  });

  it("routes an unrecognized intent straight to the explainer", async () => {
    const graph = buildKenzaGraph({
      classifier: { classify: async () => "question" },
      explainer: { explain: async () => "Nos horaires sont 9h-18h" },
    });

    const final = await graph.invoke({
      customerPhone: "+212600000000",
      conversationId: "conv-4",
      rawMessage: "quels sont vos horaires ?",
    });

    expect(final.intent).toBe("question");
    expect(final.explanation).toBe("Nos horaires sont 9h-18h");
    expect(final.order).toBeNull();
    expect(final.report).toBe("intent=question");
  });
});
