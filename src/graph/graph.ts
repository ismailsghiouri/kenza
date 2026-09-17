import { StateGraph, START, END } from "@langchain/langgraph";
import { StateAnnotation } from "./state";
import {
  ingestorNode,
  reporterNode,
  createClassifierNode,
  createSearchNode,
  createValidatorNode,
  createExplainerNode,
  createCheckoutNode,
} from "./nodes";
import type { KenzaGraphDeps } from "./nodes";

type KenzaGraphState = typeof StateAnnotation.State;

function routeByIntent(state: KenzaGraphState): "search" | "checkout" | "explainer" {
  if (state.intent === "search") return "search";
  if (state.intent === "checkout") return "checkout";
  return "explainer";
}

function routeByValidation(state: KenzaGraphState): "valid" | "invalid" {
  return state.validation?.valid ? "valid" : "invalid";
}

export function buildKenzaGraph(deps: Partial<KenzaGraphDeps> = {}) {
  const graph = new StateGraph(StateAnnotation)
    .addNode("ingestor", ingestorNode)
    .addNode("classifier", createClassifierNode(deps.classifier))
    .addNode("search", createSearchNode(deps.search))
    .addNode("validator", createValidatorNode(deps.validator))
    .addNode("explainer", createExplainerNode(deps.explainer))
    .addNode("checkout", createCheckoutNode(deps.checkout))
    .addNode("reporter", reporterNode)
    .addEdge(START, "ingestor")
    .addEdge("ingestor", "classifier")
    .addConditionalEdges("classifier", routeByIntent, {
      search: "search",
      checkout: "validator",
      explainer: "explainer",
    })
    .addEdge("search", "explainer")
    .addConditionalEdges("validator", routeByValidation, {
      valid: "checkout",
      invalid: "explainer",
    })
    .addEdge("checkout", "reporter")
    .addEdge("explainer", "reporter")
    .addEdge("reporter", END);

  return graph.compile();
}

export const kenzaGraph = buildKenzaGraph();
