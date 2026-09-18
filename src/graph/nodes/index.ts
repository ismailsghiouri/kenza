import { validateStock } from "@/domain/eligibility";
import { calculateSubtotal, applyTax, calculateTotal } from "@/domain/pricing";
import { politiqueCommerciale } from "@/db/knowledge-base";
import { logger } from "@/lib/logger";
import {
  validateDiscount as validateDiscountGuardrail,
  detectMandatoryEscalation,
} from "./guardrails";
import { validateAgainstPolicy } from "../guardrails";
import type {
  EscalationReason,
  KenzaCartItem,
  KenzaIntent,
  KenzaOrderResult,
  KenzaPricing,
  KenzaProductCandidate,
  KenzaProductResult,
  KenzaState,
  KenzaStockIssue,
  StateAnnotation,
} from "../state";

export type KenzaNodeState = typeof StateAnnotation.State;
export type KenzaNodeResult = Partial<KenzaState>;

const MAX_DISCOUNT_PERCENT = politiqueCommerciale.remise.maxPercentSansValidation;
const TAX_RATE = 0.2;
const SEARCH_RESULT_LIMIT = 5;

// ---------------------------------------------------------------------------
// 1. ingestor — normalizes the inbound WhatsApp message (darija/français/arabe)
//    into the conversation history
// ---------------------------------------------------------------------------

export function ingestorNode(state: KenzaNodeState): KenzaNodeResult {
  logger.info("ingestor: message reçu", { conversationId: state.conversationId });

  return {
    messages: [{ role: "user", content: state.rawMessage }],
  };
}

// ---------------------------------------------------------------------------
// 2. classifier — labels the customer's intent using Claude, grounded in
//    the store's own policy/FAQ docs as few-shot context (darija/fr/ar)
// ---------------------------------------------------------------------------

export interface ClassifierResult {
  intent: KenzaIntent;
  confidence: number;
}

export interface ClassifierDeps {
  classify: (message: string) => Promise<ClassifierResult>;
}

const KNOWN_INTENTS: readonly KenzaIntent[] = [
  "search",
  "add_to_cart",
  "checkout",
  "apply_discount",
  "product_info",
  "escalation",
  "question",
  "unknown",
];

// Few-shot examples spanning darija, français and arabe — derived from the
// scenarios actually covered in politique-commerciale.md / faq-boutique.md
// (no separate "40 conversations" export exists in this repo).
const CLASSIFIER_FEW_SHOT_EXAMPLES: ReadonlyArray<{ message: string; intent: KenzaIntent }> = [
  { message: "3andkom caftan f lakhdar bach l3ars?", intent: "search" },
  { message: "Vous avez des blousons en cuir taille 42 ?", intent: "search" },
  { message: "هل عندكم جلابة نسائية مقاس L؟", intent: "search" },
  { message: "zid liya 2 dial had l'sac dial ref REF-0032", intent: "add_to_cart" },
  { message: "Ajoutez-moi une paire en 40 au panier", intent: "add_to_cart" },
  { message: "أريد أن أشتري هذا القميص، أضفه للسلة", intent: "add_to_cart" },
  { message: "Wach mizanya, bghit nkhelles daba", intent: "checkout" },
  { message: "Je valide ma commande, comment je paye ?", intent: "checkout" },
  { message: "أريد إتمام الطلب والدفع عند التسليم", intent: "checkout" },
  { message: "3tini remise 20% ela had commande", intent: "apply_discount" },
  { message: "Vous pouvez me faire une remise de 15% ?", intent: "apply_discount" },
  { message: "هل يمكن تخفيض السعر 25 بالمئة؟", intent: "apply_discount" },
  { message: "Chhal delai reassort dial had l'article?", intent: "product_info" },
  { message: "C'est quelle matière, coton ou polyester ?", intent: "product_info" },
  { message: "ما هي مدة الضمان على هذا المنتج؟", intent: "product_info" },
  { message: "Bghit nfacturi b ism société dyalna", intent: "escalation" },
  { message: "J'ai une réclamation, ma commande précédente n'est jamais arrivée", intent: "escalation" },
  { message: "أريد استرجاع المبلغ نقدا", intent: "escalation" },
  { message: "Chhal l'horaire dial l'boutique?", intent: "question" },
  { message: "Est-ce que vous livrez à l'international ?", intent: "question" },
  { message: "هل يمكن الاستلام من المتجر؟", intent: "question" },
];

