import { describe, it, expect } from "vitest";
import "dotenv/config";
import { MemorySaver } from "@langchain/langgraph";
import { buildKenzaGraph } from "@/graph/graph";
import {
  createInitialState,
  addItemToCart,
  applyDiscount as applyDiscountToCart,
} from "@/graph/state";
import type {
  KenzaOrderResult,
  KenzaProductCandidate,
  KenzaProductResult,
  KenzaState,
} from "@/graph/state";
import {
  ingestorNode,
  createClassifierNode,
  createSearchNode,
  createValidatorNode,
} from "@/graph/nodes";
import { applyDiscount as applyDiscountDomain } from "@/domain/pricing";

// Helper: builds a full KenzaNodeState by layering partial overrides onto
// createInitialState(), since nodes are called directly (bypassing the
// graph) in several tests below.
function makeState(overrides: Partial<KenzaState> = {}): KenzaState {
  return {
    ...createInitialState("conv-test", "+212600000000", "message de test"),
    ...overrides,
  };
}

describe("kenza StateGraph — compilation & state", () => {
  it("TEST 1: le graphe se compile sans erreur", () => {
    expect(() => buildKenzaGraph()).not.toThrow();

    const graph = buildKenzaGraph();
    expect(graph).toBeDefined();
    expect(typeof graph.invoke).toBe("function");
  });

  it("TEST 2: l'état initial est valide", () => {
    const state = createInitialState("conv-1", "+212600000000", "Salam, bghit ncommandi");

    expect(state.conversationId).toBe("conv-1");
    expect(state.customerPhone).toBe("+212600000000");
    expect(state.rawMessage).toBe("Salam, bghit ncommandi");
    expect(state.messages).toEqual([]);
    expect(state.intent).toBe("unknown");
    expect(state.intentConfidence).toBe(0);
    expect(state.cart).toEqual([]);
    expect(state.searchResults).toEqual([]);
    expect(state.productCandidates).toEqual([]);
    expect(state.validation).toBeNull();
    expect(state.pricing).toBeNull();
    expect(state.order).toBeNull();
    expect(state.requiresEscalation).toBe(false);
    expect(state.escalationReasons).toEqual([]);
    expect(state.error).toBeNull();
  });
});

describe("kenza StateGraph — nodes unitaires (deps injectées, pas d'appel réseau/DB)", () => {
  it("TEST 3: nodeIngestor ajoute le message à l'historique", () => {
    const state = makeState({ rawMessage: "Kat3 Galaxy?", messages: [] });

    const result = ingestorNode(state);

    expect(result.messages).toEqual([{ role: "user", content: "Kat3 Galaxy?" }]);
  });

  it('TEST 4: nodeClassifier classifie "Kat3 Galaxy?" comme une recherche produit', async () => {
    // Le Claude API réel n'est pas appelé ici : la dépendance `classify` est
    // injectée (voir ClassifierDeps dans src/graph/nodes/index.ts).
    // Note : le type KenzaIntent du repo n'a pas de valeur "search_products",
    // l'intent recherche produit s'appelle "search".
    const classifierNode = createClassifierNode({
      classify: async (message) => {
        expect(message).toBe("Kat3 Galaxy?");
        return { intent: "search", confidence: 0.92 };
      },
    });

    const state = makeState({ rawMessage: "Kat3 Galaxy?" });
    const result = await classifierNode(state);

    expect(result.intent).toBe("search");
    expect(result.intentConfidence).toBe(0.92);
  });

  it("TEST 5: nodeSearch retourne les produits candidats", async () => {
    const results: KenzaProductResult[] = [
      { id: "p1", name: "Kaftan Galaxy", priceMad: 450, stock: 10 },
    ];
    const candidates: KenzaProductCandidate[] = [
      {
        ref: "p1",
        modele: "Kaftan Galaxy",
        famille: "Caftan",
        genre: "femme",
        couleur: "Bleu",
        taille: "M",
        matiere: "soie",
        saison: "été",
        prixMad: 450,
        stock: 10,
        delaiReassortJours: 7,
        codeBarre: "6111234567890",
        poidsG: 400,
      },
    ];

    const searchNode = createSearchNode({
      search: async () => ({ results, candidates }),
    });

    const result = await searchNode(makeState({ rawMessage: "Kat3 Galaxy?" }));

    expect(result.searchResults).toEqual(results);
    expect(result.productCandidates).toEqual(candidates);
  });

  it("TEST 6: addItemToCart ajoute l'item au panier et le validator le confirme en stock", async () => {
    const cart = addItemToCart([], "p1", "Kaftan Galaxy", 450, 2);
    expect(cart).toEqual([{ productId: "p1", name: "Kaftan Galaxy", unitPriceMad: 450, quantity: 2 }]);

    const validatorNode = createValidatorNode({
      getStock: async () => [{ id: "p1", stock: 10 }],
      getCustomerVille: async () => "Casablanca",
      getKnownVilles: async () => ["Casablanca"],
    });

    const result = await validatorNode(makeState({ cart }));

    expect(result.validation).toEqual({ valid: true, issues: [] });
    expect(result.requiresEscalation).toBe(false);
  });

  it("TEST 7: une remise de 15% est plafonnée à 10% (capped: true)", () => {
    // Couche domaine (src/domain/pricing.ts) : c'est elle qui expose le flag `capped`.
    const discount = applyDiscountDomain(1000, 15, 10);
    expect(discount).toEqual({ amount: 100, capped: true, applied: 10 });

    // Couche état (src/graph/state.ts) : applyDiscount() applique ce même
    // plafond à chaque item du panier via son discountPercent.
    const cart = [{ productId: "p1", name: "Kaftan Galaxy", unitPriceMad: 1000, quantity: 1 }];
    const discountedCart = applyDiscountToCart(cart, 15, 10);

    expect(discountedCart[0]?.discountPercent).toBe(10);
  });

  it("TEST 8: un stock à zéro déclenche une escalade out_of_stock", async () => {
    const validatorNode = createValidatorNode({
      getStock: async () => [{ id: "p1", stock: 0 }],
      getCustomerVille: async () => "Casablanca",
      getKnownVilles: async () => ["Casablanca"],
    });

    const cart = [{ productId: "p1", quantity: 1 }];
    const result = await validatorNode(makeState({ cart }));

    expect(result.validation).toEqual({
      valid: false,
      issues: [{ productId: "p1", requested: 1, available: 0 }],
    });
    expect(result.requiresEscalation).toBe(true);
    expect(result.escalationReasons).toContain("out_of_stock");
  });
});

