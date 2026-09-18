import { StateGraph } from "@langchain/langgraph";
import type { BaseCheckpointSaver } from "@langchain/langgraph";
import { PostgresSaver } from "@langchain/langgraph-checkpoint-postgres";
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

export function buildKenzaGraph(
  deps: Partial<KenzaGraphDeps> = {},
  checkpointer?: BaseCheckpointSaver,
) {
  const graph = new StateGraph(StateAnnotation)
    .addNode("ingestor", ingestorNode)
    .addNode("classifier", createClassifierNode(deps.classifier))
    .addNode("search", createSearchNode(deps.search))
    .addNode("validator", createValidatorNode(deps.validator))
    .addNode("calculator", createCalculatorNode(deps.calculator))
    .addNode("explainer", createExplainerNode(deps.explainer))
    .addNode("checkout", createCheckoutNode(deps.checkout))
    .addNode("reporter", reporterNode);

  const wired = addKenzaEdges(graph);
  return checkpointer ? wired.compile({ checkpointer }) : wired.compile();
}

// ---------------------------------------------------------------------------
// PostgreSQL checkpointer — persists conversation state per thread_id
// (conversationId) so a WhatsApp exchange can resume across separate
// webhook invocations.
// ---------------------------------------------------------------------------

const connectionString = process.env["DATABASE_URL"];

if (!connectionString) {
  throw new Error("DATABASE_URL is not set");
}

export const checkpointer = PostgresSaver.fromConnString(connectionString);

let checkpointerReady: Promise<void> | null = null;

/**
 * Creates the checkpoint tables if they don't exist yet. Idempotent — call
 * once at process startup (e.g. in the webhook route) before the first
 * kenzaGraph.invoke()/stream().
 */
export function ensureCheckpointerReady(): Promise<void> {
  if (!checkpointerReady) {
    checkpointerReady = checkpointer.setup();
  }
  return checkpointerReady;
}

export const kenzaGraph = buildKenzaGraph({}, checkpointer);