function buildClassifierPrompt(message: string): string {
  const fewShot = CLASSIFIER_FEW_SHOT_EXAMPLES.map(
    (example) => `Message: "${example.message}"\nIntent: ${example.intent}`,
  ).join("\n\n");

  return [
    "Tu es le classifieur d'intention de Kenza, un agent WhatsApp pour une boutique marocaine.",
    "Les clients écrivent en darija (translittérée), en français ou en arabe.",
    `Classe le message dans exactement un de ces intents : ${KNOWN_INTENTS.join(", ")}.`,
    "",
    "Exemples :",
    fewShot,
    "",
    `Message: "${message}"`,
    "",
    'Réponds uniquement avec un JSON compact: {"intent": "...", "confidence": 0.0-1.0}',
  ].join("\n");
}

async function defaultClassify(message: string): Promise<ClassifierResult> {
  const { getAnthropicClient, CLAUDE_MODEL } = await import("@/lib/claude");

  const response = await getAnthropicClient().messages.create({
    model: CLAUDE_MODEL,
    max_tokens: 64,
    messages: [{ role: "user", content: buildClassifierPrompt(message) }],
  });

  const textBlock = response.content.find((block) => block.type === "text");
  const raw = textBlock?.type === "text" ? textBlock.text.trim() : "";

  try {
    const parsed = JSON.parse(raw) as { intent?: string; confidence?: number };
    const intent = (KNOWN_INTENTS as readonly string[]).includes(parsed.intent ?? "")
      ? (parsed.intent as KenzaIntent)
      : "unknown";
    const confidence =
      typeof parsed.confidence === "number" ? Math.min(1, Math.max(0, parsed.confidence)) : 0;
    return { intent, confidence };
  } catch {
    logger.warn("classifier: réponse non-JSON, fallback vers unknown", { raw });
    return { intent: "unknown", confidence: 0 };
  }
}

export function createClassifierNode(deps: Partial<ClassifierDeps> = {}) {
  const classify = deps.classify ?? defaultClassify;

  return async function classifierNode(state: KenzaNodeState): Promise<KenzaNodeResult> {
    const { intent, confidence } = await classify(state.rawMessage);
    logger.info("classifier: intention détectée", { intent, confidence });

    return { intent, intentConfidence: confidence };
  };
}

// ---------------------------------------------------------------------------
// 3. search — looks up matching products in the real catalogue (80 produits)
// ---------------------------------------------------------------------------

export interface SearchDeps {
  search: (query: string) => Promise<{
    results: KenzaProductResult[];
    candidates: KenzaProductCandidate[];
  }>;
}

