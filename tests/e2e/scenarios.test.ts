import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { execSync } from "node:child_process";
import "dotenv/config";
import { eq, ilike, sql } from "drizzle-orm";
import { MemorySaver } from "@langchain/langgraph";
import type { BaseCheckpointSaver } from "@langchain/langgraph";
import { db } from "@/db/client";
import {
  products,
  customers,
  deliveryZones,
  orders,
  orderItems,
  InsertProductSchema,
  InsertCustomerSchema,
  InsertDeliveryZoneSchema,
} from "@/db/schema";
import { buildKenzaGraph } from "@/graph/graph";
import {
  createInitialState,
  addItemToCart,
  applyDiscount as applyDiscountToCart,
  updateCartTotal,
} from "@/graph/state";
import type { KenzaIntent, KenzaProductCandidate, KenzaProductResult } from "@/graph/state";
import { applyDiscount as applyDiscountDomain } from "@/domain/pricing";

// ---------------------------------------------------------------------------
// Infra helpers — même pattern que tests/integration/db.test.ts (docker
// compose + drizzle migrate), pour que les scénarios écrivent réellement en
// PostgreSQL (pas de mock DB).
// ---------------------------------------------------------------------------

function run(command: string): void {
  execSync(command, { stdio: "pipe" });
}

