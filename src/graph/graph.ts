import { StateGraph } from "@langchain/langgraph";
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
import { addKenzaEdges } from "./edges";

export function buildKenzaGraph(deps: Partial<KenzaGraphDeps> = {}) {
  const graph = new StateGraph(StateAnnotation)
    .addNode("ingestor", ingestorNode)
    .addNode("classifier", createClassifierNode(deps.classifier))
    .addNode("search", createSearchNode(deps.search))
    .addNode("validator", createValidatorNode(deps.validator))
    .addNode("calculator", createCalculatorNode(deps.calculator))
    .addNode("explainer", createExplainerNode(deps.explainer))
    .addNode("checkout", createCheckoutNode(deps.checkout))
    .addNode("reporter", reporterNode);

  return addKenzaEdges(graph).compile();
}

export const kenzaGraph = buildKenzaGraph();
