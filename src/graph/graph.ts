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

let lazyCheckpointer: PostgresSaver | undefined;

function getCheckpointer(): PostgresSaver {
  if (!lazyCheckpointer) {
    const connectionString = process.env["DATABASE_URL"];
    if (!connectionString) {
      throw new Error("DATABASE_URL is not set");
    }
    lazyCheckpointer = PostgresSaver.fromConnString(connectionString);
  }
  return lazyCheckpointer;
}

// Proxy defers connecting/validating DATABASE_URL until the checkpointer is
// actually used, so importing this module (e.g. during `next build`'s page-data
// collection) doesn't require a database connection to be configured.
export const checkpointer: PostgresSaver = new Proxy({} as PostgresSaver, {
  get(_target, prop, receiver) {
    return Reflect.get(getCheckpointer(), prop, receiver);
  },
});

let checkpointerReady: Promise<void> | null = null;

/**
 * Creates the checkpoint tables if they don't exist yet. Idempotent — call
 * once at process startup (e.g. in the webhook route) before the first
 * kenzaGraph.invoke()/stream().
 */
export function ensureCheckpointerReady(): Promise<void> {
  if (!checkpointerReady) {
    checkpointerReady = checkpointer.setup().catch((err: unknown) => {
      checkpointerReady = null;
      throw err;
    });
  }
  return checkpointerReady;
}

export const kenzaGraph = buildKenzaGraph({}, checkpointer);