async function defaultSearch(query: string): Promise<{
  results: KenzaProductResult[];
  candidates: KenzaProductCandidate[];
}> {
  const { db } = await import("@/db/client");
  const { products } = await import("@/db/schema");
  const { ilike } = await import("drizzle-orm");

  const rows = await db
    .select()
    .from(products)
    .where(ilike(products.modele, `%${query}%`))
    .limit(SEARCH_RESULT_LIMIT);

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

export function createSearchNode(deps: Partial<SearchDeps> = {}) {
  const search = deps.search ?? defaultSearch;

  return async function searchNode(state: KenzaNodeState): Promise<KenzaNodeResult> {
    const { results, candidates } = await search(state.rawMessage);
    logger.info("search: produits trouvés", { count: results.length });

    return { searchResults: results, productCandidates: candidates };
  };
}

// ---------------------------------------------------------------------------
// 4. validator — valide stock, remise (max 10%, sinon escalade) et panier
// ---------------------------------------------------------------------------

export interface ValidatorDeps {
  getStock: (productIds: string[]) => Promise<Array<{ id: string; stock: number }>>;
  getCustomerVille: (customerPhone: string) => Promise<string | null>;
  getKnownVilles: () => Promise<string[]>;
}

async function defaultGetStock(productIds: string[]): Promise<Array<{ id: string; stock: number }>> {
  if (productIds.length === 0) {
    return [];
  }

  const { db } = await import("@/db/client");
  const { products } = await import("@/db/schema");
  const { inArray } = await import("drizzle-orm");

  const rows = await db.select().from(products).where(inArray(products.ref, productIds));
  return rows.map((row) => ({ id: row.ref, stock: row.stock }));
}

async function defaultGetCustomerVille(customerPhone: string): Promise<string | null> {
  const { db } = await import("@/db/client");
  const { customers } = await import("@/db/schema");
  const { eq } = await import("drizzle-orm");

  const [customer] = await db
    .select()
    .from(customers)
    .where(eq(customers.telephone, customerPhone));
  return customer?.ville ?? null;
}

async function defaultGetKnownVilles(): Promise<string[]> {
  const { db } = await import("@/db/client");
  const { deliveryZones } = await import("@/db/schema");

  const rows = await db.select({ ville: deliveryZones.ville }).from(deliveryZones);
  return rows.map((row) => row.ville);
}

export function createValidatorNode(deps: Partial<ValidatorDeps> = {}) {
  const getStock = deps.getStock ?? defaultGetStock;
  const getCustomerVille = deps.getCustomerVille ?? defaultGetCustomerVille;
  const getKnownVilles = deps.getKnownVilles ?? defaultGetKnownVilles;

  return async function validatorNode(state: KenzaNodeState): Promise<KenzaNodeResult> {
    const escalationReasons: EscalationReason[] = [];

    const cartCheck = state.cart.length === 0 ? { valid: false, errors: ["Cart is empty"] } : null;

    const stockIssues: KenzaStockIssue[] = [];
    if (state.cart.length > 0) {
      const stock = await getStock(state.cart.map((item) => item.productId));
      const stockById = new Map(stock.map((row) => [row.id, row.stock]));

      for (const item of state.cart) {
        const available = stockById.get(item.productId) ?? 0;
        const result = validateStock(available, item.quantity);
        if (!result.valid) {
          stockIssues.push({ productId: item.productId, requested: item.quantity, available });
        }
      }
      if (stockIssues.length > 0) escalationReasons.push("out_of_stock");
    }

    for (const item of state.cart) {
      if (item.discountPercent === undefined) continue;
      const violation = validateDiscountGuardrail(item.discountPercent, MAX_DISCOUNT_PERCENT);
      if (violation) {
        escalationReasons.push("low_discount");
        break;
      }
    }

    if (state.cart.length > 0) {
      const ville = await getCustomerVille(state.customerPhone);
      const knownVilles = await getKnownVilles();
      if (!ville || !knownVilles.includes(ville)) {
        escalationReasons.push("delivery_unavailable");
      }
    }

    const valid = !cartCheck && stockIssues.length === 0 && escalationReasons.length === 0;

    logger.info("validator: panier validé", {
      valid,
      stockIssues: stockIssues.length,
      escalationReasons,
    });

    return {
      validation: { valid, issues: stockIssues },
      requiresEscalation: escalationReasons.length > 0,
      escalationReasons,
    };
  };
}

// ---------------------------------------------------------------------------
// 5. calculator — subtotal, TVA (20%), livraison (livraison.csv) et
//    promotions (promotions.csv) -> met à jour le total du panier
// ---------------------------------------------------------------------------

export interface CalculatorDeps {
  calculate: (cart: KenzaCartItem[], customerPhone: string) => Promise<{
    cart: KenzaCartItem[];
    pricing: KenzaPricing;
  }>;
}

async function defaultCalculate(
  cart: KenzaCartItem[],
  customerPhone: string,
): Promise<{ cart: KenzaCartItem[]; pricing: KenzaPricing }> {
  const { db } = await import("@/db/client");
  const { products, promotions, customers, deliveryZones } = await import("@/db/schema");
  const { inArray, eq } = await import("drizzle-orm");

  const refs = cart.map((item) => item.productId);

  const productRows = refs.length > 0
    ? await db.select().from(products).where(inArray(products.ref, refs))
    : [];
  const productByRef = new Map(productRows.map((row) => [row.ref, row]));

  const promotionRows = refs.length > 0
    ? await db.select().from(promotions).where(inArray(promotions.ref, refs))
    : [];
  const now = new Date();
  const activePromoByRef = new Map(
    promotionRows
      .filter((promo) => promo.debut <= now && now <= promo.fin)
      .map((promo) => [promo.ref, promo.prixPromoMad]),
  );

  const pricedCart: KenzaCartItem[] = cart.map((item) => {
    const product = productByRef.get(item.productId);
    const catalogPrice = product?.prixMad ?? item.unitPriceMad ?? 0;
    const promoPrice = activePromoByRef.get(item.productId);
    const effectivePrice = promoPrice !== undefined ? Math.min(promoPrice, catalogPrice) : catalogPrice;
    const name = item.name ?? product?.modele;
    const size = item.size ?? product?.taille;

    return {
      ...item,
      ...(name !== undefined ? { name } : {}),
      ...(size !== undefined ? { size } : {}),
      unitPriceMad: effectivePrice,
    };
  });

  const subtotalMad = calculateSubtotal(
    pricedCart.map((item) => ({ price: item.unitPriceMad ?? 0, quantity: item.quantity })),
  );

  const discountMad = pricedCart.reduce((total, item) => {
    if (!item.discountPercent) return total;
    const lineTotal = (item.unitPriceMad ?? 0) * item.quantity;
    return total + (lineTotal * item.discountPercent) / 100;
  }, 0);

  const [customer] = await db
    .select()
    .from(customers)
    .where(eq(customers.telephone, customerPhone));

  let deliveryFeeMad = 0;
  if (customer) {
    const [zone] = await db
      .select()
      .from(deliveryZones)
      .where(eq(deliveryZones.ville, customer.ville));
    deliveryFeeMad = zone?.fraisMad ?? 0;
  }

  const taxMad = applyTax(subtotalMad - discountMad, TAX_RATE);
  const totalMad = calculateTotal(subtotalMad, taxMad, deliveryFeeMad, discountMad);

  return {
    cart: pricedCart,
    pricing: { subtotalMad, taxMad, deliveryFeeMad, discountMad, totalMad },
  };
}

export function createCalculatorNode(deps: Partial<CalculatorDeps> = {}) {
  const calculate = deps.calculate ?? defaultCalculate;

  return async function calculatorNode(state: KenzaNodeState): Promise<KenzaNodeResult> {
    if (state.cart.length === 0) {
      return {};
    }

    const { cart, pricing } = await calculate(state.cart, state.customerPhone);
    logger.info("calculator: total calculé", { pricing });

    return { cart, pricing };
  };
}

// ---------------------------------------------------------------------------
// 6. explainer — forge la réponse (darija/français), détaille prix/frais/
//    remise et détecte les escalades
// ---------------------------------------------------------------------------

export interface ExplainerDeps {
  explain: (state: KenzaNodeState) => Promise<string>;
}

function formatPricingBreakdown(pricing: KenzaPricing): string {
  const parts = [`Sous-total: ${pricing.subtotalMad} MAD`];
  if (pricing.discountMad > 0) parts.push(`Remise: -${pricing.discountMad} MAD`);
  parts.push(`TVA (20%): ${pricing.taxMad} MAD`);
  parts.push(`Livraison: ${pricing.deliveryFeeMad} MAD`);
  parts.push(`Total: ${pricing.totalMad} MAD`);
  return parts.join(" | ");
}

async function defaultExplain(state: KenzaNodeState): Promise<string> {
  if (state.requiresEscalation) {
    return "Votre demande nécessite une validation par notre équipe. Nous revenons vers vous rapidement (in raje3 lik l'équipe f wa9tha).";
  }

  const { getAnthropicClient, CLAUDE_MODEL } = await import("@/lib/claude");

  const context = JSON.stringify({
    intent: state.intent,
    rawMessage: state.rawMessage,
    searchResults: state.searchResults,
    validation: state.validation,
    pricing: state.pricing,
  });

  const response = await getAnthropicClient().messages.create({
    model: CLAUDE_MODEL,
    max_tokens: 512,
    messages: [
      {
        role: "user",
        content: `Tu es Kenza, un agent WhatsApp pour une boutique marocaine. Réponds en darija ou en français selon la langue du client, de façon courte et amicale, en détaillant le prix/les frais/la remise si présents dans ce contexte:\n${context}${state.pricing ? `\n\nDétail: ${formatPricingBreakdown(state.pricing)}` : ""}`,
      },
    ],
  });

  const textBlock = response.content.find((block) => block.type === "text");
  return textBlock?.type === "text" ? textBlock.text : "";
}

export function createExplainerNode(deps: Partial<ExplainerDeps> = {}) {
  const explain = deps.explain ?? defaultExplain;

  return async function explainerNode(state: KenzaNodeState): Promise<KenzaNodeResult> {
    const escalationReasons = [...state.escalationReasons];
    const keywordEscalation = detectMandatoryEscalation(state.rawMessage);
    if (keywordEscalation) escalationReasons.push("policy_violation");
    if (state.intent === "escalation" && !escalationReasons.includes("policy_violation")) {
      escalationReasons.push("policy_violation");
    }

    const requiresEscalation = state.requiresEscalation || escalationReasons.length > 0;
    const nextState = { ...state, requiresEscalation, escalationReasons };

    const explanation = await explain(nextState);

    // Final gate: validate the drafted decision against politique-commerciale.md
    // before it reaches the customer.
    const policyCheck = validateAgainstPolicy({ ...nextState, explanation });
    for (const violation of policyCheck.violations) {
      if (!escalationReasons.includes(violation as EscalationReason)) {
        escalationReasons.push(violation as EscalationReason);
      }
    }

    const finalRequiresEscalation = requiresEscalation || !policyCheck.valid;
    const finalExplanation = policyCheck.valid
      ? explanation
      : "Votre demande nécessite une validation par notre équipe. Nous revenons vers vous rapidement (in raje3 lik l'équipe f wa9tha).";

    logger.info("explainer: réponse générée", {
      requiresEscalation: finalRequiresEscalation,
      violations: policyCheck.violations,
    });

    return {
      explanation: finalExplanation,
      requiresEscalation: finalRequiresEscalation,
      escalationReasons,
      messages: [{ role: "assistant", content: finalExplanation }],
    };
  };
}

// ---------------------------------------------------------------------------
// 7. checkout — place la commande une fois le panier validé et calculé
// ---------------------------------------------------------------------------

export interface CheckoutDeps {
  placeOrder: (
    cart: KenzaCartItem[],
    customerPhone: string,
    pricing: KenzaPricing | null,
  ) => Promise<KenzaOrderResult>;
}

async function defaultPlaceOrder(
  cart: KenzaCartItem[],
  customerPhone: string,
  pricing: KenzaPricing | null,
): Promise<KenzaOrderResult> {
  const { db } = await import("@/db/client");
  const { customers, deliveryZones, orders, orderItems } = await import("@/db/schema");
  const { eq } = await import("drizzle-orm");

  const [customer] = await db
    .select()
    .from(customers)
    .where(eq(customers.telephone, customerPhone));
  if (!customer) {
    throw new Error(`Unknown customer phone: ${customerPhone}`);
  }

  const totalArticlesMad =
    pricing?.subtotalMad ??
    calculateSubtotal(cart.map((item) => ({ price: item.unitPriceMad ?? 0, quantity: item.quantity })));

  const [zone] = await db
    .select()
    .from(deliveryZones)
    .where(eq(deliveryZones.ville, customer.ville));
  const fraisLivraisonMad = pricing?.deliveryFeeMad ?? zone?.fraisMad ?? 0;
  const totalMad = pricing?.totalMad ?? totalArticlesMad + fraisLivraisonMad;

  const [order] = await db
    .insert(orders)
    .values({
      commandeId: `CMD-${crypto.randomUUID()}`,
      clientId: customer.clientId,
      date: new Date(),
      canal: "whatsapp",
      statut: "en préparation",
      totalArticlesMad,
      fraisLivraisonMad,
      totalMad,
      villeLivraison: customer.ville,
      paiement: zone?.paiementALaLivraison ? "à la livraison" : "carte",
    })
    .returning();

  if (!order) {
    throw new Error("Failed to create order");
  }

  await db.insert(orderItems).values(
    cart.map((item) => ({
      commandeId: order.commandeId,
      ref: item.productId,
      modele: item.name ?? "",
      taille: item.size ?? "",
      quantite: item.quantity,
      prixUnitaireMad: item.unitPriceMad ?? 0,
    })),
  );

  return { orderId: order.commandeId, status: order.statut, totalMad: order.totalMad };
}

export function createCheckoutNode(deps: Partial<CheckoutDeps> = {}) {
  const placeOrder = deps.placeOrder ?? defaultPlaceOrder;

  return async function checkoutNode(state: KenzaNodeState): Promise<KenzaNodeResult> {
    const order = await placeOrder(state.cart, state.customerPhone, state.pricing);
    logger.info("checkout: commande créée", { orderId: order.orderId });

    return { order };
  };
}

// ---------------------------------------------------------------------------
// 8. reporter — crée le bon de commande (résumé debug + confirmation client)
// ---------------------------------------------------------------------------

export function reporterNode(state: KenzaNodeState): KenzaNodeResult {
  const parts = [`intent=${state.intent}`];

  if (state.searchResults.length > 0) {
    parts.push(`results=${state.searchResults.length}`);
  }
  if (state.validation) {
    parts.push(`validation=${state.validation.valid ? "ok" : "failed"}`);
  }
  if (state.order) {
    parts.push(`order=${state.order.orderId}`);
  }

  const report = parts.join(" | ");

  if (!state.order) {
    return { report };
  }

  const confirmation = `Commande confirmée #${state.order.orderId} — total ${state.order.totalMad} MAD.`;
  logger.info("reporter: bon de commande émis", { orderId: state.order.orderId });

  return {
    report,
    messages: [{ role: "assistant", content: confirmation }],
  };
}

export interface KenzaGraphDeps {
  classifier: Partial<ClassifierDeps>;
  search: Partial<SearchDeps>;
  validator: Partial<ValidatorDeps>;
  calculator: Partial<CalculatorDeps>;
  explainer: Partial<ExplainerDeps>;
  checkout: Partial<CheckoutDeps>;
}
