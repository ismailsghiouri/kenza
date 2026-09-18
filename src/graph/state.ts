import { Annotation } from "@langchain/langgraph";
import type { OrderStatus, Product } from "@/contracts";
import { applyDiscount as capDiscountPercent } from "@/domain/pricing";

export type KenzaIntent =
  | "search"
  | "add_to_cart"
  | "checkout"
  | "apply_discount"
  | "product_info"
  | "escalation"
  | "question"
  | "unknown";

export interface KenzaStockIssue {
  productId: string;
  requested: number;
  available: number;
}

export type KenzaMessageRole = "user" | "assistant";

export interface KenzaMessage {
  role: KenzaMessageRole;
  content: string;
}

// Mirrors catalogue.csv (via the canonical Product contract), plus ranking
// metadata attached by the search node.
export interface KenzaProductCandidate extends Product {
  score?: number;
  matchReason?: string;
}

// Mirrors commandes-lignes.csv (ref/modele/taille/quantite/prix_unitaire_mad).
// Only productId and quantity are required so existing Partial<KenzaState>
// call sites (graph invocations, tests) keep working without every field.
export interface KenzaCartItem {
  productId: string; // ref
  quantity: number; // quantite
  name?: string; // modele
  size?: string; // taille
  unitPriceMad?: number; // prix_unitaire_mad
  discountPercent?: number;
}

export interface KenzaProductResult {
  id: string;
  name: string;
  priceMad: number;
  stock: number;
}

export interface KenzaValidationResult {
  valid: boolean;
  issues: KenzaStockIssue[];
}

export interface KenzaOrderResult {
  orderId: string;
  status: OrderStatus;
  totalMad: number;
}

// Output of the calculator node — subtotal/TVA/livraison/promotions breakdown
// for the priced cart, ahead of order placement.
export interface KenzaPricing {
  subtotalMad: number;
  taxMad: number;
  deliveryFeeMad: number;
  discountMad: number;
  totalMad: number;
}

// Mandatory hand-off-to-human reasons, per politique-commerciale.md.
export type EscalationReason =
  | "low_discount"
  | "out_of_stock"
  | "delivery_unavailable"
  | "policy_violation"
  | "language_barrier"
  // Emitted by validateAgainstPolicy() (see ./guardrails.ts) — one per rule.
  | "price_invention"
  | "promised_restock"
  | "discount_below_threshold"
  | "delivery_city_out_of_grid"
  | "payment_method_not_allowed"
  | "exchange_policy_violation";

export interface KenzaState {
  customerPhone: string;
  conversationId: string;
  rawMessage: string;
  messages: KenzaMessage[];
  intent: KenzaIntent;
  intentConfidence: number;
  cart: KenzaCartItem[];
  searchResults: KenzaProductResult[];
  productCandidates: KenzaProductCandidate[];
  validation: KenzaValidationResult | null;
  pricing: KenzaPricing | null;
  explanation: string;
  order: KenzaOrderResult | null;
  requiresEscalation: boolean;
  escalationReasons: EscalationReason[];
  report: string;
  error: string | null;
}