describe("kenza StateGraph — workflow complet via le graphe compilé", () => {
  it("TEST 9: workflow complet search → add (panier) → checkout", async () => {
    const product: KenzaProductResult = { id: "p1", name: "Kaftan Galaxy", priceMad: 450, stock: 10 };

    const graph = buildKenzaGraph({
      classifier: { classify: async () => ({ intent: "search", confidence: 1 }) },
      search: { search: async () => ({ results: [product], candidates: [] }) },
      explainer: { explain: async (state) => `Found ${state.searchResults.length} products` },
    });

    const searchFinal = await graph.invoke({
      customerPhone: "+212600000000",
      conversationId: "conv-workflow",
      rawMessage: "Kat3 Galaxy?",
    });

    expect(searchFinal.intent).toBe("search");
    expect(searchFinal.searchResults).toEqual([product]);

    // "add": le client ajoute le produit trouvé à son panier (pas de node
    // dédié dans le graphe actuel — addItemToCart est le helper d'état
    // utilisé pour ça, voir TEST 6).
    const cart = addItemToCart([], product.id, product.name, product.priceMad, 1);

    const order: KenzaOrderResult = { orderId: "order-workflow", status: "en préparation", totalMad: 540 };

    const checkoutGraph = buildKenzaGraph({
      classifier: { classify: async () => ({ intent: "checkout", confidence: 1 }) },
      validator: {
        getStock: async () => [{ id: "p1", stock: 10 }],
        getCustomerVille: async () => "Casablanca",
        getKnownVilles: async () => ["Casablanca"],
      },
      calculator: {
        calculate: async (calcCart) => ({
          cart: calcCart,
          pricing: { subtotalMad: 450, taxMad: 90, deliveryFeeMad: 0, discountMad: 0, totalMad: 540 },
        }),
      },
      checkout: { placeOrder: async () => order },
    });

    const checkoutFinal = await checkoutGraph.invoke({
      customerPhone: "+212600000000",
      conversationId: "conv-workflow",
      rawMessage: "Wach mizanya, bghit nkhelles daba",
      cart,
    });

    expect(checkoutFinal.validation).toEqual({ valid: true, issues: [] });
    expect(checkoutFinal.order).toEqual(order);
    expect(checkoutFinal.report).toBe("intent=checkout | validation=ok | order=order-workflow");
  });

  it("TEST 10: l'état persiste après checkpoint (même thread_id)", async () => {
    const checkpointer = new MemorySaver();

    const graph = buildKenzaGraph(
      {
        classifier: { classify: async () => ({ intent: "question", confidence: 1 }) },
        explainer: { explain: async ({ rawMessage }) => `réponse à: ${rawMessage}` },
      },
      checkpointer,
    );

    const config = { configurable: { thread_id: "conv-checkpoint" } };

    const first = await graph.invoke(
      {
        customerPhone: "+212600000000",
        conversationId: "conv-checkpoint",
        rawMessage: "Chhal l'horaire dial l'boutique?",
      },
      config,
    );

    expect(first.messages).toEqual([
      { role: "user", content: "Chhal l'horaire dial l'boutique?" },
      { role: "assistant", content: "réponse à: Chhal l'horaire dial l'boutique?" },
    ]);

    // Deuxième invocation sur le même thread_id : le checkpointer doit
    // recharger l'historique précédent et l'annotation `messages` (reducer
    // concat) doit l'étendre au lieu de repartir de zéro.
    const second = await graph.invoke(
      {
        customerPhone: "+212600000000",
        conversationId: "conv-checkpoint",
        rawMessage: "Et livraison à Rabat ?",
      },
      config,
    );

    expect(second.messages).toEqual([
      { role: "user", content: "Chhal l'horaire dial l'boutique?" },
      { role: "assistant", content: "réponse à: Chhal l'horaire dial l'boutique?" },
      { role: "user", content: "Et livraison à Rabat ?" },
      { role: "assistant", content: "réponse à: Et livraison à Rabat ?" },
    ]);

    const checkpointState = await graph.getState(config);
    expect(checkpointState.values.messages).toHaveLength(4);
  });
});
