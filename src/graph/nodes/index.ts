import { checkStockAvailability } from "@/domain/eligibility";
import { calculateOrderTotal, formatPriceCents } from "@/domain/pricing";
import type {
  KenzaCartItem,
  KenzaIntent,
  KenzaOrderResult,
  KenzaProductResult,
  KenzaState,
  StateAnnotation,
} from "../state";

export type KenzaNodeState = typeof StateAnnotation.State;
export type KenzaNodeResult = Partial<KenzaState>;

// ---------------------------------------------------------------------------
// 1. ingestor — normalizes the inbound message into the conversation history
// ---------------------------------------------------------------------------

export function ingestorNode(state: KenzaNodeState): KenzaNodeResult {
  return {
    messages: [{ role: "user", content: state.rawMessage }],
  };
}

// ---------------------------------------------------------------------------
// 2. classifier — labels the customer's intent
// ---------------------------------------------------------------------------

export interface ClassifierDeps {
  classify: (message: string) => Promise<KenzaIntent>;
}

const KNOWN_INTENTS: readonly KenzaIntent[] = ["search", "checkout", "question", "unknown"];

async function defaultClassify(message: string): Promise<KenzaIntent> {
  const { anthropic, CLAUDE_MODEL } = await import("@/lib/claude");

  const response = await anthropic.messages.create({
    model: CLAUDE_MODEL,
    max_tokens: 16,
    messages: [
      {
        role: "user",
        content: `Classify this customer message with exactly one word: search, checkout, question, or unknown.\n\nMessage: "${message}"`,
      },
    ],
  });

  const textBlock = response.content.find((block) => block.type === "text");
  const label = textBlock?.type === "text" ? textBlock.text.trim().toLowerCase() : "unknown";

  return (KNOWN_INTENTS as readonly string[]).includes(label) ? (label as KenzaIntent) : "unknown";
}

export function createClassifierNode(deps: Partial<ClassifierDeps> = {}) {
  const classify = deps.classify ?? defaultClassify;

  return async function classifierNode(state: KenzaNodeState): Promise<KenzaNodeResult> {
    const intent = await classify(state.rawMessage);
    return { intent };
  };
}

// ---------------------------------------------------------------------------
// 3. search — looks up matching products
// ---------------------------------------------------------------------------

export interface SearchDeps {
  search: (query: string) => Promise<KenzaProductResult[]>;
}

async function defaultSearch(query: string): Promise<KenzaProductResult[]> {
  const { searchProducts } = await import("@/agent/tools");
  const rows = await searchProducts(query);
  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    priceCents: row.priceCents,
    stock: row.stock,
  }));
}

export function createSearchNode(deps: Partial<SearchDeps> = {}) {
  const search = deps.search ?? defaultSearch;

  return async function searchNode(state: KenzaNodeState): Promise<KenzaNodeResult> {
    const searchResults = await search(state.rawMessage);
    return { searchResults };
  };
}

// ---------------------------------------------------------------------------
// 4. validator — checks cart items against available stock
// ---------------------------------------------------------------------------

export interface ValidatorDeps {
  getStock: (productIds: string[]) => Promise<Array<{ id: string; stock: number }>>;
}

async function defaultGetStock(productIds: string[]): Promise<Array<{ id: string; stock: number }>> {
  if (productIds.length === 0) {
    return [];
  }

  const { db } = await import("@/db/client");
  const { products } = await import("@/db/schema");
  const { inArray } = await import("drizzle-orm");

  const rows = await db.select().from(products).where(inArray(products.id, productIds));
  return rows.map((row) => ({ id: row.id, stock: row.stock }));
}

export function createValidatorNode(deps: Partial<ValidatorDeps> = {}) {
  const getStock = deps.getStock ?? defaultGetStock;

  return async function validatorNode(state: KenzaNodeState): Promise<KenzaNodeResult> {
    if (state.cart.length === 0) {
      return { validation: { valid: false, issues: [] } };
    }

    const stock = await getStock(state.cart.map((item) => item.productId));
    const issues = checkStockAvailability(state.cart, stock);

    return { validation: { valid: issues.length === 0, issues } };
  };
}