export const StateAnnotation = Annotation.Root({
  customerPhone: Annotation<string>,
  conversationId: Annotation<string>,
  rawMessage: Annotation<string>,
  messages: Annotation<KenzaState["messages"]>({
    reducer: (current, update) => current.concat(update),
    default: () => [],
  }),
  intent: Annotation<KenzaState["intent"]>({
    reducer: (_current, update) => update,
    default: () => "unknown",
  }),
  intentConfidence: Annotation<KenzaState["intentConfidence"]>({
    reducer: (_current, update) => update,
    default: () => 0,
  }),
  cart: Annotation<KenzaState["cart"]>({
    reducer: (_current, update) => update,
    default: () => [],
  }),
  searchResults: Annotation<KenzaState["searchResults"]>({
    reducer: (_current, update) => update,
    default: () => [],
  }),
  productCandidates: Annotation<KenzaState["productCandidates"]>({
    reducer: (_current, update) => update,
    default: () => [],
  }),
  validation: Annotation<KenzaState["validation"]>({
    reducer: (_current, update) => update,
    default: () => null,
  }),
  pricing: Annotation<KenzaState["pricing"]>({
    reducer: (_current, update) => update,
    default: () => null,
  }),
  explanation: Annotation<KenzaState["explanation"]>({
    reducer: (_current, update) => update,
    default: () => "",
  }),
  order: Annotation<KenzaState["order"]>({
    reducer: (_current, update) => update,
    default: () => null,
  }),
  requiresEscalation: Annotation<KenzaState["requiresEscalation"]>({
    reducer: (_current, update) => update,
    default: () => false,
  }),
  escalationReasons: Annotation<KenzaState["escalationReasons"]>({
    reducer: (_current, update) => update,
    default: () => [],
  }),
  report: Annotation<KenzaState["report"]>({
    reducer: (_current, update) => update,
    default: () => "",
  }),
  error: Annotation<KenzaState["error"]>({
    reducer: (_current, update) => update,
    default: () => null,
  }),
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Builds a fresh KenzaState for a new inbound message (requestId -> conversationId). */
export function createInitialState(
  requestId: string,
  customerPhone: string,
  rawInput: string,
): KenzaState {
  return {
    customerPhone,
    conversationId: requestId,
    rawMessage: rawInput,
    messages: [],
    intent: "unknown",
    intentConfidence: 0,
    cart: [],
    searchResults: [],
    productCandidates: [],
    validation: null,
    pricing: null,
    explanation: "",
    order: null,
    requiresEscalation: false,
    escalationReasons: [],
    report: "",
    error: null,
  };
}

/** Sums quantity * unitPriceMad across the cart, net of any per-item discountPercent. */
export function updateCartTotal(cart: KenzaCartItem[]): number {
  return cart.reduce((total, item) => {
    const unitPrice = item.unitPriceMad ?? 0;
    const lineTotal = unitPrice * item.quantity;
    const discount = item.discountPercent ? (lineTotal * item.discountPercent) / 100 : 0;
    return total + (lineTotal - discount);
  }, 0);
}

/** Returns a new cart with the item appended, merging quantity if the same productId+size is already present. */
export function addItemToCart(
  cart: KenzaCartItem[],
  productId: string,
  name: string,
  price: number,
  quantity: number,
  size?: string,
): KenzaCartItem[] {
  const existingIndex = cart.findIndex(
    (item) => item.productId === productId && item.size === size,
  );

  if (existingIndex === -1) {
    return [
      ...cart,
      size !== undefined
        ? { productId, name, unitPriceMad: price, quantity, size }
        : { productId, name, unitPriceMad: price, quantity },
    ];
  }

  return cart.map((item, index) =>
    index === existingIndex ? { ...item, quantity: item.quantity + quantity } : item,
  );
}

/** Applies a discount percent (capped at maxPercent) to every item in the cart. */
export function applyDiscount(
  cart: KenzaCartItem[],
  percent: number,
  maxPercent: number = 10,
): KenzaCartItem[] {
  const subtotal = updateCartTotal(cart);
  const { applied } = capDiscountPercent(subtotal, percent, maxPercent);
  return cart.map((item) => ({ ...item, discountPercent: applied }));
}

export interface KenzaCartValidationResult {
  valid: boolean;
  errors: string[];
}

/** Structural validation of the cart's own data (not stock — that's the validator node's job). */
export function validateCart(cart: KenzaCartItem[]): KenzaCartValidationResult {
  const errors: string[] = [];

  if (cart.length === 0) {
    errors.push("Cart is empty");
  }

  for (const item of cart) {
    if (!item.productId) {
      errors.push("Cart item is missing a productId");
    }
    if (!Number.isInteger(item.quantity) || item.quantity <= 0) {
      errors.push(`Invalid quantity for ${item.productId || "unknown item"}: ${item.quantity}`);
    }
    if (item.unitPriceMad !== undefined && item.unitPriceMad < 0) {
      errors.push(`Invalid unitPriceMad for ${item.productId}: ${item.unitPriceMad}`);
    }
    if (item.discountPercent !== undefined && (item.discountPercent < 0 || item.discountPercent > 100)) {
      errors.push(`Invalid discountPercent for ${item.productId}: ${item.discountPercent}`);
    }
  }

  return { valid: errors.length === 0, errors };
}