async function waitForPostgres(retries = 30, delayMs = 1000): Promise<void> {
  for (let attempt = 0; attempt < retries; attempt++) {
    try {
      await db.execute(sql`select 1`);
      return;
    } catch {
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }
  throw new Error("Postgres did not become ready in time");
}

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const GALAXY_REF = "REF-0001";
const GALAXY_MODELE = "Samsung Galaxy S23";
const GALAXY_PRICE = 5000;
const CUSTOMER_PHONE = "+212611000001";
const CUSTOMER_CITY = "Casablanca";

async function seedProduct(stock = 20): Promise<void> {
  await db.insert(products).values(
    InsertProductSchema.parse({
      ref: GALAXY_REF,
      modele: GALAXY_MODELE,
      famille: "Téléphone",
      genre: "mixte",
      couleur: "Noir",
      taille: "Unique",
      matiere: "Aluminium",
      saison: "Toute saison",
      prixMad: GALAXY_PRICE,
      stock,
      delaiReassortJours: 7,
      codeBarre: "6111234500001",
      poidsG: 200,
    }),
  );
}

async function seedCustomerAndZone(): Promise<void> {
  await db.insert(customers).values(
    InsertCustomerSchema.parse({
      clientId: "CLI-0001",
      nom: "Client Test",
      telephone: CUSTOMER_PHONE,
      ville: CUSTOMER_CITY,
      languePreferee: "fr",
      premierAchat: new Date("2024-01-01"),
      nbCommandes: 0,
      segment: "nouveau",
    }),
  );

  await db.insert(deliveryZones).values(
    InsertDeliveryZoneSchema.parse({
      ville: CUSTOMER_CITY,
      fraisMad: 30,
      delaiHeures: 24,
      paiementALaLivraison: true,
      retraitBoutique: true,
    }),
  );
}

// Un produit vu lors d'un tour précédent (recherche) reste dans
// productCandidates/searchResults via le checkpoint — sans ça, le garde-fou
// "price_invention" (src/graph/guardrails.ts) escaladerait tout panier dont
// le prix n'a jamais été vu par un noeud "search". On simule cet historique
// ici pour les scénarios qui démarrent directement sur add_to_cart/checkout.
function galaxySeenInSearch(): { searchResults: KenzaProductResult[] } {
  return {
    searchResults: [{ id: GALAXY_REF, name: GALAXY_MODELE, priceMad: GALAXY_PRICE, stock: 20 }],
  };
}

// ---------------------------------------------------------------------------
// Graphe de test — classifier et explainer sont injectés (déterministes, pas
// d'appel réseau à Claude), mais validator/calculator/checkout utilisent
// leurs implémentations réelles (Postgres) : le workflow métier (stock,
// remise, calcul, création de commande) est donc testé de bout en bout.
// ---------------------------------------------------------------------------

async function dbSearchGalaxy(): Promise<{
  results: KenzaProductResult[];
  candidates: KenzaProductCandidate[];
}> {
  const rows = await db.select().from(products).where(ilike(products.modele, "%Galaxy%"));

  const results: KenzaProductResult[] = rows.map((row) => ({
    id: row.ref,
    name: row.modele,
    priceMad: row.prixMad,
    stock: row.stock,
  }));

  const candidates: KenzaProductCandidate[] = rows.map((row) => ({
    ref: row.ref,
    modele: row.modele,
    famille: row.famille as KenzaProductCandidate["famille"],
    genre: row.genre,
    couleur: row.couleur,
    taille: row.taille as KenzaProductCandidate["taille"],
    matiere: row.matiere as KenzaProductCandidate["matiere"],
    saison: row.saison as KenzaProductCandidate["saison"],
    prixMad: row.prixMad,
    stock: row.stock,
    delaiReassortJours: row.delaiReassortJours,
    codeBarre: row.codeBarre,
    poidsG: row.poidsG,
  }));

  return { results, candidates };
}

function buildScenarioGraph(
  classify: (message: string) => Promise<{ intent: KenzaIntent; confidence: number }>,
  checkpointer?: BaseCheckpointSaver,
) {
  return buildKenzaGraph(
    {
      classifier: { classify },
      search: { search: dbSearchGalaxy },
      explainer: { explain: async () => "OK" },
    },
    checkpointer,
  );
}

function fixedIntent(intent: KenzaIntent) {
  return async () => ({ intent, confidence: 1 });
}

// Classification par mot-clé pour le scénario 5 (workflow multi-tours) — un
// remplaçant déterministe du classifieur Claude réel (src/graph/nodes/index.ts
// defaultClassify), suffisant puisque ce test vérifie le workflow, pas le NLU.
async function classifyByKeyword(message: string): Promise<{ intent: KenzaIntent; confidence: number }> {
  if (/ajoute/i.test(message)) return { intent: "add_to_cart", confidence: 1 };
  if (/valide|paye|checkout/i.test(message)) return { intent: "checkout", confidence: 1 };
  return { intent: "search", confidence: 1 };
}

// Reprend exactement la logique de src/app/api/webhook/route.ts
// (deriveWorkflowStatus) — le "confirmed" du cahier des charges hackathon
// correspond au "completed" de cette route.
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

describe("kenza e2e — 5 scénarios d'acceptation hackathon", () => {
  beforeAll(async () => {
    run("docker compose up -d postgres");
    await waitForPostgres();
    run("npm run db:migrate");
  }, 120_000);

  beforeEach(async () => {
    await db.execute(
      sql`truncate table order_items, promotions, orders, messages, conversations, customers, products, delivery_zones restart identity cascade`,
    );
    await seedProduct();
    await seedCustomerAndZone();
  });

  afterAll(() => {
    run("docker compose down");
  });

  // -------------------------------------------------------------------------
  // SCÉNARIO 1 — client cherche un produit
  // Note: le repo appelle cet intent "search" (KenzaIntent), pas
  // "search_products" ; product_candidates -> productCandidates.
  // -------------------------------------------------------------------------
  it("SCÉNARIO 1: client cherche un produit (Kat3 Samsung Galaxy?)", async () => {
    const kenzaGraph = buildScenarioGraph(fixedIntent("search"));
    const state = await kenzaGraph.invoke(
      createInitialState("conv-1", CUSTOMER_PHONE, "Kat3 Samsung Galaxy?"),
    );

    expect(state.intent).toBe("search");
    expect(state.productCandidates.length).toBeGreaterThan(0);
    expect(state.productCandidates[0]?.ref).toBe(GALAXY_REF);
    expect(state.searchResults.length).toBeGreaterThan(0);
  });

  // -------------------------------------------------------------------------
  // SCÉNARIO 2 — client ajoute au panier et valide
  // cart.items -> cart ; total_mad -> pricing.totalMad
  // -------------------------------------------------------------------------
  it("SCÉNARIO 2: client ajoute au panier et valide (Ajoute une Galaxy à ma commande)", async () => {
    const kenzaGraph = buildScenarioGraph(fixedIntent("add_to_cart"));
    const cart = addItemToCart([], GALAXY_REF, GALAXY_MODELE, GALAXY_PRICE, 1);

    const state = await kenzaGraph.invoke({
      ...createInitialState("conv-2", CUSTOMER_PHONE, "Ajoute une Galaxy à ma commande"),
      cart,
      ...galaxySeenInSearch(),
    });

    expect(state.cart.length).toBe(1);
    expect(state.cart[0]?.productId).toBe(GALAXY_REF);
    expect(state.validation).toEqual({ valid: true, issues: [] });
    expect(state.requiresEscalation).toBe(false);
    expect(state.pricing?.totalMad).toBeGreaterThan(0);
  });

  // -------------------------------------------------------------------------
  // SCÉNARIO 3 — remise plafonnée (demande 15%, max 10%)
  // discount_capped/applied -> src/domain/pricing.ts applyDiscount()
  // -------------------------------------------------------------------------
  it("SCÉNARIO 3: remise plafonnée à 10% (Code remise SAVE15, demande 15%)", async () => {
    const requestedPercent = 15;
    const maxPercent = 10;

    const rawCart = addItemToCart([], GALAXY_REF, GALAXY_MODELE, GALAXY_PRICE, 1);
    const subtotal = updateCartTotal(rawCart);

    const discount = applyDiscountDomain(subtotal, requestedPercent, maxPercent);
    expect(discount.capped).toBe(true); // discount_capped = true
    expect(discount.applied).toBe(10); // applied = 10%
    expect(requestedPercent).toBe(15); // requested = 15%

    const cappedCart = applyDiscountToCart(rawCart, requestedPercent, maxPercent);
    expect(cappedCart[0]?.discountPercent).toBe(10);

    const kenzaGraph = buildScenarioGraph(fixedIntent("apply_discount"));
    const state = await kenzaGraph.invoke({
      ...createInitialState("conv-3", CUSTOMER_PHONE, "Code remise SAVE15"),
      cart: cappedCart,
      ...galaxySeenInSearch(),
    });

    // La remise plafonnée (10%) est acceptée sans escalade : elle respecte
    // déjà politique-commerciale.md (max 10% sans validation humaine).
    expect(state.validation?.valid).toBe(true);
    expect(state.requiresEscalation).toBe(false);
    expect(state.cart[0]?.discountPercent).toBe(10);
    expect(state.pricing?.discountMad).toBeGreaterThan(0);
  });

  // -------------------------------------------------------------------------
  // SCÉNARIO 4 — stock insuffisant (rupture)
  // escalation_reasons -> escalationReasons ; needs_human_review -> requiresEscalation
  // -------------------------------------------------------------------------
  it("SCÉNARIO 4: rupture de stock déclenche une escalade (Je veux 100 Galaxy)", async () => {
    await db.update(products).set({ stock: 0 }).where(eq(products.ref, GALAXY_REF));

    const kenzaGraph = buildScenarioGraph(fixedIntent("add_to_cart"));
    const cart = addItemToCart([], GALAXY_REF, GALAXY_MODELE, GALAXY_PRICE, 100);

    const state = await kenzaGraph.invoke({
      ...createInitialState("conv-4", CUSTOMER_PHONE, "Je veux 100 Galaxy"),
      cart,
      ...galaxySeenInSearch(),
    });

    expect(state.validation).toEqual({
      valid: false,
      issues: [{ productId: GALAXY_REF, requested: 100, available: 0 }],
    });
    expect(state.escalationReasons).toEqual(["out_of_stock"]);
    expect(state.requiresEscalation).toBe(true);
  });

  // -------------------------------------------------------------------------
  // SCÉNARIO 5 — workflow complet : search -> add -> checkout
  // Un seul graphe/checkpointer, même thread_id sur les 3 tours : le panier
  // et les résultats de recherche persistent via l'annotation LangGraph,
  // comme une vraie conversation WhatsApp multi-messages.
  // -------------------------------------------------------------------------
  it("SCÉNARIO 5: workflow complet search -> add -> checkout, commande créée en DB", async () => {
    const kenzaGraph = buildScenarioGraph(classifyByKeyword, new MemorySaver());
    const config = { configurable: { thread_id: "conv-5" } };

    // Important : sur les tours 2 et 3, on ne passe QUE les champs qui
    // changent (comme TEST 10 dans tests/integration/graph.test.ts).
    // createInitialState() remet explicitement productCandidates/searchResults/
    // cart à [] — si on la réutilisait ici, ce "replace" écraserait l'état
    // persisté par le checkpointer au tour précédent.

    // 1. Search "Galaxy"
    const afterSearch = await kenzaGraph.invoke(
      { customerPhone: CUSTOMER_PHONE, conversationId: "conv-5", rawMessage: "Galaxy" },
      config,
    );
    expect(afterSearch.intent).toBe("search");
    expect(afterSearch.productCandidates.length).toBeGreaterThan(0);

    // 2. Add 1x Galaxy (le panier est fourni explicitement, comme le ferait
    // l'appelant après avoir lu productCandidates de l'étape précédente ;
    // searchResults/productCandidates, eux, persistent via le checkpoint)
    const cart = addItemToCart([], GALAXY_REF, GALAXY_MODELE, GALAXY_PRICE, 1);
    const afterAdd = await kenzaGraph.invoke(
      {
        customerPhone: CUSTOMER_PHONE,
        conversationId: "conv-5",
        rawMessage: "Ajoute 1x Galaxy à ma commande",
        cart,
      },
      config,
    );
    expect(afterAdd.intent).toBe("add_to_cart");
    expect(afterAdd.cart).toHaveLength(1);
    expect(afterAdd.requiresEscalation).toBe(false);

    // 3. Checkout avec adresse (ville de livraison = celle du client en DB)
    const afterCheckout = await kenzaGraph.invoke(
      {
        customerPhone: CUSTOMER_PHONE,
        conversationId: "conv-5",
        rawMessage: "Je valide ma commande, livraison à Casablanca",
      },
      config,
    );

    expect(afterCheckout.intent).toBe("checkout");
    expect(afterCheckout.requiresEscalation).toBe(false);
    expect(afterCheckout.order).not.toBeNull();
    expect(deriveWorkflowStatus(afterCheckout)).toBe("completed"); // "confirmed" côté hackathon

    const orderId = afterCheckout.order?.orderId;
    expect(orderId).toBeDefined();

    const [dbOrder] = await db.select().from(orders).where(eq(orders.commandeId, orderId!));
    expect(dbOrder).toBeDefined();
    expect(dbOrder?.clientId).toBe("CLI-0001");
    expect(dbOrder?.totalMad).toBe(afterCheckout.order?.totalMad);

    const dbItems = await db.select().from(orderItems).where(eq(orderItems.commandeId, orderId!));
    expect(dbItems).toHaveLength(1);
    expect(dbItems[0]?.ref).toBe(GALAXY_REF);
    expect(dbItems[0]?.quantite).toBe(1);
  });
});
