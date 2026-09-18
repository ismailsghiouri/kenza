import { END, START } from "@langchain/langgraph";
import type { StateGraph } from "@langchain/langgraph";
import type { StateAnnotation } from "./state";

type KenzaGraphState = typeof StateAnnotation.State;

// Node names as wired up in ./graph.ts — kept as a literal union so the
// builder passed to addKenzaEdges is checked against the real node set.
export type KenzaNodeName =
  | "ingestor"
  | "classifier"
  | "search"
  | "validator"
  | "calculator"
  | "explainer"
  | "checkout"
  | "reporter";

export type KenzaGraphBuilder = StateGraph<
  typeof StateAnnotation.spec,
  KenzaGraphState,
  Partial<KenzaGraphState>,
  KenzaNodeName | typeof START
>;

// ---------------------------------------------------------------------------
// Conditional routing
// ---------------------------------------------------------------------------

/**
 * classifier -> {search, validator, checkout, reporter, explainer}
 *
 * "escalation" is a mandatory hand-off (politique-commerciale.md): it skips
 * validator/calculator entirely and goes straight to reporter, which is
 * responsible for creating the escalation record.
 */
export function routeAfterClassifier(
  state: KenzaGraphState,
): "search" | "validator" | "reporter" | "explainer" {
  switch (state.intent) {
    case "search":
    case "product_info":
      return "search";
    case "add_to_cart":
    case "apply_discount":
    case "checkout":
      // checkout still needs cart/stock validation + pricing before the
      // checkout node places an order, so it flows through validator too.
      return "validator";
    case "escalation":
      return "reporter";
    default:
      return "explainer";
  }
}

/**
 * validator -> {calculator, explainer}
 *
 * An invalid cart (stock issue, unknown delivery zone, discount above the
 * policy cap) never reaches the calculator — it goes straight to explainer
 * so the customer gets an error/escalation message.
 */
export function routeAfterValidator(state: KenzaGraphState): "calculator" | "explainer" {
  return state.validation?.valid ? "calculator" : "explainer";
}

/**
 * calculator -> {reporter, checkout, explainer}
 *
 * requiresEscalation (mandatory hand-off flagged during validation) takes
 * priority over the normal flow and routes straight to reporter, which
 * creates the escalation entry instead of a regular explanation.
 */
export function routeAfterCalculator(
  state: KenzaGraphState,
): "reporter" | "checkout" | "explainer" {
  if (state.requiresEscalation) return "reporter";
  return state.intent === "checkout" ? "checkout" : "explainer";
}

// ---------------------------------------------------------------------------
// Wiring — entry point, fixed edges and conditional edges
// ---------------------------------------------------------------------------

/**
 * Applies Kenza's transitions to a builder that already has all 8 nodes
 * added (see buildKenzaGraph in ./graph.ts). Kept separate from node
 * wiring so routing can be read/tested independently of node implementations.
 */
export function addKenzaEdges(graph: KenzaGraphBuilder): KenzaGraphBuilder {
  return graph
    .setEntryPoint("ingestor")
    .addEdge("ingestor", "classifier")
    .addConditionalEdges("classifier", routeAfterClassifier)
    .addEdge("search", "explainer")
    .addConditionalEdges("validator", routeAfterValidator)
    .addConditionalEdges("calculator", routeAfterCalculator)
    .addEdge("checkout", "reporter")
    .addEdge("explainer", "reporter")
    .addEdge("reporter", END);
}