// ---------------------------------------------------------------------------
// 5. explainer — drafts the reply sent back to the customer
// ---------------------------------------------------------------------------

export interface ExplainerDeps {
  explain: (state: KenzaNodeState) => Promise<string>;
}

async function defaultExplain(state: KenzaNodeState): Promise<string> {
  const { anthropic, CLAUDE_MODEL } = await import("@/lib/claude");

  const context = JSON.stringify({
    intent: state.intent,
    rawMessage: state.rawMessage,
    searchResults: state.searchResults,
    validation: state.validation,
  });

  const response = await anthropic.messages.create({
    model: CLAUDE_MODEL,
    max_tokens: 512,
    messages: [
      {
        role: "user",
        content: `You are Kenza, a WhatsApp shopping assistant. Write a short, friendly reply to the customer given this context:\n${context}`,
      },
    ],
  });

  const textBlock = response.content.find((block) => block.type === "text");
  return textBlock?.type === "text" ? textBlock.text : "";
}

export function createExplainerNode(deps: Partial<ExplainerDeps> = {}) {
  const explain = deps.explain ?? defaultExplain;

  return async function explainerNode(state: KenzaNodeState): Promise<KenzaNodeResult> {
    const explanation = await explain(state);
    return {
      explanation,
      messages: [{ role: "assistant", content: explanation }],
    };
  };
}

// ---------------------------------------------------------------------------
// 6. checkout — places the order once the cart has been validated
// ---------------------------------------------------------------------------

export interface CheckoutDeps {
  placeOrder: (cart: KenzaCartItem[], customerPhone: string) => Promise<KenzaOrderResult>;
}

async function defaultPlaceOrder(
  cart: KenzaCartItem[],
  customerPhone: string,
): Promise<KenzaOrderResult> {
  const { db } = await import("@/db/client");
  const { customers, products, orders, orderItems } = await import("@/db/schema");
  const { eq, inArray } = await import("drizzle-orm");

  const [customer] = await db.select().from(customers).where(eq(customers.phone, customerPhone));
  if (!customer) {
    throw new Error(`Unknown customer phone: ${customerPhone}`);
  }

  const productRows = await db
    .select()
    .from(products)
    .where(
      inArray(
        products.id,
        cart.map((item) => item.productId),
      ),
    );
  const priceById = new Map(productRows.map((row) => [row.id, row.priceCents]));

  const lineItems = cart.map((item) => ({
    productId: item.productId,
    quantity: item.quantity,
    unitPriceCents: priceById.get(item.productId) ?? 0,
  }));

  const { totalCents } = calculateOrderTotal(
    lineItems.map((item) => ({ unitPriceCents: item.unitPriceCents, quantity: item.quantity })),
  );

  const [order] = await db
    .insert(orders)
    .values({ customerId: customer.id, totalCents, status: "confirmed" })
    .returning();

  if (!order) {
    throw new Error("Failed to create order");
  }

  await db.insert(orderItems).values(
    lineItems.map((item) => ({
      orderId: order.id,
      productId: item.productId,
      quantity: item.quantity,
      unitPriceCents: item.unitPriceCents,
    })),
  );

  return { orderId: order.id, status: order.status, totalCents: order.totalCents };
}

export function createCheckoutNode(deps: Partial<CheckoutDeps> = {}) {
  const placeOrder = deps.placeOrder ?? defaultPlaceOrder;

  return async function checkoutNode(state: KenzaNodeState): Promise<KenzaNodeResult> {
    const order = await placeOrder(state.cart, state.customerPhone);
    const confirmation = `Order ${order.orderId} confirmed (${formatPriceCents(order.totalCents)}).`;

    return {
      order,
      messages: [{ role: "assistant", content: confirmation }],
    };
  };
}

// ---------------------------------------------------------------------------
// 7. reporter — summarizes what happened during this run
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

  return { report: parts.join(" | ") };
}

export interface KenzaGraphDeps {
  classifier: Partial<ClassifierDeps>;
  search: Partial<SearchDeps>;
  validator: Partial<ValidatorDeps>;
  explainer: Partial<ExplainerDeps>;
  checkout: Partial<CheckoutDeps>;
}
