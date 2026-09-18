import { StateGraph, START, END } from "@langchain/langgraph";
import { StateAnnotation } from "./state";
import {
  ingestorNode,
  reporterNode,
  createClassifierNode,
  createSearchNode,
  createValidatorNode,
  createCalculatorNode,
  createExplainerNode,
  createCheckoutNode,
} from "./nodes";
import type { KenzaGraphDeps } from "./nodes";

type KenzaGraphState = typeof StateAnnotation.State;

function routeByIntent(state: KenzaGraphState): "search" | "validator" | "explainer" {
  if (state.intent === "search" || state.intent === "product_info") return "search";
  if (state.intent === "add_to_cart" || state.intent === "checkout" || state.intent === "apply_discount") {
    return "validator";
  }
  return "explainer";
}

function routeByValidation(state: KenzaGraphState): "valid" | "invalid" {
  return state.validation?.valid ? "valid" : "invalid";
}

function routeAfterCalculator(state: KenzaGraphState): "checkout" | "explainer" {
  return state.intent === "checkout" ? "checkout" : "explainer";
}

export function buildKenzaGraph(deps: Partial<KenzaGraphDeps> = {}) {
  const graph = new StateGraph(StateAnnotation)
    .addNode("ingestor", ingestorNode)
    .addNode("classifier", createClassifierNode(deps.classifier))
    .addNode("search", createSearchNode(deps.search))
    .addNode("validator", createValidatorNode(deps.validator))
    .addNode("calculator", createCalculatorNode(deps.calculator))
    .addNode("explainer", createExplainerNode(deps.explainer))
    .addNode("checkout", createCheckoutNode(deps.checkout))
    .addNode("reporter", reporterNode)
    .addEdge(START, "ingestor")
    .addEdge("ingestor", "classifier")
    .addConditionalEdges("classifier", routeByIntent, {
      search: "search",
      validator: "validator",
      explainer: "explainer",
    })
    .addEdge("search", "explainer")
    .addConditionalEdges("validator", routeByValidation, {
      valid: "calculator",
      invalid: "explainer",
    })
    .addConditionalEdges("calculator", routeAfterCalculator, {
      checkout: "checkout",
      explainer: "explainer",
    })
    .addEdge("checkout", "reporter")
    .addEdge("explainer", "reporter")
    .addEdge("reporter", END);

  return graph.compile();
}

export const kenzaGraph = buildKenzaGraph();
