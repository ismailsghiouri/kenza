import { Annotation } from "@langchain/langgraph";
import type { OrderStatus, StockIssue } from "@/domain/eligibility";

export type KenzaIntent = "search" | "checkout" | "question" | "unknown";

export type KenzaMessageRole = "user" | "assistant";

export interface KenzaMessage {
  role: KenzaMessageRole;
  content: string;
}

export interface KenzaCartItem {
  productId: string;
  quantity: number;
}

export interface KenzaProductResult {
  id: string;
  name: string;
  priceMad: number;
  stock: number;
}

export interface KenzaValidationResult {
  valid: boolean;
  issues: StockIssue[];
}

export interface KenzaOrderResult {
  orderId: string;
  status: OrderStatus;
  totalMad: number;
}

export interface KenzaState {
  customerPhone: string;
  conversationId: string;
  rawMessage: string;
  messages: KenzaMessage[];
  intent: KenzaIntent;
  cart: KenzaCartItem[];
  searchResults: KenzaProductResult[];
  validation: KenzaValidationResult | null;
  explanation: string;
  order: KenzaOrderResult | null;
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
  cart: Annotation<KenzaState["cart"]>({
    reducer: (_current, update) => update,
    default: () => [],
  }),
  searchResults: Annotation<KenzaState["searchResults"]>({
    reducer: (_current, update) => update,
    default: () => [],
  }),
  validation: Annotation<KenzaState["validation"]>({
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
  report: Annotation<KenzaState["report"]>({
    reducer: (_current, update) => update,
    default: () => "",
  }),
  error: Annotation<KenzaState["error"]>({
    reducer: (_current, update) => update,
    default: () => null,
  }),
});
