import { StateGraph, END, START, Annotation } from "@langchain/langgraph";
import { getAnthropicClient, CLAUDE_MODEL } from "@/lib/claude";
import type { AgentState } from "@/types";

const AgentStateAnnotation = Annotation.Root({
  customerPhone: Annotation<string>,
  conversationId: Annotation<string>,
  messages: Annotation<AgentState["messages"]>({
    reducer: (current, update) => current.concat(update),
    default: () => [],
  }),
  cart: Annotation<AgentState["cart"]>({
    reducer: (_current, update) => update,
    default: () => [],
  }),
});

async function respond(state: typeof AgentStateAnnotation.State) {
  const response = await getAnthropicClient().messages.create({
    model: CLAUDE_MODEL,
    max_tokens: 1024,
    messages: state.messages.map((m) => ({ role: m.role, content: m.content })),
  });

  const textBlock = response.content.find((block) => block.type === "text");

  return {
    messages: [
      { role: "assistant" as const, content: textBlock?.type === "text" ? textBlock.text : "" },
    ],
  };
}

const graph = new StateGraph(AgentStateAnnotation)
  .addNode("respond", respond)
  .addEdge(START, "respond")
  .addEdge("respond", END);

export const kenzaAgent = graph.compile();
